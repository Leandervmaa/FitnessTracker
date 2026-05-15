import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const exerciseLogsTable = pgTable("exercise_logs", {
  id: serial("id").primaryKey(),
  exerciseId: text("exercise_id").notNull(),
  workoutId: text("workout_id").notNull(),
  weekNumber: integer("week_number").notNull(),
  sets: integer("sets"),
  reps: text("reps"),
  weight: numeric("weight", { precision: 6, scale: 2 }),
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExerciseLogSchema = createInsertSchema(exerciseLogsTable).omit({
  id: true,
  completedAt: true,
});

export type InsertExerciseLog = z.infer<typeof insertExerciseLogSchema>;
export type ExerciseLog = typeof exerciseLogsTable.$inferSelect;
