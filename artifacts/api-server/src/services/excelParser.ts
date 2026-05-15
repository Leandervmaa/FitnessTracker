/**
 * Parser voor het Bodyrebuild Programma Excel-bestand van Leander van Maarschalkerwaard.
 *
 * Tabbladnamen (met eventuele spaties):
 *   "Progressie sheet", " Feedback Sporter", " Voedingplan ",
 *   " UpperLower week 12", "UpperLower week 34", " UpperLower week 56",
 *   " DELOAD week 7", "UpperLower week 89", " UpperLower week 1011",
 *   "UpperLower week 1213", "DELOAD week 14"
 *
 * Structuur trainingstabblad (bijv. " UpperLower week 12"):
 *   Rij: "Upper-Lower split | Datum: ..."          → separator, overslaan
 *   Rij: "Week 1 | Oefening: | Bijzonderheden: | Set 1 | Set 2 | ... | Werk sets | Reps"
 *        → weeknummer-header
 *   Rij: "Training A (Upper) | A: Oefening | notities | s1 | s2 | ... | 3 | 8-10"
 *        → start trainingsblok + eerste oefening
 *   Volgende rijen: leeg col A, "B: Oefening" in col B → verdere oefeningen
 *   Hyperlinks in col B → video-URL per oefening
 *
 * Kolom-indeling (0-gebaseerd):
 *   0: Trainingsnaam (alleen eerste rij) of weekheader
 *   1: Oefeningnaam met letterprefix "A:" → bevat hyperlink voor video-URL
 *   2: Bijzonderheden/notities
 *   3–7: Set 1–5 gewichten (eerder gelogd)
 *   8: Werk sets
 *   9: Reps
 */

import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { logger } from "../lib/logger.js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EXCEL_PATH = path.resolve(__dirname, "../data/programma.xlsx");

export interface ParsedExercise {
  id: string;
  name: string;
  notes: string | null;
  sets: number | null;
  reps: string | null;
  prescribedWeight: number | null;
  videoUrl: string | null;
  imageUrl: string | null;
  order: number;
}

export interface ParsedWorkout {
  id: string;
  name: string;
  dayLabel: string;
  exercises: ParsedExercise[];
}

export interface ParsedWeek {
  weekNumber: number;
  workouts: ParsedWorkout[];
}

export interface ParsedFeedbackQuestion {
  id: number;
  question: string;
  order: number;
}

export interface ParsedNutritionTarget {
  kcal: number | null;
  eiwitten: number | null;
  koolhydraten: number | null;
  vetten: number | null;
  waterL: number | null;
}

export interface ParsedExcelData {
  weeks: ParsedWeek[];
  feedbackQuestions: ParsedFeedbackQuestion[];
  nutritionTarget: ParsedNutritionTarget | null;
  sheetNames: string[];
  parsedAt: Date;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function trimCell(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function toNum(v: unknown): number | null {
  const s = trimCell(v).replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Strip letter prefix "A: ", "B: " etc. from exercise name. */
function stripLetterPrefix(name: string): string {
  return name.replace(/^\s*[A-Za-z]\s*:\s*/, "").trim();
}

/** Extract hyperlink URL from a cell (column B contains embedded URLs). */
function cellVideoUrl(sheet: XLSX.WorkSheet, cellAddr: string): string | null {
  const cell = sheet[cellAddr];
  if (!cell) return null;
  const link = (cell as XLSX.CellObject & { l?: { Target?: string } }).l;
  if (link?.Target && link.Target.startsWith("http")) return link.Target;
  return null;
}

/** Find the last non-empty numeric value in a set of cols (D–H = indices 3–7). */
function lastSetWeight(row: string[]): number | null {
  let last: number | null = null;
  for (let c = 3; c <= 7; c++) {
    const n = toNum(row[c]);
    if (n !== null) last = n;
  }
  return last;
}

/** Convert a row array to a column address string for a given row index and col. */
function addr(colIdx: number, rowIdx: number): string {
  return XLSX.utils.encode_cell({ c: colIdx, r: rowIdx });
}

// ─── training-sheet parser ───────────────────────────────────────────────────

/**
 * Parse one "UpperLower" or "DELOAD" sheet.
 * Returns a map: weekNumber → array of ParsedWorkout.
 */
function parseTrainingSheet(
  wb: XLSX.WorkBook,
  sheetName: string
): Map<number, ParsedWorkout[]> {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return new Map();

  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const result = new Map<number, ParsedWorkout[]>();

  let currentWeek: number | null = null;
  let currentWorkout: ParsedWorkout | null = null;
  let exerciseOrder = 0;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const colA = trimCell(row[0]);
    const colB = trimCell(row[1]);

    // Skip empty rows and separator rows ("Upper-Lower split", title row)
    if (!colA && !colB) continue;
    if (/^upper.lower split/i.test(colA)) continue;
    if (/^trainingsprogramma/i.test(colA)) continue;

    // Week header: "Week 1 | Oefening: | ..." OR "Week 2 | Datum: | ..."
    if (/^week\s+\d+$/i.test(colA) && (colB === "" || /^(oefening|datum)/i.test(colB))) {
      const match = colA.match(/\d+/);
      if (match) {
        // Save any running workout before switching week
        if (currentWorkout && currentWorkout.exercises.length > 0 && currentWeek !== null) {
          const list = result.get(currentWeek) ?? [];
          list.push(currentWorkout);
          result.set(currentWeek, list);
          currentWorkout = null;
        }
        currentWeek = parseInt(match[0], 10);
      }
      continue;
    }

    if (currentWeek === null) continue;

    // Training block start: col A = "Training A (Upper)" etc.
    if (/^training\s+[A-D]/i.test(colA)) {
      // Save previous workout
      if (currentWorkout && currentWorkout.exercises.length > 0) {
        const list = result.get(currentWeek) ?? [];
        list.push(currentWorkout);
        result.set(currentWeek, list);
      }

      const letterMatch = colA.match(/training\s+([A-D])/i);
      const letter = letterMatch ? letterMatch[1].toUpperCase() : "X";
      const isUpper = /upper/i.test(colA);
      const isLower = /lower/i.test(colA);
      const typeLabel = isUpper ? " (Upper)" : isLower ? " (Lower)" : "";
      const dayMap: Record<string, string> = {
        A: "Maandag", B: "Dinsdag", C: "Woensdag", D: "Donderdag",
      };

      currentWorkout = {
        id: `w${currentWeek}-${letter}`,
        name: `Training ${letter}${typeLabel}`,
        dayLabel: dayMap[letter] ?? `Training ${letter}`,
        exercises: [],
      };
      exerciseOrder = 0;

      // Week 1 pattern: first exercise is on the same row as training name
      // Week 2+ pattern: col B is "Oefening:" (column header row) — exercises follow on next rows
      if (colB && /^[A-Z]\s*:/i.test(colB)) {
        const videoUrl = cellVideoUrl(sheet, addr(1, ri));
        const sets = toNum(row[8]);
        const reps = trimCell(row[9]) || null;
        const weight = lastSetWeight(row);

        exerciseOrder++;
        currentWorkout.exercises.push({
          id: `w${currentWeek}-${letter}-${exerciseOrder}`,
          name: stripLetterPrefix(colB),
          notes: trimCell(row[2]) || null,
          sets,
          reps,
          prescribedWeight: weight,
          videoUrl,
          imageUrl: null,
          order: exerciseOrder,
        });
      }
      // If col B is "Oefening:" it's just a column header row — exercises come on next rows
      continue;
    }

    // Exercise row: col A empty, col B has "X: Exercise name"
    if (!colA && colB && /^[A-Z]\s*:/i.test(colB) && currentWorkout) {
      // Skip "Opmerkingen" rows
      if (/^opmerkingen/i.test(colB)) continue;

      const videoUrl = cellVideoUrl(sheet, addr(1, ri));
      const sets = toNum(row[8]);
      const reps = trimCell(row[9]) || null;
      const weight = lastSetWeight(row);

      exerciseOrder++;
      currentWorkout.exercises.push({
        id: `w${currentWeek}-${currentWorkout.id.split("-").pop()}-${exerciseOrder}`,
        name: stripLetterPrefix(colB),
        notes: trimCell(row[2]) || null,
        sets,
        reps,
        prescribedWeight: weight,
        videoUrl,
        imageUrl: null,
        order: exerciseOrder,
      });
    }
  }

  // Flush last workout
  if (currentWorkout && currentWorkout.exercises.length > 0 && currentWeek !== null) {
    const list = result.get(currentWeek) ?? [];
    list.push(currentWorkout);
    result.set(currentWeek, list);
  }

  return result;
}

// ─── feedback parser ─────────────────────────────────────────────────────────

function parseFeedbackQuestions(wb: XLSX.WorkBook): ParsedFeedbackQuestion[] {
  const sheetName = wb.SheetNames.find((n) =>
    /feedback/i.test(n)
  );
  if (!sheetName) return DEFAULT_FEEDBACK_QUESTIONS;

  const sheet = wb.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const questions: ParsedFeedbackQuestion[] = [];

  for (const row of rows) {
    const cell = trimCell(row[0]);
    // Questions are longer strings that end with "?"
    if (cell.length > 10 && cell.endsWith("?")) {
      const order = questions.length + 1;
      questions.push({ id: order, question: cell, order });
      if (questions.length >= 4) break;
    }
  }

  return questions.length > 0 ? questions : DEFAULT_FEEDBACK_QUESTIONS;
}

// ─── voeding parser ───────────────────────────────────────────────────────────

function parseNutritionTarget(wb: XLSX.WorkBook): ParsedNutritionTarget | null {
  const sheetName = wb.SheetNames.find((n) => /voeding/i.test(n));
  if (!sheetName) return null;

  const sheet = wb.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const result: ParsedNutritionTarget = {
    kcal: null,
    eiwitten: null,
    koolhydraten: null,
    vetten: null,
    waterL: null,
  };

  for (const row of rows) {
    const label = trimCell(row[0]).toLowerCase();
    const value = trimCell(row[1]);

    if (label.includes("kcal") || label.includes("calorie") || label.includes("energie")) {
      result.kcal = toNum(value);
    } else if (label.includes("eiwit") || label.includes("protein")) {
      result.eiwitten = toNum(value);
    } else if (label.includes("koolhydr")) {
      result.koolhydraten = toNum(value);
    } else if (label.includes("vet") && !label.includes("eiwit") && !label.includes("koolh")) {
      result.vetten = toNum(value);
    } else if (label.includes("water")) {
      result.waterL = toNum(value);
    }
  }

  return result.kcal !== null ? result : null;
}

// ─── defaults ────────────────────────────────────────────────────────────────

const DEFAULT_FEEDBACK_QUESTIONS: ParsedFeedbackQuestion[] = [
  { id: 1, question: "Wat ging er goed deze week?", order: 1 },
  { id: 2, question: "Wat kan er volgende week beter?", order: 2 },
  { id: 3, question: "Welk advies zou je jezelf geven?", order: 3 },
  { id: 4, question: "Hoe voelde je je deze week qua energie en herstel?", order: 4 },
];

// ─── main export ─────────────────────────────────────────────────────────────

export function parseExcelFile(filePath: string = EXCEL_PATH): ParsedExcelData | null {
  if (!fs.existsSync(filePath)) {
    logger.info({ filePath }, "Excel file not found, using hardcoded fallback");
    return null;
  }

  try {
    const wb = XLSX.readFile(filePath);
    logger.info({ sheets: wb.SheetNames }, "Parsing Excel workbook");

    // Parse all training sheets
    const allWeeks = new Map<number, ParsedWorkout[]>();

    for (const sheetName of wb.SheetNames) {
      const lower = sheetName.toLowerCase().trim();
      if (
        lower.includes("upperlower") ||
        lower.includes("upper lower") ||
        lower.includes("deload")
      ) {
        const weekMap = parseTrainingSheet(wb, sheetName);
        for (const [weekNum, workouts] of weekMap) {
          allWeeks.set(weekNum, workouts);
        }
      }
    }

    const weeks: ParsedWeek[] = Array.from(allWeeks.entries())
      .sort(([a], [b]) => a - b)
      .map(([weekNumber, workouts]) => ({ weekNumber, workouts }));

    const feedbackQuestions = parseFeedbackQuestions(wb);
    const nutritionTarget = parseNutritionTarget(wb);

    logger.info(
      {
        weeksParsed: weeks.length,
        feedbackQ: feedbackQuestions.length,
        hasNutrition: nutritionTarget !== null,
      },
      "Excel parse complete"
    );

    return {
      weeks,
      feedbackQuestions,
      nutritionTarget,
      sheetNames: wb.SheetNames,
      parsedAt: new Date(),
    };
  } catch (err) {
    logger.error({ err }, "Failed to parse Excel file");
    return null;
  }
}
