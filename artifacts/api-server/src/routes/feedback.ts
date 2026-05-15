import { Router } from "express";
import { db } from "@workspace/db";
import { feedbackQuestionsTable, feedbackAnswersTable } from "@workspace/db";
import { SaveFeedbackAnswerBody, GetFeedbackAnswersQueryParams } from "@workspace/api-zod";
import { getFeedbackQuestions } from "../services/dataService.js";
import { eq, and } from "drizzle-orm";

const router = Router();

async function syncQuestionsFromData() {
  const questions = getFeedbackQuestions();
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
    const questions = await syncQuestionsFromData();
    return void res.json(questions.sort((a, b) => a.order - b.order));
  } catch (err) {
    req.log.error({ err }, "Failed to get feedback questions");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/", async (req, res) => {
  try {
    const parsed = GetFeedbackAnswersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return void res.status(400).json({ error: "Weeknummer is vereist" });
    }
    const { weekNumber } = parsed.data;
    const answers = await db
      .select()
      .from(feedbackAnswersTable)
      .where(eq(feedbackAnswersTable.weekNumber, weekNumber));
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

    const existing = await db
      .select()
      .from(feedbackAnswersTable)
      .where(
        and(
          eq(feedbackAnswersTable.weekNumber, weekNumber),
          eq(feedbackAnswersTable.questionId, questionId)
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
        .values({ weekNumber, questionId, answer })
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
