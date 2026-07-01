import { asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  exerciseSetLogsTable,
  feedbackAnswersTable,
  feedbackQuestionsTable,
  nutritionEntriesTable,
  nutritionTargetsTable,
  plannedWorkoutExercisesTable,
  plannedWorkoutsTable,
  type ExerciseSetLog,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { getClientLiveSheet } from "./clientSheetService.js";
import { batchUpdate, ensureSheet, getSpreadsheetSheets, writeRange } from "./sheetsService.js";
import { getWeekPlan } from "./planningService.js";

const DAYS = [
  { id: "mon", label: "Maandag" },
  { id: "tue", label: "Dinsdag" },
  { id: "wed", label: "Woensdag" },
  { id: "thu", label: "Donderdag" },
  { id: "fri", label: "Vrijdag" },
  { id: "sat", label: "Zaterdag" },
  { id: "sun", label: "Zondag" },
];

const LOGBOOK_FIELDS = [
  { label: "Kcal", key: "kcal" },
  { label: "Eiwit g", key: "eiwittenG" },
  { label: "Koolhydraten g", key: "koolhydratenG" },
  { label: "Vet g", key: "vetenG" },
  { label: "Water ml", key: "waterMl" },
  { label: "Lichaamsgewicht", key: "lichaamsgewicht" },
  { label: "Buikomvang", key: "buikomvang" },
  { label: "Heupomvang", key: "heupomvang" },
  { label: "Energie", key: "energieNiveau" },
  { label: "Slaap uren", key: "slaapUren" },
  { label: "Stress", key: "stressNiveau" },
  { label: "Stappen", key: "stappen" },
  { label: "Schouders", key: "schouders" },
  { label: "Borst/Lats", key: "borstLats" },
  { label: "Arm links", key: "armLinks" },
  { label: "Arm rechts", key: "armRechts" },
  { label: "Been links", key: "beenLinks" },
  { label: "Been rechts", key: "beenRechts" },
  { label: "Kuit links", key: "kuitLinks" },
  { label: "Kuit rechts", key: "kuitRechts" },
  { label: "Heup/Bil", key: "heupBil" },
  { label: "Notities", key: "notes" },
];

type NutritionEntry = typeof nutritionEntriesTable.$inferSelect;

function sheetRange(sheetName: string, range: string) {
  return `'${sheetName.replace(/'/g, "''")}'!${range}`;
}

async function prepareSheetLayout(
  spreadsheetId: string,
  sheetName: string,
  columns: number,
  rows: number,
  frozenRows = 2,
) {
  const sheets = await getSpreadsheetSheets(spreadsheetId);
  const sheet = sheets?.find((item) => item.title === sheetName);
  if (!sheet) return;

  await batchUpdate(
    [
      {
        updateSheetProperties: {
          properties: {
            sheetId: sheet.sheetId,
            hiddenGridlines: true,
            gridProperties: {
              rowCount: rows,
              columnCount: columns,
              frozenRowCount: frozenRows,
            },
          },
          fields: "hiddenGridlines,gridProperties(rowCount,columnCount,frozenRowCount)",
        },
      },
      {
        repeatCell: {
          range: {
            sheetId: sheet.sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: columns,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.09, green: 0.16, blue: 0.26 },
              horizontalAlignment: "CENTER",
              textFormat: {
                bold: true,
                fontSize: 13,
                foregroundColor: { red: 1, green: 1, blue: 1 },
              },
            },
          },
          fields: "userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)",
        },
      },
      {
        repeatCell: {
          range: {
            sheetId: sheet.sheetId,
            startRowIndex: 1,
            endRowIndex: 2,
            startColumnIndex: 0,
            endColumnIndex: columns,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.85, green: 0.9, blue: 0.96 },
              textFormat: { bold: true },
              wrapStrategy: "WRAP",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,wrapStrategy)",
        },
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId: sheet.sheetId,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: columns,
          },
          properties: { pixelSize: 125 },
          fields: "pixelSize",
        },
      },
      {
        updateDimensionProperties: {
          range: {
            sheetId: sheet.sheetId,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: 1,
          },
          properties: { pixelSize: 170 },
          fields: "pixelSize",
        },
      },
    ],
    spreadsheetId,
  );
}

function value(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input);
}

function numeric(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  const number = Number(String(input).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function padRows(rows: string[][], columns: number, totalRows: number) {
  const padded = rows.map((row) => {
    const next = [...row];
    while (next.length < columns) next.push("");
    return next.slice(0, columns);
  });
  while (padded.length < totalRows) padded.push(Array(columns).fill(""));
  return padded;
}

function parseEntryNotes(notes: string | null): { metrics: Record<string, string>; text: string } {
  if (!notes) return { metrics: {}, text: "" };
  try {
    const parsed = JSON.parse(notes);
    return {
      metrics: parsed.metrics || {},
      text: parsed.text || "",
    };
  } catch {
    return { metrics: {}, text: notes };
  }
}

function entryValue(entry: NutritionEntry | undefined, key: string): string {
  if (!entry) return "";
  const { metrics, text } = parseEntryNotes(entry.notes);
  if (key === "notes") return text;
  if (key in entry) return value(entry[key as keyof NutritionEntry]);
  return value(metrics[key]);
}

function average(values: string[]): string {
  const nums = values.map(numeric).filter((num): num is number => num !== null);
  if (nums.length === 0) return "";
  const avg = nums.reduce((sum, num) => sum + num, 0) / nums.length;
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
}

function groupByWeek(entries: NutritionEntry[]): Map<number, NutritionEntry[]> {
  const map = new Map<number, NutritionEntry[]>();
  for (const entry of entries) {
    const current = map.get(entry.weekNumber) || [];
    current.push(entry);
    map.set(entry.weekNumber, current);
  }
  return map;
}

async function getNutritionEntries(clientId: string): Promise<NutritionEntry[]> {
  return db
    .select()
    .from(nutritionEntriesTable)
    .where(eq(nutritionEntriesTable.clientId, clientId))
    .orderBy(asc(nutritionEntriesTable.weekNumber), asc(nutritionEntriesTable.day));
}

export async function syncPlannedWeekToSheet(clientId: string, weekNumber: number): Promise<void> {
  const liveSheet = await getClientLiveSheet(clientId);
  if (!liveSheet.spreadsheetId) return;

  const sheetName = `Week ${weekNumber}`;
  const templateSheetName = weekNumber > 1 ? `Week ${weekNumber - 1}` : null;
  const ensured = await ensureSheet(sheetName, liveSheet.spreadsheetId, templateSheetName);
  if (!ensured) return;
  await prepareSheetLayout(liveSheet.spreadsheetId, sheetName, 9, 220);

  const plan = await getWeekPlan(clientId, weekNumber);
  const rows: string[][] = [
    [`Trainingsprogramma - Week ${weekNumber}`, "", "", "", "", "", "", "", ""],
    ["Dag", "Training", "Oefening", "Sets", "Reps", "RPE", "Video", "Notities", "Ingevuld"],
  ];

  for (const workout of plan) {
    rows.push([workout.dayLabel, workout.name, "", "", "", "", "", "", `${workout.completedSetCount}/${workout.plannedSetCount} sets`]);
    for (const exercise of workout.exercises) {
      const latest = exercise.currentSetLogs
        .map((log) => `S${log.setNumber}: ${value(log.weight)}kg x ${value(log.reps)}${log.rpe ? ` @${log.rpe}` : ""}`)
        .join(" | ");
      rows.push([
        workout.dayLabel,
        workout.name,
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

  await writeRange(sheetRange(sheetName, "A1:I200"), padRows(rows, 9, 200), liveSheet.spreadsheetId);
  await syncWeekComparisonToSheet(clientId);
}

export async function syncWeekComparisonToSheet(clientId: string): Promise<void> {
  const liveSheet = await getClientLiveSheet(clientId);
  if (!liveSheet.spreadsheetId) return;

  const ensured = await ensureSheet("Week vergelijking", liveSheet.spreadsheetId);
  if (!ensured) return;
  await prepareSheetLayout(liveSheet.spreadsheetId, "Week vergelijking", 7, 140);

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
    ["Week vergelijking", "", "", "", "", "", ""],
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

  await writeRange(sheetRange("Week vergelijking", "A1:G120"), padRows(rows, 7, 120), liveSheet.spreadsheetId);
}

export async function syncNutritionTargetsToSheet(clientId: string): Promise<void> {
  const liveSheet = await getClientLiveSheet(clientId);
  if (!liveSheet.spreadsheetId) return;

  const ensured = await ensureSheet("Voedingsplan", liveSheet.spreadsheetId);
  if (!ensured) return;
  await prepareSheetLayout(liveSheet.spreadsheetId, "Voedingsplan", 9, 420);

  const [target] = await db
    .select()
    .from(nutritionTargetsTable)
    .where(eq(nutritionTargetsTable.clientId, clientId))
    .orderBy(asc(nutritionTargetsTable.sortOrder));

  const entries = await getNutritionEntries(clientId);
  const byWeek = groupByWeek(entries);
  const rows: string[][] = [
    ["Voedingsplan", "", "", "", "", "", "", "", ""],
    ["Dagelijks doel", "Kcal", "Eiwit", "Koolhydraten", "Vet", "Water ml", "Laatste update", "", ""],
    [
      "",
      value(target?.kcal),
      value(target?.proteinG),
      value(target?.carbsG),
      value(target?.fatG),
      value(target?.waterMl),
      new Date().toLocaleDateString("nl-NL"),
      "",
      "",
    ],
    ["", "", "", "", "", "", "", "", ""],
  ];

  for (const [weekNumber, weekEntries] of Array.from(byWeek.entries()).sort(([a], [b]) => a - b)) {
    rows.push([`Week ${weekNumber}`, "Dag", "Kcal", "Doel kcal", "Verschil", "Eiwit", "Koolhydraten", "Vet", "Binnen doel"]);
    for (const day of DAYS) {
      const entry = weekEntries.find((item) => item.day === day.id);
      const kcal = numeric(entry?.kcal);
      const targetKcal = target?.kcal ?? null;
      const diff = kcal !== null && targetKcal !== null ? kcal - targetKcal : null;
      rows.push([
        "",
        day.label,
        value(entry?.kcal),
        value(targetKcal),
        value(diff),
        value(entry?.eiwittenG),
        value(entry?.koolhydratenG),
        value(entry?.vetenG),
        diff === null ? "" : diff <= 0 ? "Ja" : "Boven doel",
      ]);
    }
    rows.push(["", "", "", "", "", "", "", "", ""]);
  }

  await writeRange(sheetRange("Voedingsplan", "A1:I400"), padRows(rows, 9, Math.max(400, rows.length + 20)), liveSheet.spreadsheetId);
}

export async function syncLogbookToSheet(clientId: string): Promise<void> {
  const liveSheet = await getClientLiveSheet(clientId);
  if (!liveSheet.spreadsheetId) return;

  const ensured = await ensureSheet("Logboek", liveSheet.spreadsheetId);
  if (!ensured) return;
  await prepareSheetLayout(liveSheet.spreadsheetId, "Logboek", 9, 650);

  const entries = await getNutritionEntries(clientId);
  const byWeek = groupByWeek(entries);
  const rows: string[][] = [
    ["Logboek", "", "", "", "", "", "", "", ""],
    ["Week", ...DAYS.map((day) => day.label), "Weekgemiddelde"],
  ];

  for (const [weekNumber, weekEntries] of Array.from(byWeek.entries()).sort(([a], [b]) => a - b)) {
    rows.push([`Week ${weekNumber}`, "", "", "", "", "", "", "", ""]);
    for (const field of LOGBOOK_FIELDS) {
      const dayValues = DAYS.map((day) => entryValue(weekEntries.find((entry) => entry.day === day.id), field.key));
      rows.push([field.label, ...dayValues, field.key === "notes" ? "" : average(dayValues)]);
    }
    rows.push(["", "", "", "", "", "", "", "", ""]);
  }

  await writeRange(sheetRange("Logboek", "A1:I600"), padRows(rows, 9, Math.max(600, rows.length + 20)), liveSheet.spreadsheetId);
}

export async function syncFeedbackToSheet(clientId: string): Promise<void> {
  const liveSheet = await getClientLiveSheet(clientId);
  if (!liveSheet.spreadsheetId) return;

  const ensured = await ensureSheet("Feedback", liveSheet.spreadsheetId);
  if (!ensured) return;
  await prepareSheetLayout(liveSheet.spreadsheetId, "Feedback", 4, 320);

  const questions = await db.select().from(feedbackQuestionsTable).orderBy(asc(feedbackQuestionsTable.order));
  const answers = await db
    .select()
    .from(feedbackAnswersTable)
    .where(eq(feedbackAnswersTable.clientId, clientId))
    .orderBy(asc(feedbackAnswersTable.weekNumber), asc(feedbackAnswersTable.questionId));

  const questionById = new Map(questions.map((question) => [question.id, question.question]));
  const weeks = Array.from(new Set(answers.map((answer) => answer.weekNumber))).sort((a, b) => a - b);
  const rows: string[][] = [
    ["Feedback", "", "", ""],
    ["Week", "Vraag", "Antwoord", "Laatste update"],
  ];

  for (const week of weeks) {
    rows.push([`Week ${week}`, "", "", ""]);
    for (const answer of answers.filter((item) => item.weekNumber === week)) {
      rows.push(["", questionById.get(answer.questionId) || `Vraag ${answer.questionId}`, answer.answer, new Date().toLocaleDateString("nl-NL")]);
    }
    rows.push(["", "", "", ""]);
  }

  await writeRange(sheetRange("Feedback", "A1:D300"), padRows(rows, 4, Math.max(300, rows.length + 20)), liveSheet.spreadsheetId);
}

export async function syncClientDataSheets(clientId: string): Promise<void> {
  await syncNutritionTargetsToSheet(clientId);
  await syncLogbookToSheet(clientId);
  await syncFeedbackToSheet(clientId);
}

export async function syncClientWorkbook(clientId: string, weekNumber?: number): Promise<void> {
  if (weekNumber !== undefined) {
    await syncPlannedWeekToSheet(clientId, weekNumber);
  }
  await syncClientDataSheets(clientId);
}

export async function writePlannedSetLogToSheet(input: {
  clientId: string;
  log: ExerciseSetLog;
  workoutName: string;
  exerciseName: string;
}): Promise<void> {
  try {
    await syncPlannedWeekToSheet(input.clientId, input.log.weekNumber);
  } catch (err) {
    logger.warn({ err, clientId: input.clientId }, "Failed to resync planned week after set log");
  }
}
