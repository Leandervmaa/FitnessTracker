import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { feedbackQuestionsTable, feedbackAnswersTable, trainerFeedbackTable } from "@workspace/db";
import { SaveFeedbackAnswerBody, GetFeedbackAnswersQueryParams } from "@workspace/api-zod";
import { getFeedbackQuestions, getFeedbackAnswers } from "../services/dataService.js";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getScopedClientId, requireTrainer } from "../lib/auth.js";
import { getClientLiveSheet } from "../services/clientSheetService.js";
import { syncFeedbackToSheet } from "../services/planningSheetService.js";
import { writeFeedbackToSheet } from "../services/sheetsParser.js";
import { notifyClients } from "./sync.js";

const router = Router();

function syncFeedback(req: Request, clientId: string) {
  void syncFeedbackToSheet(clientId).catch((err) => {
    req.log.warn({ err, clientId }, "Failed to sync feedback sheet");
  });
}

function cleanText(value: unknown): string {
  return String(value || "").trim();
}

function parseWeekNumber(value: unknown): number | null {
  const weekNumber = Number(value);
  if (!Number.isFinite(weekNumber) || weekNumber < 1) return null;
  return Math.round(weekNumber);
}

function normalizeVideoUrl(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function publicTrainerFeedback(row: typeof trainerFeedbackTable.$inferSelect) {
  return {
    id: row.id,
    clientId: row.clientId,
    weekNumber: row.weekNumber,
    title: row.title,
    body: row.body ?? "",
    videoUrl: row.videoUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function syncQuestionsFromData(clientId: string) {
  const questions = getFeedbackQuestions(clientId);
  const existing = await db.select().from(feedbackQuestionsTable);

  // If questions from Excel differ from DB, resync
  const needsSync =
    existing.length !== questions.length ||
    questions.some((q, i) => existing[i]?.question !== q.question);

  if (needsSync) {
    if (existing.length > 0) {
      // Clear and re-insert to keep in sync with Excel
      for (const q of existing) {
        await db.delete(feedbackQuestionsTable).where(eq(feedbackQuestionsTable.id, q.id));
      }
    }
    await db.insert(feedbackQuestionsTable).values(questions);
    return questions;
  }
  return existing;
}

export const feedbackQuestionsRouter = Router();
feedbackQuestionsRouter.get("/", async (req, res) => {
  try {
    const questions = await syncQuestionsFromData(getScopedClientId(req));
    return void res.json(questions.sort((a, b) => a.order - b.order));
  } catch (err) {
    req.log.error({ err }, "Failed to get feedback questions");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

async function syncAnswersForWeek(weekNumber: number, clientId: string) {
  try {
    const excelAnswers = getFeedbackAnswers(clientId).filter((a) => a.weekNumber === weekNumber);
    if (excelAnswers.length === 0) return;

    const existing = await db
      .select()
      .from(feedbackAnswersTable)
      .where(and(eq(feedbackAnswersTable.weekNumber, weekNumber), eq(feedbackAnswersTable.clientId, clientId)));

    for (const ea of excelAnswers) {
      const hasDbAnswer = existing.some((dbAns) => dbAns.questionId === ea.questionId);
      if (!hasDbAnswer) {
        await db.insert(feedbackAnswersTable).values({
          weekNumber,
          clientId,
          questionId: ea.questionId,
          answer: ea.answer,
        });
      }
    }
  } catch (err) {
    logger.error({ err, weekNumber }, "Failed to sync feedback answers from Excel");
  }
}

router.get("/trainer", async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const weekNumber = parseWeekNumber(req.query.weekNumber);
    const conditions = [eq(trainerFeedbackTable.clientId, clientId)];
    if (weekNumber) conditions.push(eq(trainerFeedbackTable.weekNumber, weekNumber));

    const feedback = await db
      .select()
      .from(trainerFeedbackTable)
      .where(and(...conditions))
      .orderBy(desc(trainerFeedbackTable.weekNumber), desc(trainerFeedbackTable.updatedAt));

    return void res.json(feedback.map(publicTrainerFeedback));
  } catch (err) {
    req.log.error({ err }, "Failed to list trainer feedback");
    return void res.status(500).json({ error: "Coach-feedback ophalen mislukt" });
  }
});

router.post("/trainer", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const weekNumber = parseWeekNumber(req.body?.weekNumber);
    const title = cleanText(req.body?.title);
    const body = cleanText(req.body?.body);
    const videoUrl = normalizeVideoUrl(req.body?.videoUrl);

    if (!weekNumber) return void res.status(400).json({ error: "Weeknummer is verplicht" });
    if (!title) return void res.status(400).json({ error: "Titel is verplicht" });
    if (!body && !videoUrl) return void res.status(400).json({ error: "Voeg tekst of een videolink toe" });
    if (cleanText(req.body?.videoUrl) && !videoUrl) return void res.status(400).json({ error: "Videolink is ongeldig" });

    const [existing] = await db
      .select()
      .from(trainerFeedbackTable)
      .where(and(eq(trainerFeedbackTable.clientId, clientId), eq(trainerFeedbackTable.weekNumber, weekNumber)))
      .orderBy(desc(trainerFeedbackTable.updatedAt));

    const values = {
      title,
      body: body || null,
      videoUrl,
      updatedAt: new Date(),
    };

    const [saved] = existing
      ? await db
          .update(trainerFeedbackTable)
          .set(values)
          .where(eq(trainerFeedbackTable.id, existing.id))
          .returning()
      : await db
          .insert(trainerFeedbackTable)
          .values({
            clientId,
            weekNumber,
            ...values,
          })
          .returning();

    notifyClients("trainer_feedback_updated", { clientId, weekNumber });
    return void res.status(existing ? 200 : 201).json(publicTrainerFeedback(saved));
  } catch (err) {
    req.log.error({ err }, "Failed to save trainer feedback");
    return void res.status(500).json({ error: "Coach-feedback opslaan mislukt" });
  }
});

router.delete("/trainer/:id", requireTrainer, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return void res.status(400).json({ error: "Ongeldig feedback-ID" });

    const clientId = getScopedClientId(req);
    const [deleted] = await db
      .delete(trainerFeedbackTable)
      .where(and(eq(trainerFeedbackTable.id, Math.round(id)), eq(trainerFeedbackTable.clientId, clientId)))
      .returning();

    if (!deleted) return void res.status(404).json({ error: "Coach-feedback niet gevonden" });

    notifyClients("trainer_feedback_updated", { clientId, weekNumber: deleted.weekNumber });
    return void res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete trainer feedback");
    return void res.status(500).json({ error: "Coach-feedback verwijderen mislukt" });
  }
});

router.get("/", async (req, res) => {
  try {
    const parsed = GetFeedbackAnswersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return void res.status(400).json({ error: "Weeknummer is vereist" });
    }
    const { weekNumber } = parsed.data;
    const clientId = getScopedClientId(req);
    await syncAnswersForWeek(weekNumber, clientId);
    const answers = await db
      .select()
      .from(feedbackAnswersTable)
      .where(and(eq(feedbackAnswersTable.weekNumber, weekNumber), eq(feedbackAnswersTable.clientId, clientId)));
    return void res.json(answers);
  } catch (err) {
    req.log.error({ err }, "Failed to get feedback answers");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/", async (req, res) => {
  try {
    const parsed = SaveFeedbackAnswerBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Ongeldige invoer" });
    }
    const { weekNumber, questionId, answer } = parsed.data;
    const clientId = getScopedClientId(req);

    const existing = await db
      .select()
      .from(feedbackAnswersTable)
      .where(
        and(
          eq(feedbackAnswersTable.weekNumber, weekNumber),
          eq(feedbackAnswersTable.questionId, questionId),
          eq(feedbackAnswersTable.clientId, clientId)
        )
      );

    let result: typeof feedbackAnswersTable.$inferSelect;

    if (existing.length > 0) {
      const [updated] = await db
        .update(feedbackAnswersTable)
        .set({ answer })
        .where(eq(feedbackAnswersTable.id, existing[0].id))
        .returning();
      result = updated;
    } else {
      const [created] = await db
        .insert(feedbackAnswersTable)
        .values({ weekNumber, clientId, questionId, answer })
        .returning();
      result = created;
    }

    try {
      const liveSheet = await getClientLiveSheet(clientId);
      if (liveSheet.spreadsheetId) {
        await writeFeedbackToSheet(weekNumber, questionId, answer, liveSheet.spreadsheetId);
      }
    } catch (e) {
      req.log.warn({ err: e }, "Failed to write feedback to live sheet");
    }

    syncFeedback(req, clientId);
    notifyClients("feedback_updated", { clientId, weekNumber });

    return void res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to save feedback answer");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
