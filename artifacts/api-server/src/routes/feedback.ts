import { Router } from "express";
import { db } from "@workspace/db";
import { feedbackQuestionsTable, feedbackAnswersTable } from "@workspace/db";
import { SaveFeedbackAnswerBody, GetFeedbackAnswersQueryParams } from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";

const router = Router();

const DEFAULT_QUESTIONS = [
  { id: 1, question: "Hoe voelde je je deze week qua energie en herstel?", order: 1 },
  { id: 2, question: "Welke training ging het beste en waarom?", order: 2 },
  { id: 3, question: "Zijn er oefeningen waarbij je progressie hebt geboekt of die moeizamer gingen?", order: 3 },
  { id: 4, question: "Wat wil je volgende week anders aanpakken of verbeteren?", order: 4 },
];

async function ensureQuestionsSeeded() {
  const existing = await db.select().from(feedbackQuestionsTable);
  if (existing.length === 0) {
    await db.insert(feedbackQuestionsTable).values(DEFAULT_QUESTIONS);
    return DEFAULT_QUESTIONS;
  }
  return existing;
}

export const feedbackQuestionsRouter = Router();
feedbackQuestionsRouter.get("/", async (req, res) => {
  try {
    const questions = await ensureQuestionsSeeded();
    res.json(questions.sort((a, b) => a.order - b.order));
  } catch (err) {
    req.log.error({ err }, "Failed to get feedback questions");
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/", async (req, res) => {
  try {
    const parsed = GetFeedbackAnswersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Weeknummer is vereist" });
    }
    const { weekNumber } = parsed.data;
    const answers = await db
      .select()
      .from(feedbackAnswersTable)
      .where(eq(feedbackAnswersTable.weekNumber, weekNumber));
    res.json(answers);
  } catch (err) {
    req.log.error({ err }, "Failed to get feedback answers");
    res.status(500).json({ error: "Interne serverfout" });
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

    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to save feedback answer");
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
