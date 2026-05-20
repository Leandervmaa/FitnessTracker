import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const progressPhotosTable = pgTable("progress_photos", {
  id: serial("id").primaryKey(),
  weekNumber: integer("week_number").notNull(),
  angle: text("angle").notNull(), // "front" | "side" | "back"
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProgressPhotoSchema = createInsertSchema(progressPhotosTable).omit({
  id: true,
  uploadedAt: true,
});

export type InsertProgressPhoto = z.infer<typeof insertProgressPhotoSchema>;
export type ProgressPhoto = typeof progressPhotosTable.$inferSelect;
