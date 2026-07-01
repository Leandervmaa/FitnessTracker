import { pgTable, text, serial, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const exerciseLibraryTable = pgTable("exercise_library", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  videoUrl: text("video_url"),
  imageUrl: text("image_url"),
  notes: text("notes"),
  source: text("source"),
  sourceVideoId: text("source_video_id"),
  isGlobal: boolean("is_global").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const plannedWorkoutsTable = pgTable("planned_workouts", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  weekNumber: integer("week_number").notNull(),
  name: text("name").notNull(),
  dayLabel: text("day_label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const plannedWorkoutExercisesTable = pgTable("planned_workout_exercises", {
  id: text("id").primaryKey(),
  workoutId: text("workout_id").notNull(),
  clientId: text("client_id").notNull(),
  weekNumber: integer("week_number").notNull(),
  exerciseLibraryId: text("exercise_library_id"),
  name: text("name").notNull(),
  videoUrl: text("video_url"),
  imageUrl: text("image_url"),
  notes: text("notes"),
  sets: integer("sets").notNull().default(3),
  repRange: text("rep_range"),
  targetRpe: numeric("target_rpe", { precision: 3, scale: 1 }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const exerciseSetLogsTable = pgTable("exercise_set_logs", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull(),
  plannedWorkoutId: text("planned_workout_id").notNull(),
  plannedExerciseId: text("planned_exercise_id").notNull(),
  exerciseLibraryId: text("exercise_library_id"),
  weekNumber: integer("week_number").notNull(),
  setNumber: integer("set_number").notNull(),
  reps: integer("reps"),
  weight: numeric("weight", { precision: 7, scale: 2 }),
  rpe: numeric("rpe", { precision: 3, scale: 1 }),
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const nutritionTargetsTable = pgTable("nutrition_targets", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  dayLabel: text("day_label").notNull(),
  kcal: integer("kcal"),
  proteinG: integer("protein_g"),
  carbsG: integer("carbs_g"),
  fatG: integer("fat_g"),
  waterMl: integer("water_ml"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const trainingDayTemplatesTable = pgTable("training_day_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const trainingDayTemplateExercisesTable = pgTable("training_day_template_exercises", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull(),
  exerciseLibraryId: text("exercise_library_id"),
  name: text("name").notNull(),
  videoUrl: text("video_url"),
  imageUrl: text("image_url"),
  notes: text("notes"),
  sets: integer("sets").notNull().default(3),
  repRange: text("rep_range"),
  targetRpe: numeric("target_rpe", { precision: 3, scale: 1 }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExerciseLibrarySchema = createInsertSchema(exerciseLibraryTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertPlannedWorkoutSchema = createInsertSchema(plannedWorkoutsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertPlannedWorkoutExerciseSchema = createInsertSchema(plannedWorkoutExercisesTable).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertExerciseSetLogSchema = createInsertSchema(exerciseSetLogsTable).omit({
  id: true,
  completedAt: true,
  updatedAt: true,
});

export type ExerciseLibraryItem = typeof exerciseLibraryTable.$inferSelect;
export type InsertExerciseLibraryItem = z.infer<typeof insertExerciseLibrarySchema>;
export type PlannedWorkout = typeof plannedWorkoutsTable.$inferSelect;
export type PlannedWorkoutExercise = typeof plannedWorkoutExercisesTable.$inferSelect;
export type ExerciseSetLog = typeof exerciseSetLogsTable.$inferSelect;
export type NutritionTarget = typeof nutritionTargetsTable.$inferSelect;
