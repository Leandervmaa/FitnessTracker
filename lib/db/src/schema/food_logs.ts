import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const foodLogsTable = pgTable("food_logs", {
  id: serial("id").primaryKey(),
  weekNumber: integer("week_number").notNull(),
  day: text("day").notNull(),               // "mon", "tue", ...

  // FatSecret identifiers
  fatSecretFoodId: text("fatsecret_food_id").notNull(),
  fatSecretServingId: text("fatsecret_serving_id").notNull(),

  // Display info
  foodName: text("food_name").notNull(),
  servingDescription: text("serving_description").notNull(),
  amountServings: numeric("amount_servings").notNull().default("1"),

  // Nutritional values (per logged amount)
  kcal: numeric("kcal"),
  eiwittenG: numeric("eiwitten_g"),
  koolhydratenG: numeric("koolhydraten_g"),
  vetenG: numeric("veten_g"),
  vezelG: numeric("vezel_g"),

  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFoodLogSchema = createInsertSchema(foodLogsTable).omit({
  id: true,
  loggedAt: true,
});

export type InsertFoodLog = z.infer<typeof insertFoodLogSchema>;
export type FoodLog = typeof foodLogsTable.$inferSelect;
