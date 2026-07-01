import { Router } from "express";
import { db } from "@workspace/db";
import { feedbackQuestionsTable, feedbackAnswersTable } from "@workspace/db";
import { SaveFeedbackAnswerBody, GetFeedbackAnswersQueryParams } from "@workspace/api-zod";
import { getFeedbackQuestions, getFeedbackAnswers } from "../services/dataService.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getScopedClientId } from "../lib/auth.js";

const router = Router();

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

    return void res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to save feedback answer");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
