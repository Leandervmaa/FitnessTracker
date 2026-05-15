import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedbackQuestionsTable = pgTable("feedback_questions", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  order: integer("order").notNull(),
});

export const feedbackAnswersTable = pgTable("feedback_answers", {
  id: serial("id").primaryKey(),
  weekNumber: integer("week_number").notNull(),
  questionId: integer("question_id").notNull(),
  answer: text("answer").notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFeedbackAnswerSchema = createInsertSchema(feedbackAnswersTable).omit({
  id: true,
  answeredAt: true,
});

export type InsertFeedbackAnswer = z.infer<typeof insertFeedbackAnswerSchema>;
export type FeedbackAnswer = typeof feedbackAnswersTable.$inferSelect;
export type FeedbackQuestion = typeof feedbackQuestionsTable.$inferSelect;
