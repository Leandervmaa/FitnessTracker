import { Router } from "express";
import { db } from "@workspace/db";
import { exerciseLogsTable } from "@workspace/db";
import { CreateExerciseLogBody, UpdateExerciseLogBody, UpdateExerciseLogParams, GetExerciseLogsQueryParams } from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const parsed = GetExerciseLogsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return void res.status(400).json({ error: "Ongeldige parameters" });
    }

    const { exerciseId, weekNumber, workoutId } = parsed.data;

    let query = db.select().from(exerciseLogsTable).$dynamic();

    const conditions = [];
    if (exerciseId) conditions.push(eq(exerciseLogsTable.exerciseId, exerciseId));
    if (weekNumber !== undefined) conditions.push(eq(exerciseLogsTable.weekNumber, weekNumber));
    if (workoutId) conditions.push(eq(exerciseLogsTable.workoutId, workoutId));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const logs = await query;

    const result = logs.map((l) => ({
      ...l,
      weight: l.weight ? parseFloat(l.weight) : null,
    }));

    return void res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get exercise logs");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/", async (req, res) => {
  try {
    const parsed = CreateExerciseLogBody.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ error: "Ongeldige invoer" });
    }

    const { exerciseId, workoutId, weekNumber, sets, reps, weight, notes } = parsed.data;

    const existing = await db
      .select()
      .from(exerciseLogsTable)
      .where(
        and(
          eq(exerciseLogsTable.exerciseId, exerciseId),
          eq(exerciseLogsTable.weekNumber, weekNumber)
        )
      );

    let log: typeof exerciseLogsTable.$inferSelect;

    if (existing.length > 0) {
      const [updated] = await db
        .update(exerciseLogsTable)
        .set({
          sets: sets ?? null,
          reps: reps ?? null,
          weight: weight !== undefined && weight !== null ? String(weight) : null,
          notes: notes ?? null,
        })
        .where(eq(exerciseLogsTable.id, existing[0].id))
        .returning();
      log = updated;
    } else {
      const [created] = await db
        .insert(exerciseLogsTable)
        .values({
          exerciseId,
          workoutId,
          weekNumber,
          sets: sets ?? null,
          reps: reps ?? null,
          weight: weight !== undefined && weight !== null ? String(weight) : null,
          notes: notes ?? null,
        })
        .returning();
      log = created;
    }

    return void res.status(201).json({
      ...log,
      weight: log.weight ? parseFloat(log.weight) : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create exercise log");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const paramsParsed = UpdateExerciseLogParams.safeParse(req.params);
    if (!paramsParsed.success) {
      return void res.status(400).json({ error: "Ongeldig ID" });
    }

    const bodyParsed = UpdateExerciseLogBody.safeParse(req.body);
    if (!bodyParsed.success) {
      return void res.status(400).json({ error: "Ongeldige invoer" });
    }

    const { id } = paramsParsed.data;
    const { sets, reps, weight, notes } = bodyParsed.data;

    const [updated] = await db
      .update(exerciseLogsTable)
      .set({
        sets: sets ?? null,
        reps: reps ?? null,
        weight: weight !== undefined && weight !== null ? String(weight) : null,
        notes: notes ?? null,
      })
      .where(eq(exerciseLogsTable.id, id))
      .returning();

    if (!updated) {
      return void res.status(404).json({ error: "Log niet gevonden" });
    }

    return void res.json({
      ...updated,
      weight: updated.weight ? parseFloat(updated.weight) : null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update exercise log");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
