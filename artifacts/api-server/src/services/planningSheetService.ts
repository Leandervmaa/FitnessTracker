import { db } from "@workspace/db";
import {
  exerciseSetLogsTable,
  nutritionTargetsTable,
  plannedWorkoutExercisesTable,
  plannedWorkoutsTable,
  type ExerciseSetLog,
} from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getClientLiveSheet } from "./clientSheetService.js";
import { appendRow, ensureSheet, writeRange } from "./sheetsService.js";
import { getWeekPlan } from "./planningService.js";

function sheetRange(sheetName: string, range: string) {
  return `'${sheetName.replace(/'/g, "''")}'!${range}`;
}

function value(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input);
}

function padRows(rows: string[][], columns: number, totalRows: number) {
  const padded = rows.map((row) => {
    const next = [...row];
    while (next.length < columns) next.push("");
    return next;
  });
  while (padded.length < totalRows) padded.push(Array(columns).fill(""));
  return padded;
}

export async function syncPlannedWeekToSheet(clientId: string, weekNumber: number): Promise<void> {
  const liveSheet = await getClientLiveSheet(clientId);
  if (!liveSheet.spreadsheetId) return;

  const sheetName = `Week ${weekNumber}`;
  const templateSheetName = weekNumber > 1 ? `Week ${weekNumber - 1}` : null;
  const ensured = await ensureSheet(sheetName, liveSheet.spreadsheetId, templateSheetName);
  if (!ensured) return;

  const plan = await getWeekPlan(clientId, weekNumber);
  const rows: string[][] = [
    [`Week ${weekNumber}`, "", "", "", "", "", "", "", ""],
    ["Training", "Dag", "Oefening", "Sets", "Reps", "RPE", "Video", "Notities", "Ingevuld"],
  ];

  for (const workout of plan) {
    rows.push([workout.name, workout.dayLabel, "", "", "", "", "", "", `${workout.completedSetCount}/${workout.plannedSetCount} sets`]);
    for (const exercise of workout.exercises) {
      const latest = exercise.currentSetLogs
        .map((log) => `S${log.setNumber}: ${value(log.weight)}kg x ${value(log.reps)}${log.rpe ? ` @${log.rpe}` : ""}`)
        .join(" | ");
      rows.push([
        workout.name,
        workout.dayLabel,
        exercise.name,
        value(exercise.sets),
        value(exercise.repRange),
        value(exercise.targetRpe),
        value(exercise.videoUrl),
        value(exercise.notes),
        latest,
      ]);
    }
    rows.push(["", "", "", "", "", "", "", "", ""]);
  }

  await writeRange(sheetRange(sheetName, "A1:I160"), padRows(rows, 9, 160), liveSheet.spreadsheetId);
  await syncWeekComparisonToSheet(clientId);
}

export async function syncWeekComparisonToSheet(clientId: string): Promise<void> {
  const liveSheet = await getClientLiveSheet(clientId);
  if (!liveSheet.spreadsheetId) return;

  const ensured = await ensureSheet("Week vergelijking", liveSheet.spreadsheetId);
  if (!ensured) return;

  const workouts = await db
    .select()
    .from(plannedWorkoutsTable)
    .where(eq(plannedWorkoutsTable.clientId, clientId))
    .orderBy(asc(plannedWorkoutsTable.weekNumber), asc(plannedWorkoutsTable.sortOrder));

  const exercises = await db
    .select()
    .from(plannedWorkoutExercisesTable)
    .where(eq(plannedWorkoutExercisesTable.clientId, clientId));

  const logs = await db
    .select()
    .from(exerciseSetLogsTable)
    .where(eq(exerciseSetLogsTable.clientId, clientId));

  const byWeek = new Map<number, { workouts: number; exercises: number; plannedSets: number; completedSets: number }>();
  for (const workout of workouts) {
    const stats = byWeek.get(workout.weekNumber) || { workouts: 0, exercises: 0, plannedSets: 0, completedSets: 0 };
    stats.workouts += 1;
    byWeek.set(workout.weekNumber, stats);
  }
  for (const exercise of exercises) {
    const stats = byWeek.get(exercise.weekNumber) || { workouts: 0, exercises: 0, plannedSets: 0, completedSets: 0 };
    stats.exercises += 1;
    stats.plannedSets += exercise.sets || 0;
    byWeek.set(exercise.weekNumber, stats);
  }
  for (const log of logs) {
    const stats = byWeek.get(log.weekNumber) || { workouts: 0, exercises: 0, plannedSets: 0, completedSets: 0 };
    stats.completedSets += 1;
    byWeek.set(log.weekNumber, stats);
  }

  const rows = [
    ["Week", "Trainingen", "Oefeningen", "Sets gepland", "Sets ingevuld", "Afronding", "Laatste update"],
    ...Array.from(byWeek.entries())
      .sort(([a], [b]) => a - b)
      .map(([week, stats]) => [
        String(week),
        String(stats.workouts),
        String(stats.exercises),
        String(stats.plannedSets),
        String(stats.completedSets),
        stats.plannedSets > 0 ? `${Math.round((stats.completedSets / stats.plannedSets) * 100)}%` : "0%",
        new Date().toLocaleDateString("nl-NL"),
      ]),
  ];

  await writeRange(sheetRange("Week vergelijking", "A1:G100"), padRows(rows, 7, 100), liveSheet.spreadsheetId);
}

export async function syncNutritionTargetsToSheet(clientId: string): Promise<void> {
  const liveSheet = await getClientLiveSheet(clientId);
  if (!liveSheet.spreadsheetId) return;

  const ensured = await ensureSheet("Voeding", liveSheet.spreadsheetId);
  if (!ensured) return;

  const targets = await db
    .select()
    .from(nutritionTargetsTable)
    .where(eq(nutritionTargetsTable.clientId, clientId))
    .orderBy(asc(nutritionTargetsTable.sortOrder));

  const target = targets[0] ?? null;
  const rows = [
    ["Doel", "Kcal", "Eiwit", "Koolhydraten", "Vet", "Water ml", "Laatste update"],
    [
      "Dagelijks doel",
      value(target?.kcal),
      value(target?.proteinG),
      value(target?.carbsG),
      value(target?.fatG),
      value(target?.waterMl),
      new Date().toLocaleDateString("nl-NL"),
    ],
  ];

  await writeRange(sheetRange("Voeding", "A1:G30"), padRows(rows, 7, 30), liveSheet.spreadsheetId);
}

export async function writePlannedSetLogToSheet(input: {
  clientId: string;
  log: ExerciseSetLog;
  workoutName: string;
  exerciseName: string;
}): Promise<void> {
  const liveSheet = await getClientLiveSheet(input.clientId);
  if (!liveSheet.spreadsheetId) return;

  await appendRow(
    "Logboek!A:Z",
    [[
      value(input.log.weekNumber),
      input.workoutName,
      input.exerciseName,
      `Set ${input.log.setNumber}`,
      value(input.log.weight),
      value(input.log.reps),
      value(input.log.rpe),
      value(input.log.notes),
      new Date().toLocaleString("nl-NL"),
    ]],
    liveSheet.spreadsheetId,
  );

  try {
    await syncPlannedWeekToSheet(input.clientId, input.log.weekNumber);
  } catch (err) {
    logger.warn({ err, clientId: input.clientId }, "Failed to resync planned week after set log");
  }
}
