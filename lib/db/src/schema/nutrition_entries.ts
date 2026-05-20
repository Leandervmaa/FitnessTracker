import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nutritionEntriesTable = pgTable("nutrition_entries", {
  id: serial("id").primaryKey(),
  weekNumber: integer("week_number").notNull(),
  day: text("day").notNull(),
  dayLabel: text("day_label").notNull(),
  kcal: numeric("kcal", { precision: 7, scale: 1 }),
  eiwittenG: numeric("eiwitten_g", { precision: 6, scale: 1 }),
  koolhydratenG: numeric("koolhydraten_g", { precision: 6, scale: 1 }),
  vetenG: numeric("veten_g", { precision: 6, scale: 1 }),
  waterMl: numeric("water_ml", { precision: 7, scale: 0 }),
  slaapUren: numeric("slaap_uren", { precision: 4, scale: 1 }),
  stressNiveau: integer("stress_niveau"),
  energieNiveau: integer("energie_niveau"),
  lichaamsgewicht: numeric("lichaamsgewicht", { precision: 5, scale: 1 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertNutritionEntrySchema = createInsertSchema(nutritionEntriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNutritionEntry = z.infer<typeof insertNutritionEntrySchema>;
export type NutritionEntry = typeof nutritionEntriesTable.$inferSelect;
