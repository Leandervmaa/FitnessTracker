/**
 * Parses data from the Dutch fitness spreadsheet structure.
 *
 * Known tab names:
 *   Dashboard, Intake, Week 1 t/m Week 12, Progressie,
 *   Voeding, Feedback, Logboek, Plan, Stamdata, Video links, Week schema
 */

import { readRange } from "./sheetsService.js";
import { logger } from "../lib/logger.js";

export interface SheetExercise {
  id: string;
  name: string;
  notes: string | null;
  sets: number | null;
  reps: string | null;
  prescribedWeight: string | null;
  videoUrl: string | null;
  order: number;
}

export interface SheetWorkout {
  id: string;
  name: string;
  dayLabel: string;
  exercises: SheetExercise[];
}

export interface SheetFeedbackQuestion {
  id: number;
  question: string;
  order: number;
}

export interface SheetNutritionTarget {
  kcal: number | null;
  eiwitten: number | null;
  koolhydraten: number | null;
  vetten: number | null;
  water: number | null;
}

function toNum(val: string | undefined): number | null {
  if (!val || val.trim() === "" || val.trim() === "-") return null;
  const n = parseFloat(val.replace(",", "."));
  return isNaN(n) ? null : n;
}

function toStr(val: string | undefined): string | null {
  if (!val || val.trim() === "" || val.trim() === "-") return null;
  return val.trim();
}

/** Video links tab: Column A = exercise name, Column B = URL */
export async function getVideoLinks(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const data = await readRange("Video links!A2:B200");
  if (!data) return map;

  for (const row of data) {
    const name = toStr(row[0]);
    const url = toStr(row[1]);
    if (name && url) {
      map.set(name.toLowerCase(), url);
      map.set(name.toLowerCase().replace(/\s+/g, ""), url);
    }
  }
  return map;
}

/** Parse a single week tab: "Week 1", "Week 2", etc. */
export async function getWeekWorkouts(
  weekNumber: number,
  videoLinks: Map<string, string>
): Promise<SheetWorkout[]> {
  const sheetName = `Week ${weekNumber}`;
  const data = await readRange(`${sheetName}!A1:Z200`);
  if (!data || data.length < 2) return [];

  // Find training block dividers by looking for rows with day/training headers
  // Pattern: rows with "Training A", "Training B", "Dag 1" etc. or Dutch day names
  const dayPatterns = [
    /training\s*[ABCD]/i,
    /dag\s*[1-4]/i,
    /maandag/i,
    /dinsdag/i,
    /woensdag/i,
    /donderdag/i,
    /vrijdag/i,
    /zaterdag/i,
    /zondag/i,
  ];

  const dayLabels: Record<string, string> = {
    maandag: "Maandag",
    dinsdag: "Dinsdag",
    woensdag: "Woensdag",
    donderdag: "Donderdag",
    vrijdag: "Vrijdag",
    zaterdag: "Zaterdag",
    zondag: "Zondag",
    "dag 1": "Dag 1",
    "dag 2": "Dag 2",
    "dag 3": "Dag 3",
    "dag 4": "Dag 4",
    "training a": "Training A",
    "training b": "Training B",
    "training c": "Training C",
    "training d": "Training D",
  };

  const workouts: SheetWorkout[] = [];
  let currentWorkout: SheetWorkout | null = null;
  let exerciseOrder = 0;

  // Find header row indices to detect data columns
  let nameCol = 0;
  let setsCol = -1;
  let repsCol = -1;
  let weightCol = -1;
  let notesCol = -1;

  // Look for header row
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i].map((c) => c?.toLowerCase() || "");
    const setsIdx = row.findIndex((c) => c.includes("set"));
    const repsIdx = row.findIndex(
      (c) => c.includes("rep") || c.includes("herhaling")
    );
    const weightIdx = row.findIndex(
      (c) => c.includes("gewicht") || c.includes("kg") || c.includes("load")
    );
    const notesIdx = row.findIndex(
      (c) => c.includes("bijzonderheden") || c.includes("opmerking") || c.includes("note")
    );
    if (setsIdx >= 0 || repsIdx >= 0) {
      setsCol = setsIdx;
      repsCol = repsIdx;
      weightCol = weightIdx;
      notesCol = notesIdx;
      break;
    }
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const firstCell = (row[0] || "").trim();
    if (!firstCell) continue;

    const firstLower = firstCell.toLowerCase();

    // Detect new training day
    const isDay =
      dayPatterns.some((p) => p.test(firstLower)) ||
      Object.keys(dayLabels).some((k) => firstLower.startsWith(k));

    if (isDay) {
      if (currentWorkout) workouts.push(currentWorkout);
      exerciseOrder = 0;

      const label =
        Object.entries(dayLabels).find(([k]) => firstLower.includes(k))?.[1] ||
        firstCell;

      const trainingLetter = firstCell.match(/[ABCD]$/)?.[0] || "";
      const workoutName = trainingLetter
        ? `Training ${trainingLetter}`
        : firstCell;

      currentWorkout = {
        id: `w${weekNumber}-${trainingLetter || workouts.length + 1}`,
        name: workoutName,
        dayLabel: label,
        exercises: [],
      };
      continue;
    }

    // Skip header/empty rows
    if (
      firstLower.includes("oefening") ||
      firstLower.includes("exercise") ||
      firstLower.includes("naam") ||
      firstLower.startsWith("#")
    )
      continue;

    // Parse exercise row
    if (currentWorkout) {
      exerciseOrder++;
      const name = firstCell;
      const sets =
        setsCol >= 0 ? toNum(row[setsCol]) : toNum(row[1]);
      const reps =
        repsCol >= 0 ? toStr(row[repsCol]) : toStr(row[2]);
      const weight =
        weightCol >= 0 ? toStr(row[weightCol]) : toStr(row[3]);
      const notes =
        notesCol >= 0 ? toStr(row[notesCol]) : toStr(row[2]);

      const videoKey = name.toLowerCase();
      const videoUrl =
        videoLinks.get(videoKey) ||
        videoLinks.get(name.toLowerCase().replace(/\s+/g, "")) ||
        null;

      const exerciseId = `w${weekNumber}-${currentWorkout.id.split("-").pop()}-${exerciseOrder}`;
      currentWorkout.exercises.push({
        id: exerciseId,
        name,
        notes,
        sets,
        reps,
        prescribedWeight: weight,
        videoUrl,
        order: exerciseOrder,
      });
    }
  }

  if (currentWorkout && currentWorkout.exercises.length > 0) {
    workouts.push(currentWorkout);
  }

  // Limit to 4 workouts
  return workouts.slice(0, 4);
}

/** Feedback tab: Column A = questions */
export async function getFeedbackQuestions(): Promise<SheetFeedbackQuestion[]> {
  const data = await readRange("Feedback!A1:A20");
  if (!data) return [];

  const questions: SheetFeedbackQuestion[] = [];
  for (let i = 0; i < data.length; i++) {
    const q = toStr(data[i][0]);
    if (q && q.endsWith("?")) {
      questions.push({ id: i + 1, question: q, order: i + 1 });
      if (questions.length >= 4) break;
    }
  }
  return questions;
}

/** Voeding tab: per-week nutrition targets */
export async function getNutritionTargets(
  weekNumber: number
): Promise<SheetNutritionTarget | null> {
  const data = await readRange(`Voeding!A1:H30`);
  if (!data) return null;

  // Look for a row that has "Week X" or the week number
  for (const row of data) {
    const cell = toStr(row[0])?.toLowerCase() || "";
    if (
      cell.includes(`week ${weekNumber}`) ||
      cell === String(weekNumber)
    ) {
      return {
        kcal: toNum(row[1]),
        eiwitten: toNum(row[2]),
        koolhydraten: toNum(row[3]),
        vetten: toNum(row[4]),
        water: toNum(row[5]),
      };
    }
  }
  return null;
}

export async function writeExerciseLogToSheet(
  weekNumber: number,
  trainingName: string,
  exerciseName: string,
  sets: number | null,
  reps: string | null,
  weight: string | null,
  notes: string | null
): Promise<void> {
  const { appendRow, readRange, writeRange } = await import("./sheetsService.js");
  
  const weightArr = weight ? weight.split(',').map(s => s.trim()) : [];
  const repsArr = reps ? reps.split(',').map(s => s.trim()) : [];
  
  // 1. Log to Logboek with weights in separate columns
  await appendRow("Logboek!A:Z", [
    [
      String(weekNumber),
      trainingName,
      exerciseName,
      sets !== null ? String(sets) : "",
      repsArr.join(", "),
      notes || "",
      ...weightArr
    ],
  ]);

  // 2. Try to update the exact row in the Week tab
  try {
    const sheetName = `Week ${weekNumber}`;
    const data = await readRange(`${sheetName}!A1:Z200`);
    if (!data) return;

    let headerRowIndex = -1;
    let setCols: number[] = [];
    let repsCol = -1;

    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i].map((c) => c?.toLowerCase() || "");
      if (row.some(c => c.includes("set"))) {
        headerRowIndex = i;
        for (let j = 0; j < row.length; j++) {
          if (row[j].match(/set\s*\d/)) setCols.push(j);
          if (row[j] === "reps") repsCol = j;
        }
        break;
      }
    }

    if (setCols.length === 0) setCols = [3, 4, 5, 6, 7];

    let exerciseRowIndex = -1;
    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];
      const cellA = (row[0] || "").toLowerCase().replace(/^[a-z]\s*:/, "").trim();
      const cellB = (row[1] || "").toLowerCase().replace(/^[a-z]\s*:/, "").trim();
      const target = exerciseName.toLowerCase().replace(/^[a-z]\s*:/, "").trim();

      if (cellA === target || cellB === target) {
        exerciseRowIndex = i;
        break;
      }
    }

    if (exerciseRowIndex >= 0) {
      const rowToUpdate = [...data[exerciseRowIndex]];
      const maxCol = Math.max(...setCols, repsCol);
      while(rowToUpdate.length <= maxCol) {
        rowToUpdate.push("");
      }

      for (let i = 0; i < weightArr.length && i < setCols.length; i++) {
        rowToUpdate[setCols[i]] = weightArr[i];
      }
      
      if (repsCol >= 0) {
        rowToUpdate[repsCol] = repsArr.join(", ");
      }

      const rowNum = exerciseRowIndex + 1;
      await writeRange(`${sheetName}!A${rowNum}:Z${rowNum}`, [rowToUpdate]);
    }
  } catch (err) {
    logger.error({ err }, "Failed to update week tab");
  }
}

/** Write feedback answer to Feedback tab */
export async function writeFeedbackToSheet(
  weekNumber: number,
  questionId: number,
  answer: string
): Promise<void> {
  const { appendRow } = await import("./sheetsService.js");
  const now = new Date().toLocaleDateString("nl-NL");
  await appendRow("Feedback!H:K", [
    [String(weekNumber), String(questionId), answer, now],
  ]);
}
