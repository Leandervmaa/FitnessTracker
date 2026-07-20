/**
 * importService.ts
 *
 * Reads a parsed Excel file and upserts its training data into the database.
 * This is called after every Excel upload so the weekplanner stays in sync.
 *
 * Strategy:
 * - Only creates weeks/workouts/exercises that DON'T already exist in the DB
 *   (matched by weekNumber + workout name + exercise name).
 * - Existing set logs are NEVER overwritten (those are real client data).
 * - Nutrition targets are ALWAYS replaced (they come from the trainer's sheet).
 * - Before overwriting anything, a snapshot of the current DB state is saved
 *   so trainers can undo the import.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  exerciseSetLogsTable,
  exerciseLibraryTable,
  feedbackAnswersTable,
  nutritionEntriesTable,
  nutritionTargetsTable,
  plannedWorkoutExercisesTable,
  plannedWorkoutsTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { randomId } from "./identityService.js";
import { parseExcelFile, getExcelPath, type ParsedExcelData } from "./excelParser.js";

// ─── Snapshot store (in-memory, per client) ──────────────────────────────────
// Stores the last DB state before an import so it can be rolled back.

type WorkoutSnapshot = typeof plannedWorkoutsTable.$inferSelect & {
  exercises: (typeof plannedWorkoutExercisesTable.$inferSelect)[];
};

const snapshotStore = new Map<string, { createdAt: Date; workouts: WorkoutSnapshot[] }>();

export async function saveImportSnapshot(clientId: string): Promise<void> {
  const workouts = await db
    .select()
    .from(plannedWorkoutsTable)
    .where(eq(plannedWorkoutsTable.clientId, clientId));

  const exercises =
    workouts.length > 0
      ? await db
          .select()
          .from(plannedWorkoutExercisesTable)
          .where(inArray(plannedWorkoutExercisesTable.workoutId, workouts.map((w) => w.id)))
      : [];

  const snapshot: WorkoutSnapshot[] = workouts.map((w) => ({
    ...w,
    exercises: exercises.filter((e) => e.workoutId === w.id),
  }));

  snapshotStore.set(clientId, { createdAt: new Date(), workouts: snapshot });
  logger.info({ clientId, weekCount: snapshot.length }, "Import snapshot saved");
}

export function hasImportSnapshot(clientId: string): boolean {
  return snapshotStore.has(clientId);
}

export async function rollbackImport(clientId: string): Promise<{ rolledBack: boolean; message: string }> {
  const snapshot = snapshotStore.get(clientId);
  if (!snapshot) {
    return { rolledBack: false, message: "Geen snapshot beschikbaar om ongedaan te maken" };
  }

  // Delete all current workouts and exercises for this client
  const currentWorkouts = await db
    .select()
    .from(plannedWorkoutsTable)
    .where(eq(plannedWorkoutsTable.clientId, clientId));

  if (currentWorkouts.length > 0) {
    await db
      .delete(plannedWorkoutExercisesTable)
      .where(inArray(plannedWorkoutExercisesTable.workoutId, currentWorkouts.map((w) => w.id)));
    await db.delete(plannedWorkoutsTable).where(eq(plannedWorkoutsTable.clientId, clientId));
  }

  // Restore snapshot
  for (const workout of snapshot.workouts) {
    const { exercises, ...workoutData } = workout;
    await db.insert(plannedWorkoutsTable).values(workoutData).onConflictDoNothing();
    if (exercises.length > 0) {
      await db.insert(plannedWorkoutExercisesTable).values(exercises).onConflictDoNothing();
    }
  }

  snapshotStore.delete(clientId);
  logger.info({ clientId }, "Import rolled back to snapshot");
  return { rolledBack: true, message: "Import ongedaan gemaakt. De vorige planning is hersteld." };
}

// ─── Main import function ─────────────────────────────────────────────────────

export async function importExcelToDb(
  clientId: string,
  data: ParsedExcelData,
): Promise<{
  weeksImported: number;
  workoutsCreated: number;
  exercisesCreated: number;
  setLogsImported: number;
  nutritionEntriesImported: number;
  feedbackAnswersImported: number;
}> {
  let weeksImported = 0;
  let workoutsCreated = 0;
  let exercisesCreated = 0;
  let setLogsImported = 0;
  let nutritionEntriesImported = 0;
  let feedbackAnswersImported = 0;

  // Build a lookup of existing exercises in the library by name (lowercase)
  const libraryItems = await db.select().from(exerciseLibraryTable);
  const libraryByName = new Map(libraryItems.map((item) => [item.name.toLowerCase().trim(), item]));

  for (const parsedWeek of data.weeks) {
    const { weekNumber } = parsedWeek;

    // Get existing workouts for this week
    const existingWorkouts = await db
      .select()
      .from(plannedWorkoutsTable)
      .where(and(eq(plannedWorkoutsTable.clientId, clientId), eq(plannedWorkoutsTable.weekNumber, weekNumber)));

    const existingWorkoutNames = new Set(existingWorkouts.map((w) => w.name.toLowerCase().trim()));

    for (let wIdx = 0; wIdx < parsedWeek.workouts.length; wIdx++) {
      const parsedWorkout = parsedWeek.workouts[wIdx];
      const workoutNameKey = parsedWorkout.name.toLowerCase().trim();

      let workoutId: string;
      let existingWorkout = existingWorkouts.find((w) => w.name.toLowerCase().trim() === workoutNameKey);

      if (!existingWorkout) {
        // Create the workout
        const [created] = await db
          .insert(plannedWorkoutsTable)
          .values({
            id: randomId("pw"),
            clientId,
            weekNumber,
            name: parsedWorkout.name,
            dayLabel: parsedWorkout.dayLabel || parsedWorkout.name,
            sortOrder: wIdx,
          })
          .returning();
        existingWorkout = created;
        workoutsCreated++;
      }

      workoutId = existingWorkout.id;

      // Get existing exercises for this workout
      const existingExercises = await db
        .select()
        .from(plannedWorkoutExercisesTable)
        .where(eq(plannedWorkoutExercisesTable.workoutId, workoutId));

      const existingExerciseNames = new Set(existingExercises.map((e) => e.name.toLowerCase().trim()));

      for (let eIdx = 0; eIdx < parsedWorkout.exercises.length; eIdx++) {
        const parsedEx = parsedWorkout.exercises[eIdx];
        const exNameKey = parsedEx.name.toLowerCase().trim();
        let plannedExerciseId: string | null = null;
        let exerciseLibraryId: string | null = null;

        if (existingExerciseNames.has(exNameKey)) {
          const existing = existingExercises.find((e) => e.name.toLowerCase().trim() === exNameKey);
          if (existing) {
            plannedExerciseId = existing.id;
            exerciseLibraryId = existing.exerciseLibraryId ?? null;
            await db
              .update(plannedWorkoutExercisesTable)
              .set({
                sets: parsedEx.sets ?? existing.sets,
                repRange: parsedEx.reps ?? existing.repRange,
                notes: parsedEx.notes ?? existing.notes,
                videoUrl: parsedEx.videoUrl ?? existing.videoUrl,
                imageUrl: parsedEx.imageUrl ?? existing.imageUrl,
                sortOrder: eIdx,
              })
              .where(eq(plannedWorkoutExercisesTable.id, existing.id));
          }
        } else {
          // Find or create library entry
          const libraryMatch = libraryByName.get(exNameKey);
          let libraryId = libraryMatch?.id ?? null;

          if (!libraryId && parsedEx.name.trim()) {
            // Auto-create in library
            const [newLib] = await db
              .insert(exerciseLibraryTable)
              .values({
                id: randomId("ex"),
                name: parsedEx.name,
                videoUrl: parsedEx.videoUrl,
                imageUrl: parsedEx.imageUrl,
                notes: parsedEx.notes,
                source: "excel_import",
                isGlobal: true,
              })
              .returning();
            libraryId = newLib.id;
            libraryByName.set(exNameKey, newLib);
          }

          const [createdExercise] = await db.insert(plannedWorkoutExercisesTable).values({
            id: randomId("pe"),
            workoutId,
            clientId,
            weekNumber,
            exerciseLibraryId: libraryId,
            name: parsedEx.name,
            videoUrl: parsedEx.videoUrl,
            imageUrl: parsedEx.imageUrl,
            notes: parsedEx.notes,
            sets: parsedEx.sets ?? 3,
            repRange: parsedEx.reps,
            sortOrder: eIdx,
          }).returning();

          plannedExerciseId = createdExercise.id;
          exerciseLibraryId = libraryId;
          exercisesCreated++;
        }

        if (plannedExerciseId) {
          setLogsImported += await importSetLogs({
            clientId,
            weekNumber,
            workoutId,
            plannedExerciseId,
            exerciseLibraryId,
            sheetWeights: parsedEx.sheetWeights,
            sheetReps: parsedEx.sheetReps,
          });
        }
      }
    }

    weeksImported++;
  }

  // Nutrition target: always replace from sheet (trainer's prescribed values)
  if (data.nutritionTarget) {
    await db.delete(nutritionTargetsTable).where(eq(nutritionTargetsTable.clientId, clientId));
    await db.insert(nutritionTargetsTable).values({
      id: randomId("nt"),
      clientId,
      dayLabel: "Dagelijks",
      kcal: data.nutritionTarget.kcal ?? null,
      proteinG: data.nutritionTarget.eiwitten ?? null,
      carbsG: data.nutritionTarget.koolhydraten ?? null,
      fatG: data.nutritionTarget.vetten ?? null,
      waterMl: data.nutritionTarget.waterL ? Math.round(data.nutritionTarget.waterL * 1000) : null,
      sortOrder: 0,
    });
  }

  for (const progressieWeek of data.progressie) {
    for (const day of progressieWeek.days) {
      if (!hasProgressieDayData(day)) continue;

      const existing = await db
        .select()
        .from(nutritionEntriesTable)
        .where(
          and(
            eq(nutritionEntriesTable.clientId, clientId),
            eq(nutritionEntriesTable.weekNumber, progressieWeek.weekNumber),
            eq(nutritionEntriesTable.day, day.dayId),
          ),
        );

      if (existing.length > 0) continue;

      await db.insert(nutritionEntriesTable).values({
        clientId,
        weekNumber: progressieWeek.weekNumber,
        day: day.dayId,
        dayLabel: day.dagNl,
        kcal: numberToDb(day.kcal),
        slaapUren: numberToDb(day.slaap),
        stressNiveau: day.stress !== null ? Math.round(day.stress) : null,
        energieNiveau: day.energieniveau !== null ? Math.round(day.energieniveau) : null,
        lichaamsgewicht: numberToDb(day.gewicht),
        notes: JSON.stringify({
          metrics: {
            slaapUren: valueToFormString(day.slaap),
            stressNiveau: valueToFormString(day.stress),
            energieNiveau: valueToFormString(day.energieniveau),
            krachtniveau: valueToFormString(day.krachtniveau),
            lichaamsgewicht: valueToFormString(day.gewicht),
            buikomvang: valueToFormString(day.buikomvang),
            heupomvang: valueToFormString(day.heupomvang),
            stappen: valueToFormString(day.stappen),
            manualKcal: valueToFormString(day.kcal),
            schouders: valueToFormString(day.schouders),
            borstLats: valueToFormString(day.borstLats),
            armLinks: valueToFormString(day.armLinks),
            armRechts: valueToFormString(day.armRechts),
            beenLinks: valueToFormString(day.beenLinks),
            beenRechts: valueToFormString(day.beenRechts),
            kuitLinks: valueToFormString(day.kuitLinks),
            kuitRechts: valueToFormString(day.kuitRechts),
            heupBil: valueToFormString(day.heupBil),
          },
          text: "",
        }),
      });
      nutritionEntriesImported++;
    }
  }

  for (const feedbackAnswer of data.feedbackAnswers) {
    if (!feedbackAnswer.answer.trim()) continue;

    const existing = await db
      .select()
      .from(feedbackAnswersTable)
      .where(
        and(
          eq(feedbackAnswersTable.clientId, clientId),
          eq(feedbackAnswersTable.weekNumber, feedbackAnswer.weekNumber),
          eq(feedbackAnswersTable.questionId, feedbackAnswer.questionId),
        ),
      );

    if (existing.length > 0) continue;

    await db.insert(feedbackAnswersTable).values({
      clientId,
      weekNumber: feedbackAnswer.weekNumber,
      questionId: feedbackAnswer.questionId,
      answer: feedbackAnswer.answer,
    });
    feedbackAnswersImported++;
  }

  logger.info(
    { clientId, weeksImported, workoutsCreated, exercisesCreated, setLogsImported, nutritionEntriesImported, feedbackAnswersImported },
    "Excel imported to database",
  );

  return { weeksImported, workoutsCreated, exercisesCreated, setLogsImported, nutritionEntriesImported, feedbackAnswersImported };
}

export async function importExcelFileToDb(clientId: string): Promise<{
  weeksImported: number;
  workoutsCreated: number;
  exercisesCreated: number;
  setLogsImported: number;
  nutritionEntriesImported: number;
  feedbackAnswersImported: number;
} | null> {
  const excelPath = getExcelPath(clientId);
  const data = parseExcelFile(excelPath);
  if (!data) return null;
  return importExcelToDb(clientId, data);
}

function splitNumericList(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number.parseFloat(part.trim().replace(",", ".")))
    .filter((num) => Number.isFinite(num));
}

function numberToDb(value: number | null | undefined): string | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? String(value) : null;
}

function valueToFormString(value: number | null | undefined): string {
  return value !== null && value !== undefined && Number.isFinite(value) ? String(value) : "";
}

async function importSetLogs({
  clientId,
  weekNumber,
  workoutId,
  plannedExerciseId,
  exerciseLibraryId,
  sheetWeights,
  sheetReps,
}: {
  clientId: string;
  weekNumber: number;
  workoutId: string;
  plannedExerciseId: string;
  exerciseLibraryId: string | null;
  sheetWeights: string | null;
  sheetReps: string | null;
}): Promise<number> {
  const weights = splitNumericList(sheetWeights);
  const reps = splitNumericList(sheetReps);
  const setCount = Math.max(weights.length, reps.length);
  if (setCount === 0) return 0;

  const existingLogs = await db
    .select()
    .from(exerciseSetLogsTable)
    .where(
      and(
        eq(exerciseSetLogsTable.clientId, clientId),
        eq(exerciseSetLogsTable.plannedExerciseId, plannedExerciseId),
      ),
    );
  const existingSetNumbers = new Set(existingLogs.map((log) => log.setNumber));
  let imported = 0;

  for (let index = 0; index < setCount; index++) {
    const setNumber = index + 1;
    if (existingSetNumbers.has(setNumber)) continue;

    const weight = weights[index];
    const repsValue = reps[index];
    const hasWeight = Number.isFinite(weight);
    const hasReps = Number.isFinite(repsValue);
    if (!hasWeight && !hasReps) continue;

    await db.insert(exerciseSetLogsTable).values({
      clientId,
      plannedWorkoutId: workoutId,
      plannedExerciseId,
      exerciseLibraryId,
      weekNumber,
      setNumber,
      reps: hasReps ? Math.round(repsValue) : null,
      weight: hasWeight ? String(weight) : null,
      notes: "Geimporteerd uit spreadsheet",
    });
    imported++;
  }

  return imported;
}

function hasProgressieDayData(day: ParsedExcelData["progressie"][number]["days"][number]): boolean {
  return [
    day.gewicht,
    day.kcal,
    day.buikomvang,
    day.heupomvang,
    day.krachtniveau,
    day.energieniveau,
    day.slaap,
    day.stress,
    day.stappen,
    day.schouders,
    day.borstLats,
    day.armLinks,
    day.armRechts,
    day.beenLinks,
    day.beenRechts,
    day.kuitLinks,
    day.kuitRechts,
    day.heupBil,
  ].some((value) => value !== null && value !== undefined);
}
