import { Router, type Request } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  exerciseLibraryTable,
  exerciseSetLogsTable,
  nutritionEntriesTable,
  nutritionTargetsTable,
  plannedWorkoutExercisesTable,
  plannedWorkoutsTable,
  trainingDayTemplateExercisesTable,
  trainingDayTemplatesTable,
} from "@workspace/db";
import { getScopedClientId, requireTrainer } from "../lib/auth.js";
import { randomId } from "../services/identityService.js";
import { getWeekPlan, getWorkoutPlan } from "../services/planningService.js";
import {
  syncClientDataSheets,
  syncClientWorkbook,
  writePlannedSetLogToSheet,
} from "../services/planningSheetService.js";
import { notifyClients } from "./sync.js";

const router = Router();
const DAILY_TARGET_LABEL = "Dagelijks";

function clean(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function intValue(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : fallback;
}

function numberString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? String(num) : null;
}

function syncWorkbook(req: Request, clientId: string, weekNumber?: number) {
  void syncClientWorkbook(clientId, weekNumber).catch((err) => {
    req.log.warn({ err, clientId, weekNumber }, "Failed to sync client workbook to sheet");
  });
}

function syncDataSheets(req: Request, clientId: string) {
  void syncClientDataSheets(clientId).catch((err) => {
    req.log.warn({ err, clientId }, "Failed to sync client data sheets to sheet");
  });
}

async function findWorkoutForClient(clientId: string, workoutId: string) {
  const [workout] = await db
    .select()
    .from(plannedWorkoutsTable)
    .where(and(eq(plannedWorkoutsTable.id, workoutId), eq(plannedWorkoutsTable.clientId, clientId)));
  return workout ?? null;
}

async function createWorkoutFromTemplate(input: {
  clientId: string;
  weekNumber: number;
  templateId: string;
  name: string;
  dayLabel: string;
  sortOrder: number;
}) {
  const [template] = await db
    .select()
    .from(trainingDayTemplatesTable)
    .where(eq(trainingDayTemplatesTable.id, input.templateId));
  if (!template) return null;

  const templateExercises = await db
    .select()
    .from(trainingDayTemplateExercisesTable)
    .where(eq(trainingDayTemplateExercisesTable.templateId, template.id))
    .orderBy(asc(trainingDayTemplateExercisesTable.sortOrder));

  const workoutId = randomId("pw");
  const [workout] = await db
    .insert(plannedWorkoutsTable)
    .values({
      id: workoutId,
      clientId: input.clientId,
      weekNumber: input.weekNumber,
      name: input.name,
      dayLabel: input.dayLabel,
      sortOrder: input.sortOrder,
    })
    .returning();

  if (templateExercises.length > 0) {
    await db.insert(plannedWorkoutExercisesTable).values(
      templateExercises.map((exercise) => ({
        id: randomId("pe"),
        workoutId,
        clientId: input.clientId,
        weekNumber: input.weekNumber,
        exerciseLibraryId: exercise.exerciseLibraryId,
        name: exercise.name,
        videoUrl: exercise.videoUrl,
        imageUrl: exercise.imageUrl,
        notes: exercise.notes,
        sets: exercise.sets,
        repRange: exercise.repRange,
        targetRpe: exercise.targetRpe,
        sortOrder: exercise.sortOrder,
      })),
    );
  }

  return workout;
}

router.get("/week/:weekNumber", async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const weekNumber = intValue(req.params.weekNumber, 1);
    return void res.json({ weekNumber, workouts: await getWeekPlan(clientId, weekNumber) });
  } catch (err) {
    req.log.error({ err }, "Failed to get planned week");
    return void res.status(500).json({ error: "Weekplanning ophalen mislukt" });
  }
});

router.get("/weeks", async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const workouts = await db
      .select({ weekNumber: plannedWorkoutsTable.weekNumber })
      .from(plannedWorkoutsTable)
      .where(eq(plannedWorkoutsTable.clientId, clientId))
      .orderBy(asc(plannedWorkoutsTable.weekNumber));

    const weekNumbers = Array.from(new Set(workouts.map((workout) => workout.weekNumber))).sort((a, b) => a - b);
    const nextWeekNumber = weekNumbers.length > 0 ? Math.max(...weekNumbers) + 1 : 1;
    return void res.json({ weekNumbers, nextWeekNumber });
  } catch (err) {
    req.log.error({ err }, "Failed to list planned weeks");
    return void res.status(500).json({ error: "Weken ophalen mislukt" });
  }
});

router.get("/workouts/:workoutId", async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const workout = await getWorkoutPlan(clientId, param(req.params.workoutId));
    if (!workout) return void res.status(404).json({ error: "Training niet gevonden" });
    return void res.json(workout);
  } catch (err) {
    req.log.error({ err }, "Failed to get planned workout");
    return void res.status(500).json({ error: "Training ophalen mislukt" });
  }
});

router.post("/week/:weekNumber/workouts", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const weekNumber = intValue(req.params.weekNumber, 1);
    const name = clean(req.body?.name) || `Training ${String.fromCharCode(65 + intValue(req.body?.sortOrder, 0))}`;
    const dayLabel = clean(req.body?.dayLabel) || name;
    const sortOrder = intValue(req.body?.sortOrder, Date.now());

    const [workout] = await db
      .insert(plannedWorkoutsTable)
      .values({
        id: randomId("pw"),
        clientId,
        weekNumber,
        name,
        dayLabel,
        sortOrder,
      })
      .returning();

    syncWorkbook(req, clientId, weekNumber);
    return void res.status(201).json(workout);
  } catch (err) {
    req.log.error({ err }, "Failed to create planned workout");
    return void res.status(500).json({ error: "Training aanmaken mislukt" });
  }
});

router.post("/week/:weekNumber/workouts/from-template", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const weekNumber = intValue(req.params.weekNumber, 1);
    const templateId = clean(req.body?.templateId);
    if (!templateId) return void res.status(400).json({ error: "Template is verplicht" });

    const workout = await createWorkoutFromTemplate({
      clientId,
      weekNumber,
      templateId,
      name: clean(req.body?.name) || "Training",
      dayLabel: clean(req.body?.dayLabel) || "Training",
      sortOrder: intValue(req.body?.sortOrder, Date.now()),
    });

    if (!workout) return void res.status(404).json({ error: "Template niet gevonden" });
    syncWorkbook(req, clientId, weekNumber);
    return void res.status(201).json(workout);
  } catch (err) {
    req.log.error({ err }, "Failed to create workout from template");
    return void res.status(500).json({ error: "Template toepassen mislukt" });
  }
});

router.post("/week/:weekNumber/copy", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const weekNumber = intValue(req.params.weekNumber, 1);
    const sourceWeek = intValue(req.body?.sourceWeek, weekNumber - 1);
    if (sourceWeek < 1) return void res.status(400).json({ error: "Bronweek is ongeldig" });

    const sourcePlan = await getWeekPlan(clientId, sourceWeek);
    if (sourcePlan.length === 0) return void res.status(404).json({ error: "Geen schema gevonden om te kopieren" });

    for (const sourceWorkout of sourcePlan) {
      const workoutId = randomId("pw");
      await db.insert(plannedWorkoutsTable).values({
        id: workoutId,
        clientId,
        weekNumber,
        name: sourceWorkout.name,
        dayLabel: sourceWorkout.dayLabel,
        sortOrder: sourceWorkout.sortOrder,
      });

      if (sourceWorkout.exercises.length > 0) {
        await db.insert(plannedWorkoutExercisesTable).values(
          sourceWorkout.exercises.map((exercise) => ({
            id: randomId("pe"),
            workoutId,
            clientId,
            weekNumber,
            exerciseLibraryId: exercise.exerciseLibraryId,
            name: exercise.name,
            videoUrl: exercise.videoUrl,
            imageUrl: exercise.imageUrl,
            notes: exercise.notes,
            sets: exercise.sets,
            repRange: exercise.repRange,
            targetRpe: exercise.targetRpe,
            sortOrder: exercise.sortOrder,
          })),
        );
      }
    }

    syncWorkbook(req, clientId, weekNumber);
    return void res.status(201).json({ weekNumber, workouts: await getWeekPlan(clientId, weekNumber) });
  } catch (err) {
    req.log.error({ err }, "Failed to copy planned week");
    return void res.status(500).json({ error: "Week kopieren mislukt" });
  }
});

router.put("/workouts/:workoutId", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const existing = await findWorkoutForClient(clientId, param(req.params.workoutId));
    if (!existing) return void res.status(404).json({ error: "Training niet gevonden" });

    const [updated] = await db
      .update(plannedWorkoutsTable)
      .set({
        name: req.body?.name !== undefined ? clean(req.body.name) || existing.name : undefined,
        dayLabel: req.body?.dayLabel !== undefined ? clean(req.body.dayLabel) || existing.dayLabel : undefined,
        sortOrder: req.body?.sortOrder !== undefined ? intValue(req.body.sortOrder, existing.sortOrder) : undefined,
        status: req.body?.status !== undefined ? clean(req.body.status) || existing.status : undefined,
      })
      .where(and(eq(plannedWorkoutsTable.id, existing.id), eq(plannedWorkoutsTable.clientId, clientId)))
      .returning();

    syncWorkbook(req, clientId, updated.weekNumber);
    return void res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update planned workout");
    return void res.status(500).json({ error: "Training bijwerken mislukt" });
  }
});

router.delete("/workouts/:workoutId", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const existing = await findWorkoutForClient(clientId, param(req.params.workoutId));
    if (!existing) return void res.status(404).json({ error: "Training niet gevonden" });

    await db.delete(exerciseSetLogsTable).where(eq(exerciseSetLogsTable.plannedWorkoutId, existing.id));
    await db.delete(plannedWorkoutExercisesTable).where(eq(plannedWorkoutExercisesTable.workoutId, existing.id));
    await db.delete(plannedWorkoutsTable).where(eq(plannedWorkoutsTable.id, existing.id));

    syncWorkbook(req, clientId, existing.weekNumber);
    return void res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete planned workout");
    return void res.status(500).json({ error: "Training verwijderen mislukt" });
  }
});

router.post("/workouts/:workoutId/copy", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const workoutId = param(req.params.workoutId);
    const targetWeekNumber = intValue(req.body?.targetWeekNumber, 0);
    if (targetWeekNumber < 1) return void res.status(400).json({ error: "Doelweek is ongeldig" });

    const existing = await findWorkoutForClient(clientId, workoutId);
    if (!existing) return void res.status(404).json({ error: "Training niet gevonden" });

    const exercises = await db
      .select()
      .from(plannedWorkoutExercisesTable)
      .where(eq(plannedWorkoutExercisesTable.workoutId, existing.id))
      .orderBy(asc(plannedWorkoutExercisesTable.sortOrder));

    const newWorkoutId = randomId("pw");
    const [newWorkout] = await db
      .insert(plannedWorkoutsTable)
      .values({
        id: newWorkoutId,
        clientId,
        weekNumber: targetWeekNumber,
        name: targetWeekNumber === existing.weekNumber ? `Kopie van ${existing.name}` : existing.name,
        dayLabel: existing.dayLabel,
        sortOrder: existing.sortOrder + 1,
      })
      .returning();

    if (exercises.length > 0) {
      await db.insert(plannedWorkoutExercisesTable).values(
        exercises.map((ex) => ({
          id: randomId("pe"),
          workoutId: newWorkoutId,
          clientId,
          weekNumber: targetWeekNumber,
          exerciseLibraryId: ex.exerciseLibraryId,
          name: ex.name,
          videoUrl: ex.videoUrl,
          imageUrl: ex.imageUrl,
          notes: ex.notes,
          sets: ex.sets,
          repRange: ex.repRange,
          targetRpe: ex.targetRpe,
          sortOrder: ex.sortOrder,
        }))
      );
    }

    syncWorkbook(req, clientId, targetWeekNumber);
    return void res.status(201).json(newWorkout);
  } catch (err) {
    req.log.error({ err }, "Failed to copy workout");
    return void res.status(500).json({ error: "Kopiëren van training mislukt" });
  }
});

router.post("/workouts/:workoutId/exercises", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const workout = await findWorkoutForClient(clientId, param(req.params.workoutId));
    if (!workout) return void res.status(404).json({ error: "Training niet gevonden" });

    let libraryItem: typeof exerciseLibraryTable.$inferSelect | null = null;
    const exerciseLibraryId = clean(req.body?.exerciseLibraryId);
    if (exerciseLibraryId) {
      [libraryItem] = await db.select().from(exerciseLibraryTable).where(eq(exerciseLibraryTable.id, exerciseLibraryId));
    }

    const name = clean(req.body?.name) || libraryItem?.name;
    if (!name) return void res.status(400).json({ error: "Oefening is verplicht" });

    let finalLibraryId = libraryItem?.id || null;
    let videoUrl = clean(req.body?.videoUrl) || libraryItem?.videoUrl || null;
    let imageUrl = clean(req.body?.imageUrl) || libraryItem?.imageUrl || null;

    if (!finalLibraryId && req.body?.addToLibrary === true) {
      const [createdLibraryItem] = await db
        .insert(exerciseLibraryTable)
        .values({
          id: randomId("ex"),
          name,
          category: clean(req.body?.category),
          videoUrl,
          imageUrl,
          notes: clean(req.body?.notes),
          source: "trainer_weekplanner",
          isGlobal: true,
        })
        .returning();
      finalLibraryId = createdLibraryItem.id;
      videoUrl = createdLibraryItem.videoUrl;
      imageUrl = createdLibraryItem.imageUrl;
    }

    const [created] = await db
      .insert(plannedWorkoutExercisesTable)
      .values({
        id: randomId("pe"),
        workoutId: workout.id,
        clientId,
        weekNumber: workout.weekNumber,
        exerciseLibraryId: finalLibraryId,
        name,
        videoUrl,
        imageUrl,
        notes: clean(req.body?.notes) || libraryItem?.notes || null,
        sets: intValue(req.body?.sets, 3),
        repRange: clean(req.body?.repRange),
        targetRpe: numberString(req.body?.targetRpe),
        sortOrder: intValue(req.body?.sortOrder, Date.now()),
      })
      .returning();

    syncWorkbook(req, clientId, workout.weekNumber);
    return void res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to add planned exercise");
    return void res.status(500).json({ error: "Oefening toevoegen mislukt" });
  }
});

router.post("/workouts/:workoutId/exercises/from-template", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const workout = await findWorkoutForClient(clientId, param(req.params.workoutId));
    if (!workout) return void res.status(404).json({ error: "Training niet gevonden" });

    const templateId = clean(req.body?.templateId);
    if (!templateId) return void res.status(400).json({ error: "Template is verplicht" });

    const [template] = await db
      .select()
      .from(trainingDayTemplatesTable)
      .where(eq(trainingDayTemplatesTable.id, templateId));
    if (!template) return void res.status(404).json({ error: "Template niet gevonden" });

    const templateExercises = await db
      .select()
      .from(trainingDayTemplateExercisesTable)
      .where(eq(trainingDayTemplateExercisesTable.templateId, template.id))
      .orderBy(asc(trainingDayTemplateExercisesTable.sortOrder));
    if (templateExercises.length === 0) {
      return void res.status(400).json({ error: "Template bevat nog geen oefeningen" });
    }

    const existingExercises = await db
      .select()
      .from(plannedWorkoutExercisesTable)
      .where(eq(plannedWorkoutExercisesTable.workoutId, workout.id));
    const baseSortOrder = existingExercises.reduce((max, exercise) => Math.max(max, exercise.sortOrder), 0);

    const created = await db
      .insert(plannedWorkoutExercisesTable)
      .values(
        templateExercises.map((exercise, index) => ({
          id: randomId("pe"),
          workoutId: workout.id,
          clientId,
          weekNumber: workout.weekNumber,
          exerciseLibraryId: exercise.exerciseLibraryId,
          name: exercise.name,
          videoUrl: exercise.videoUrl,
          imageUrl: exercise.imageUrl,
          notes: exercise.notes,
          sets: exercise.sets,
          repRange: exercise.repRange,
          targetRpe: exercise.targetRpe,
          sortOrder: baseSortOrder + index + 1,
        })),
      )
      .returning();

    syncWorkbook(req, clientId, workout.weekNumber);
    return void res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to add template exercises to workout");
    return void res.status(500).json({ error: "Template toevoegen mislukt" });
  }
});

router.put("/exercises/:exerciseId", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const [existing] = await db
      .select()
      .from(plannedWorkoutExercisesTable)
      .where(and(eq(plannedWorkoutExercisesTable.id, param(req.params.exerciseId)), eq(plannedWorkoutExercisesTable.clientId, clientId)));
    if (!existing) return void res.status(404).json({ error: "Oefening niet gevonden" });

    const [updated] = await db
      .update(plannedWorkoutExercisesTable)
      .set({
        name: req.body?.name !== undefined ? clean(req.body.name) || existing.name : undefined,
        videoUrl: req.body?.videoUrl !== undefined ? clean(req.body.videoUrl) : undefined,
        imageUrl: req.body?.imageUrl !== undefined ? clean(req.body.imageUrl) : undefined,
        notes: req.body?.notes !== undefined ? clean(req.body.notes) : undefined,
        sets: req.body?.sets !== undefined ? intValue(req.body.sets, existing.sets) : undefined,
        repRange: req.body?.repRange !== undefined ? clean(req.body.repRange) : undefined,
        targetRpe: req.body?.targetRpe !== undefined ? numberString(req.body.targetRpe) : undefined,
        sortOrder: req.body?.sortOrder !== undefined ? intValue(req.body.sortOrder, existing.sortOrder) : undefined,
      })
      .where(eq(plannedWorkoutExercisesTable.id, existing.id))
      .returning();

    syncWorkbook(req, clientId, updated.weekNumber);
    return void res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update planned exercise");
    return void res.status(500).json({ error: "Oefening bijwerken mislukt" });
  }
});

router.delete("/exercises/:exerciseId", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const [existing] = await db
      .select()
      .from(plannedWorkoutExercisesTable)
      .where(and(eq(plannedWorkoutExercisesTable.id, param(req.params.exerciseId)), eq(plannedWorkoutExercisesTable.clientId, clientId)));
    if (!existing) return void res.status(404).json({ error: "Oefening niet gevonden" });

    await db.delete(exerciseSetLogsTable).where(eq(exerciseSetLogsTable.plannedExerciseId, existing.id));
    await db.delete(plannedWorkoutExercisesTable).where(eq(plannedWorkoutExercisesTable.id, existing.id));

    syncWorkbook(req, clientId, existing.weekNumber);
    return void res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete planned exercise");
    return void res.status(500).json({ error: "Oefening verwijderen mislukt" });
  }
});

router.post("/set-logs", async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const plannedExerciseId = clean(req.body?.plannedExerciseId);
    const setNumber = intValue(req.body?.setNumber, 1);
    if (!plannedExerciseId || setNumber < 1) return void res.status(400).json({ error: "Setgegevens zijn ongeldig" });

    const [exercise] = await db
      .select()
      .from(plannedWorkoutExercisesTable)
      .where(and(eq(plannedWorkoutExercisesTable.id, plannedExerciseId), eq(plannedWorkoutExercisesTable.clientId, clientId)));
    if (!exercise) return void res.status(404).json({ error: "Oefening niet gevonden" });

    const workout = await findWorkoutForClient(clientId, exercise.workoutId);
    if (!workout) return void res.status(404).json({ error: "Training niet gevonden" });

    const values = {
      reps: req.body?.reps !== undefined && req.body.reps !== "" ? intValue(req.body.reps, 0) : null,
      weight: numberString(req.body?.weight),
      rpe: numberString(req.body?.rpe),
      notes: clean(req.body?.notes),
    };

    const [existing] = await db
      .select()
      .from(exerciseSetLogsTable)
      .where(
        and(
          eq(exerciseSetLogsTable.clientId, clientId),
          eq(exerciseSetLogsTable.plannedExerciseId, exercise.id),
          eq(exerciseSetLogsTable.setNumber, setNumber),
        ),
      );

    const [log] = existing
      ? await db.update(exerciseSetLogsTable).set(values).where(eq(exerciseSetLogsTable.id, existing.id)).returning()
      : await db
          .insert(exerciseSetLogsTable)
          .values({
            clientId,
            plannedWorkoutId: workout.id,
            plannedExerciseId: exercise.id,
            exerciseLibraryId: exercise.exerciseLibraryId,
            weekNumber: workout.weekNumber,
            setNumber,
            ...values,
          })
          .returning();

    void writePlannedSetLogToSheet({
      clientId,
      log,
      workoutName: workout.name,
      exerciseName: exercise.name,
    }).catch((err) => {
      req.log.warn({ err, clientId }, "Failed to sync set log to sheet");
    });

    notifyClients("exercise_updated", { clientId, weekNumber: workout.weekNumber });

    return void res.status(existing ? 200 : 201).json(log);
  } catch (err) {
    req.log.error({ err }, "Failed to save set log");
    return void res.status(500).json({ error: "Set opslaan mislukt" });
  }
});

router.get("/nutrition-targets", async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const targets = await db
      .select()
      .from(nutritionTargetsTable)
      .where(eq(nutritionTargetsTable.clientId, clientId))
      .orderBy(asc(nutritionTargetsTable.sortOrder));

    if (targets.length > 0) {
      const dailyTarget = targets.find((target) => target.dayLabel === DAILY_TARGET_LABEL) || targets[0];
      return void res.json([dailyTarget]);
    }

    return void res.json([
      {
        id: "empty-daily",
        clientId,
        dayLabel: DAILY_TARGET_LABEL,
        kcal: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
        waterMl: null,
        sortOrder: 0,
      },
    ]);
  } catch (err) {
    req.log.error({ err }, "Failed to get nutrition targets");
    return void res.status(500).json({ error: "Voedingsdoelen ophalen mislukt" });
  }
});

router.put("/nutrition-targets", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const input = req.body?.target || (Array.isArray(req.body?.targets) ? req.body.targets[0] : {});
    const values = {
      kcal: input?.kcal !== undefined && input.kcal !== "" ? intValue(input.kcal, 0) : null,
      proteinG: input?.proteinG !== undefined && input.proteinG !== "" ? intValue(input.proteinG, 0) : null,
      carbsG: input?.carbsG !== undefined && input.carbsG !== "" ? intValue(input.carbsG, 0) : null,
      fatG: input?.fatG !== undefined && input.fatG !== "" ? intValue(input.fatG, 0) : null,
      waterMl: input?.waterMl !== undefined && input.waterMl !== "" ? intValue(input.waterMl, 0) : null,
      sortOrder: 0,
    };

    await db.delete(nutritionTargetsTable).where(eq(nutritionTargetsTable.clientId, clientId));
    await db.insert(nutritionTargetsTable).values({
      id: randomId("nt"),
      clientId,
      dayLabel: DAILY_TARGET_LABEL,
      ...values,
    });

    syncDataSheets(req, clientId);

    const updated = await db
      .select()
      .from(nutritionTargetsTable)
      .where(eq(nutritionTargetsTable.clientId, clientId))
      .orderBy(asc(nutritionTargetsTable.sortOrder));
    return void res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update nutrition targets");
    return void res.status(500).json({ error: "Voedingsdoelen bijwerken mislukt" });
  }
});


/** POST /api/plans/exercises/:exerciseId/replace — Replace a planned exercise with another (client during workout) */
router.post("/exercises/:exerciseId/replace", async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const exerciseId = param(req.params.exerciseId);
    const [existing] = await db
      .select()
      .from(plannedWorkoutExercisesTable)
      .where(and(eq(plannedWorkoutExercisesTable.id, exerciseId), eq(plannedWorkoutExercisesTable.clientId, clientId)));
    if (!existing) return void res.status(404).json({ error: "Oefening niet gevonden" });

    const replacementLibraryId = clean(req.body?.replacementLibraryId);
    if (!replacementLibraryId) return void res.status(400).json({ error: "Kies een vervangende oefening" });

    const [libraryItem] = await db.select().from(exerciseLibraryTable).where(eq(exerciseLibraryTable.id, replacementLibraryId));
    if (!libraryItem) return void res.status(404).json({ error: "Oefening niet gevonden in bibliotheek" });

    const [updated] = await db
      .update(plannedWorkoutExercisesTable)
      .set({
        exerciseLibraryId: libraryItem.id,
        name: libraryItem.name,
        videoUrl: libraryItem.videoUrl,
        imageUrl: libraryItem.imageUrl,
        notes: libraryItem.notes,
      })
      .where(eq(plannedWorkoutExercisesTable.id, exerciseId))
      .returning();

    return void res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to replace exercise");
    return void res.status(500).json({ error: "Oefening vervangen mislukt" });
  }
});

/** GET /api/plans/compare/:weekA/:weekB — Side-by-side comparison data for two weeks */
router.get("/compare/:weekA/:weekB", async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const weekA = intValue(req.params.weekA, 1);
    const weekB = intValue(req.params.weekB, 2);

    const [planA, planB] = await Promise.all([
      getWeekPlan(clientId, weekA),
      getWeekPlan(clientId, weekB),
    ]);

    // Nutrition entries for both weeks
    const nutritionEntries = await db
      .select()
      .from(nutritionEntriesTable)
      .where(and(eq(nutritionEntriesTable.clientId, clientId)))
      .then((rows) => rows.filter((r) => r.weekNumber === weekA || r.weekNumber === weekB));

    const nutritionA = nutritionEntries.filter((e) => e.weekNumber === weekA);
    const nutritionB = nutritionEntries.filter((e) => e.weekNumber === weekB);

    // Calculate totals for comparison
    const calcWeekTotals = (plan: typeof planA) => ({
      totalVolume: plan.flatMap((w) => w.exercises).reduce((sum, ex) => {
        const setVolume = ex.currentSetLogs.reduce((s, log) => {
          const w = parseFloat(String(log.weight || "0"));
          const r = log.reps || 0;
          return s + (w * r);
        }, 0);
        return sum + setVolume;
      }, 0),
      totalSets: plan.flatMap((w) => w.exercises).reduce((sum, ex) => sum + ex.currentSetLogs.length, 0),
      totalReps: plan.flatMap((w) => w.exercises).reduce((sum, ex) => sum + ex.currentSetLogs.reduce((s, l) => s + (l.reps || 0), 0), 0),
      workoutCount: plan.length,
    });

    const calcNutritionAvg = (entries: typeof nutritionA) => {
      const days = entries.length || 1;
      const sum = (key: keyof typeof nutritionA[0]) => entries.reduce((s, e) => s + parseFloat(String(e[key] || "0")), 0);
      return {
        avgKcal: sum("kcal") / days,
        avgEiwit: sum("eiwittenG") / days,
        avgGewicht: sum("lichaamsgewicht") / days,
        avgSlaap: sum("slaapUren") / days,
        avgStress: entries.reduce((s, e) => s + (e.stressNiveau || 0), 0) / days,
        avgEnergie: entries.reduce((s, e) => s + (e.energieNiveau || 0), 0) / days,
      };
    };

    return void res.json({
      weekA: { weekNumber: weekA, plan: planA, totals: calcWeekTotals(planA), nutrition: calcNutritionAvg(nutritionA) },
      weekB: { weekNumber: weekB, plan: planB, totals: calcWeekTotals(planB), nutrition: calcNutritionAvg(nutritionB) },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get week comparison");
    return void res.status(500).json({ error: "Vergelijking ophalen mislukt" });
  }
});

/** POST /api/plans/week/:weekNumber/bulk-adjust — Apply bulk adjustments to all exercises in a week */
router.post("/week/:weekNumber/bulk-adjust", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const weekNumber = intValue(req.params.weekNumber, 1);
    const action = clean(req.body?.action);
    if (!action) return void res.status(400).json({ error: "Actie is verplicht" });

    const REP_RANGES = ["1-5", "5-8", "6-10", "8-12", "10-15", "12-20"];

    const exercises = await db
      .select()
      .from(plannedWorkoutExercisesTable)
      .where(and(eq(plannedWorkoutExercisesTable.clientId, clientId), eq(plannedWorkoutExercisesTable.weekNumber, weekNumber)));

    let updatedCount = 0;
    for (const ex of exercises) {
      const updates: Partial<typeof plannedWorkoutExercisesTable.$inferInsert> = {};

      if (action === "sets+1") updates.sets = (ex.sets || 3) + 1;
      if (action === "sets-1") updates.sets = Math.max(1, (ex.sets || 3) - 1);

      if (action === "reps+1" || action === "reps-1") {
        const idx = REP_RANGES.indexOf(ex.repRange || "");
        if (idx >= 0) {
          const newIdx = action === "reps+1" ? Math.min(REP_RANGES.length - 1, idx + 1) : Math.max(0, idx - 1);
          updates.repRange = REP_RANGES[newIdx];
        }
      }

      if (action === "deload") {
        updates.sets = Math.max(1, (ex.sets || 3) - 1);
        const idx = REP_RANGES.indexOf(ex.repRange || "");
        if (idx >= 0) updates.repRange = REP_RANGES[Math.max(0, idx - 2)];
      }

      if (Object.keys(updates).length > 0) {
        await db.update(plannedWorkoutExercisesTable).set(updates).where(eq(plannedWorkoutExercisesTable.id, ex.id));
        updatedCount++;
      }
    }

    return void res.json({ updated: updatedCount, action, weekNumber });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk adjust exercises");
    return void res.status(500).json({ error: "Bulk aanpassing mislukt" });
  }
});

/** POST /api/plans/templates/client — Save a client-specific copy of a template */
router.post("/templates/client", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const sourceTemplateId = clean(req.body?.templateId);
    const newName = clean(req.body?.name);
    if (!sourceTemplateId || !newName) return void res.status(400).json({ error: "Template en naam zijn verplicht" });

    const [source] = await db.select().from(trainingDayTemplatesTable).where(eq(trainingDayTemplatesTable.id, sourceTemplateId));
    if (!source) return void res.status(404).json({ error: "Brontemplate niet gevonden" });

    const sourceExercises = await db
      .select()
      .from(trainingDayTemplateExercisesTable)
      .where(eq(trainingDayTemplateExercisesTable.templateId, sourceTemplateId))
      .orderBy(asc(trainingDayTemplateExercisesTable.sortOrder));

    const newTemplateId = randomId("tpl");
    const [newTemplate] = await db
      .insert(trainingDayTemplatesTable)
      .values({ id: newTemplateId, name: newName, notes: `Klant-template (${clientId}) gebaseerd op: ${source.name}` })
      .returning();

    if (sourceExercises.length > 0) {
      await db.insert(trainingDayTemplateExercisesTable).values(
        sourceExercises.map((ex) => ({
          id: randomId("tpe"),
          templateId: newTemplateId,
          exerciseLibraryId: ex.exerciseLibraryId,
          name: ex.name,
          videoUrl: ex.videoUrl,
          imageUrl: ex.imageUrl,
          notes: ex.notes,
          sets: ex.sets,
          repRange: ex.repRange,
          targetRpe: ex.targetRpe,
          sortOrder: ex.sortOrder,
        }))
      );
    }

    const exercises = await db
      .select()
      .from(trainingDayTemplateExercisesTable)
      .where(eq(trainingDayTemplateExercisesTable.templateId, newTemplateId))
      .orderBy(asc(trainingDayTemplateExercisesTable.sortOrder));

    return void res.status(201).json({ ...newTemplate, exercises });
  } catch (err) {
    req.log.error({ err }, "Failed to create client template");
    return void res.status(500).json({ error: "Klanttemplate aanmaken mislukt" });
  }
});

router.get("/templates", requireTrainer, async (_req, res) => {

  const templates = await db.select().from(trainingDayTemplatesTable).orderBy(asc(trainingDayTemplatesTable.name));
  const exercises = await db.select().from(trainingDayTemplateExercisesTable).orderBy(asc(trainingDayTemplateExercisesTable.sortOrder));
  return void res.json(
    templates.map((template) => ({
      ...template,
      exercises: exercises.filter((exercise) => exercise.templateId === template.id),
    })),
  );
});

router.post("/templates/from-workout/:workoutId", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const workout = await getWorkoutPlan(clientId, param(req.params.workoutId));
    if (!workout) return void res.status(404).json({ error: "Training niet gevonden" });

    const templateId = randomId("tpl");
    const [template] = await db
      .insert(trainingDayTemplatesTable)
      .values({
        id: templateId,
        name: clean(req.body?.name) || workout.name,
        notes: clean(req.body?.notes),
      })
      .returning();

    if (workout.exercises.length > 0) {
      await db.insert(trainingDayTemplateExercisesTable).values(
        workout.exercises.map((exercise) => ({
          id: randomId("tpe"),
          templateId,
          exerciseLibraryId: exercise.exerciseLibraryId,
          name: exercise.name,
          videoUrl: exercise.videoUrl,
          imageUrl: exercise.imageUrl,
          notes: exercise.notes,
          sets: exercise.sets,
          repRange: exercise.repRange,
          targetRpe: exercise.targetRpe,
          sortOrder: exercise.sortOrder,
        })),
      );
    }

    return void res.status(201).json(template);
  } catch (err) {
    req.log.error({ err }, "Failed to create training template");
    return void res.status(500).json({ error: "Template opslaan mislukt" });
  }
});

/** POST /api/plans/templates — Create a new blank template */
router.post("/templates", requireTrainer, async (req, res) => {
  try {
    const name = clean(req.body?.name);
    if (!name) return void res.status(400).json({ error: "Template naam is verplicht" });

    const [template] = await db
      .insert(trainingDayTemplatesTable)
      .values({ id: randomId("tpl"), name, notes: clean(req.body?.notes) })
      .returning();

    return void res.status(201).json({ ...template, exercises: [] });
  } catch (err) {
    req.log.error({ err }, "Failed to create blank template");
    return void res.status(500).json({ error: "Template aanmaken mislukt" });
  }
});

/** PUT /api/plans/templates/:templateId — Update template name/notes */
router.put("/templates/:templateId", requireTrainer, async (req, res) => {
  try {
    const templateId = param(req.params.templateId);
    const [existing] = await db.select().from(trainingDayTemplatesTable).where(eq(trainingDayTemplatesTable.id, templateId));
    if (!existing) return void res.status(404).json({ error: "Template niet gevonden" });

    const [updated] = await db
      .update(trainingDayTemplatesTable)
      .set({
        name: req.body?.name !== undefined ? clean(req.body.name) || existing.name : undefined,
        notes: req.body?.notes !== undefined ? clean(req.body.notes) : undefined,
      })
      .where(eq(trainingDayTemplatesTable.id, templateId))
      .returning();

    const exercises = await db
      .select()
      .from(trainingDayTemplateExercisesTable)
      .where(eq(trainingDayTemplateExercisesTable.templateId, templateId))
      .orderBy(asc(trainingDayTemplateExercisesTable.sortOrder));

    return void res.json({ ...updated, exercises });
  } catch (err) {
    req.log.error({ err }, "Failed to update template");
    return void res.status(500).json({ error: "Template bijwerken mislukt" });
  }
});

/** DELETE /api/plans/templates/:templateId — Delete template and its exercises */
router.delete("/templates/:templateId", requireTrainer, async (req, res) => {
  try {
    const templateId = param(req.params.templateId);
    await db.delete(trainingDayTemplateExercisesTable).where(eq(trainingDayTemplateExercisesTable.templateId, templateId));
    await db.delete(trainingDayTemplatesTable).where(eq(trainingDayTemplatesTable.id, templateId));
    return void res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete template");
    return void res.status(500).json({ error: "Template verwijderen mislukt" });
  }
});

/** POST /api/plans/templates/:templateId/exercises — Add exercise to template */
router.post("/templates/:templateId/exercises", requireTrainer, async (req, res) => {
  try {
    const templateId = param(req.params.templateId);
    const [template] = await db.select().from(trainingDayTemplatesTable).where(eq(trainingDayTemplatesTable.id, templateId));
    if (!template) return void res.status(404).json({ error: "Template niet gevonden" });

    const name = clean(req.body?.name);
    if (!name) return void res.status(400).json({ error: "Naam is verplicht" });

    const [exercise] = await db
      .insert(trainingDayTemplateExercisesTable)
      .values({
        id: randomId("tpe"),
        templateId,
        exerciseLibraryId: clean(req.body?.exerciseLibraryId),
        name,
        videoUrl: clean(req.body?.videoUrl),
        imageUrl: clean(req.body?.imageUrl),
        notes: clean(req.body?.notes),
        sets: intValue(req.body?.sets, 3),
        repRange: clean(req.body?.repRange),
        targetRpe: clean(req.body?.targetRpe),
        sortOrder: intValue(req.body?.sortOrder, Date.now()),
      })
      .returning();

    return void res.status(201).json(exercise);
  } catch (err) {
    req.log.error({ err }, "Failed to add exercise to template");
    return void res.status(500).json({ error: "Oefening toevoegen aan template mislukt" });
  }
});

/** DELETE /api/plans/templates/:templateId/exercises/:exerciseId — Remove exercise from template */
router.delete("/templates/:templateId/exercises/:exerciseId", requireTrainer, async (req, res) => {
  try {
    const exerciseId = param(req.params.exerciseId);
    await db.delete(trainingDayTemplateExercisesTable).where(eq(trainingDayTemplateExercisesTable.id, exerciseId));
    return void res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete template exercise");
    return void res.status(500).json({ error: "Oefening verwijderen mislukt" });
  }
});

/** PUT /api/plans/templates/:templateId/exercises/:exerciseId — Reorder/update template exercise */
router.put("/templates/:templateId/exercises/:exerciseId", requireTrainer, async (req, res) => {
  try {
    const exerciseId = param(req.params.exerciseId);
    const [existing] = await db.select().from(trainingDayTemplateExercisesTable).where(eq(trainingDayTemplateExercisesTable.id, exerciseId));
    if (!existing) return void res.status(404).json({ error: "Oefening niet gevonden" });

    const [updated] = await db
      .update(trainingDayTemplateExercisesTable)
      .set({
        name: req.body?.name !== undefined ? clean(req.body.name) || existing.name : undefined,
        sets: req.body?.sets !== undefined ? intValue(req.body.sets, existing.sets) : undefined,
        repRange: req.body?.repRange !== undefined ? clean(req.body.repRange) : undefined,
        targetRpe: req.body?.targetRpe !== undefined ? clean(req.body.targetRpe) : undefined,
        notes: req.body?.notes !== undefined ? clean(req.body.notes) : undefined,
        sortOrder: req.body?.sortOrder !== undefined ? intValue(req.body.sortOrder, existing.sortOrder) : undefined,
      })
      .where(eq(trainingDayTemplateExercisesTable.id, exerciseId))
      .returning();

    return void res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update template exercise");
    return void res.status(500).json({ error: "Oefening bijwerken mislukt" });
  }
});

/** POST /api/plans/week/:weekNumber/bulk-adjust — Apply bulk adjustments to all exercises in a week */
router.post("/week/:weekNumber/bulk-adjust", requireTrainer, async (req, res) => {
  try {
    const clientId = getScopedClientId(req);
    const weekNumber = intValue(req.params.weekNumber, 1);
    const action = clean(req.body?.action);
    // actions: 'weight+10', 'weight-10', 'reps+1', 'reps-1', 'sets+1', 'sets-1', 'deload'
    if (!action) return void res.status(400).json({ error: "Actie is verplicht" });

    const REP_RANGES = ["1-5", "5-8", "6-10", "8-12", "10-15", "12-20"];

    const exercises = await db
      .select()
      .from(plannedWorkoutExercisesTable)
      .where(and(eq(plannedWorkoutExercisesTable.clientId, clientId), eq(plannedWorkoutExercisesTable.weekNumber, weekNumber)));

    for (const ex of exercises) {
      const updates: Partial<typeof plannedWorkoutExercisesTable.$inferInsert> = {};

      if (action === "weight+10" || action === "weight-10") {
        if (ex.targetRpe) {
          // RPE-based: adjust RPE slightly (increase difficulty = lower RPE target)
          const rpe = parseFloat(String(ex.targetRpe));
          if (!isNaN(rpe)) {
            updates.targetRpe = String(Math.min(10, Math.max(6, action === "weight+10" ? rpe + 0.5 : rpe - 0.5)));
          }
        }
        // We don't store prescribed weight in exercises currently, so just note this in notes
        updates.notes = ex.notes ? ex.notes : action === "weight+10" ? "+10% gewicht" : "-10% gewicht";
      }

      if (action === "reps+1" || action === "reps-1" || action === "deload") {
        const currentRangeIdx = REP_RANGES.indexOf(ex.repRange || "");
        if (currentRangeIdx >= 0) {
          let newIdx = currentRangeIdx;
          if (action === "reps+1") newIdx = Math.min(REP_RANGES.length - 1, currentRangeIdx + 1);
          if (action === "reps-1" || action === "deload") newIdx = Math.max(0, currentRangeIdx - (action === "deload" ? 2 : 1));
          updates.repRange = REP_RANGES[newIdx];
        }
      }

      if (action === "sets+1") updates.sets = (ex.sets || 3) + 1;
      if (action === "sets-1" || action === "deload") updates.sets = Math.max(1, (ex.sets || 3) - 1);

      if (Object.keys(updates).length > 0) {
        await db.update(plannedWorkoutExercisesTable).set(updates).where(eq(plannedWorkoutExercisesTable.id, ex.id));
      }
    }

    syncWorkbook(req, clientId, weekNumber);
    return void res.json({ updated: exercises.length, action, weekNumber });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk adjust exercises");
    return void res.status(500).json({ error: "Bulk aanpassing mislukt" });
  }
});

export default router;
