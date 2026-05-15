import { Router } from "express";
import { db } from "@workspace/db";
import { nutritionEntriesTable } from "@workspace/db";
import { CreateNutritionEntryBody, UpdateNutritionEntryBody, UpdateNutritionEntryParams, GetNutritionEntriesQueryParams } from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const parsed = GetNutritionEntriesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Ongeldige parameters" });
    }

    const { weekNumber, day } = parsed.data;

    let query = db.select().from(nutritionEntriesTable).$dynamic();

    const conditions = [];
    if (weekNumber !== undefined) conditions.push(eq(nutritionEntriesTable.weekNumber, weekNumber));
    if (day) conditions.push(eq(nutritionEntriesTable.day, day));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const entries = await query;

    const result = entries.map((e) => ({
      ...e,
      kcal: e.kcal ? parseFloat(e.kcal) : null,
      eiwittenG: e.eiwittenG ? parseFloat(e.eiwittenG) : null,
      koolhydratenG: e.koolhydratenG ? parseFloat(e.koolhydratenG) : null,
      vetenG: e.vetenG ? parseFloat(e.vetenG) : null,
      waterMl: e.waterMl ? parseFloat(e.waterMl) : null,
    }));

    return void res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get nutrition entries");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/", async (req, res) => {
  try {
    const parsed = CreateNutritionEntryBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Ongeldige invoer" });
    }

    const { weekNumber, day, dayLabel, kcal, eiwittenG, koolhydratenG, vetenG, waterMl, notes } = parsed.data;

    const existing = await db
      .select()
      .from(nutritionEntriesTable)
      .where(
        and(
          eq(nutritionEntriesTable.weekNumber, weekNumber),
          eq(nutritionEntriesTable.day, day)
        )
      );

    let entry: typeof nutritionEntriesTable.$inferSelect;

    if (existing.length > 0) {
      const [updated] = await db
        .update(nutritionEntriesTable)
        .set({
          dayLabel,
          kcal: kcal !== undefined && kcal !== null ? String(kcal) : null,
          eiwittenG: eiwittenG !== undefined && eiwittenG !== null ? String(eiwittenG) : null,
          koolhydratenG: koolhydratenG !== undefined && koolhydratenG !== null ? String(koolhydratenG) : null,
          vetenG: vetenG !== undefined && vetenG !== null ? String(vetenG) : null,
          waterMl: waterMl !== undefined && waterMl !== null ? String(waterMl) : null,
          notes: notes ?? null,
        })
        .where(eq(nutritionEntriesTable.id, existing[0].id))
        .returning();
      entry = updated;
    } else {
      const [created] = await db
        .insert(nutritionEntriesTable)
        .values({
          weekNumber,
          day,
          dayLabel,
          kcal: kcal !== undefined && kcal !== null ? String(kcal) : null,
          eiwittenG: eiwittenG !== undefined && eiwittenG !== null ? String(eiwittenG) : null,
          koolhydratenG: koolhydratenG !== undefined && koolhydratenG !== null ? String(koolhydratenG) : null,
          vetenG: vetenG !== undefined && vetenG !== null ? String(vetenG) : null,
          waterMl: waterMl !== undefined && waterMl !== null ? String(waterMl) : null,
          notes: notes ?? null,
        })
        .returning();
      entry = created;
    }

    return void res.status(201).json({
      ...entry,
      kcal: entry.kcal ? parseFloat(entry.kcal) : null,
      eiwittenG: entry.eiwittenG ? parseFloat(entry.eiwittenG) : null,
      koolhydratenG: entry.koolhydratenG ? parseFloat(entry.koolhydratenG) : null,
      vetenG: entry.vetenG ? parseFloat(entry.vetenG) : null,
      waterMl: entry.waterMl ? parseFloat(entry.waterMl) : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create nutrition entry");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const paramsParsed = UpdateNutritionEntryParams.safeParse(req.params);
    if (!paramsParsed.success) {
      return res.status(400).json({ error: "Ongeldig ID" });
    }

    const bodyParsed = UpdateNutritionEntryBody.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ error: "Ongeldige invoer" });
    }

    const { id } = paramsParsed.data;
    const { kcal, eiwittenG, koolhydratenG, vetenG, waterMl, notes } = bodyParsed.data;

    const [updated] = await db
      .update(nutritionEntriesTable)
      .set({
        kcal: kcal !== undefined && kcal !== null ? String(kcal) : null,
        eiwittenG: eiwittenG !== undefined && eiwittenG !== null ? String(eiwittenG) : null,
        koolhydratenG: koolhydratenG !== undefined && koolhydratenG !== null ? String(koolhydratenG) : null,
        vetenG: vetenG !== undefined && vetenG !== null ? String(vetenG) : null,
        waterMl: waterMl !== undefined && waterMl !== null ? String(waterMl) : null,
        notes: notes ?? null,
      })
      .where(eq(nutritionEntriesTable.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Voedingsinvoer niet gevonden" });
    }

    return void res.json({
      ...updated,
      kcal: updated.kcal ? parseFloat(updated.kcal) : null,
      eiwittenG: updated.eiwittenG ? parseFloat(updated.eiwittenG) : null,
      koolhydratenG: updated.koolhydratenG ? parseFloat(updated.koolhydratenG) : null,
      vetenG: updated.vetenG ? parseFloat(updated.vetenG) : null,
      waterMl: updated.waterMl ? parseFloat(updated.waterMl) : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update nutrition entry");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
