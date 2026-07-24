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
  clientId: text("client_id"),
  weekNumber: integer("week_number").notNull(),
  questionId: integer("question_id").notNull(),
  answer: text("answer").notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainerFeedbackTable = pgTable("trainer_feedback", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  weekNumber: integer("week_number").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  videoUrl: text("video_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertFeedbackAnswerSchema = createInsertSchema(feedbackAnswersTable).omit({
  id: true,
  answeredAt: true,
});

export type InsertFeedbackAnswer = z.infer<typeof insertFeedbackAnswerSchema>;
export type FeedbackAnswer = typeof feedbackAnswersTable.$inferSelect;
export type FeedbackQuestion = typeof feedbackQuestionsTable.$inferSelect;
export type TrainerFeedback = typeof trainerFeedbackTable.$inferSelect;
