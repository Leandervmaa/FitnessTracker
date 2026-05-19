/**
 * Parser voor het Bodyrebuild Programma Excel-bestand van Leander van Maarschalkerwaard.
 *
 * Fixes t.o.v. v1:
 *  1. Dynamische kolomdetectie — elke header-rij bepaalt zelf waar "Werk sets" en "Reps" staan.
 *     DELOAD week 14 heeft bijv. maar 2 set-kolommen; bij standaard weken zijn het er 5.
 *  2. Oefening-rij-herkenning: col A mag data bevatten (overgelopen gewichten uit eerdere
 *     sessies worden door Excel in col A opgeslagen). Alleen col B telt voor herkenning.
 *  3. Video-URL overerving: per oefeningnaam wordt het eerste gevonden URL opgeslagen en
 *     doorgegeven aan alle latere weken die hetzelfde oefeningnaam hebben maar geen link.
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
  prescribedWeight: string | null;
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

export interface ParsedFeedbackAnswer {
  weekNumber: number;
  questionId: number;
  answer: string;
}

export interface ParsedExcelData {
  weeks: ParsedWeek[];
  feedbackQuestions: ParsedFeedbackQuestion[];
  feedbackAnswers: ParsedFeedbackAnswer[];
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

function stripLetterPrefix(name: string): string {
  return name.replace(/^\s*[A-Za-z]\s*:\s*/, "").trim();
}

function cellVideoUrl(sheet: XLSX.WorkSheet, cellAddr: string): string | null {
  const cell = sheet[cellAddr];
  if (!cell) return null;
  const link = (cell as XLSX.CellObject & { l?: { Target?: string } }).l;
  if (link?.Target && link.Target.startsWith("http")) return link.Target;
  return null;
}

function addr(colIdx: number, rowIdx: number): string {
  return XLSX.utils.encode_cell({ c: colIdx, r: rowIdx });
}

// ─── dynamic column map ──────────────────────────────────────────────────────

interface ColMap {
  werkSets: number;  // index of "Werk sets" column
  reps: number;      // index of "Reps" column
  setStart: number;  // first weight column (always 3)
  setEnd: number;    // last weight column (werkSets - 1)
}

const DEFAULT_COL_MAP: ColMap = { werkSets: 8, reps: 9, setStart: 3, setEnd: 7 };

/**
 * Read column positions from a header row such as:
 *   "Week 1 | Oefening: | Bijzonderheden: | Set 1 | Set 2 | Set 3 | Set 4 | Set 5 | Werk sets | Reps | Tempo | Rust"
 * or for DELOAD week 14:
 *   "Week 14 | Oefening: | Bijzonderheden: | Set 1 | Set 2 | Werk sets | Reps | Tempo | Rust | RPE"
 */
function detectColMap(row: string[]): ColMap {
  let werkSets = -1;
  let reps = -1;

  for (let i = 0; i < row.length; i++) {
    const c = trimCell(row[i]).toLowerCase();
    // "Werk sets" or "Werk set" but NOT "Set 1", "Set 2" etc.
    if (/^werk\s*sets?$/.test(c)) werkSets = i;
    if (c === "reps") reps = i;
  }

  if (werkSets !== -1 && reps !== -1) {
    return { werkSets, reps, setStart: 3, setEnd: werkSets - 1 };
  }
  return DEFAULT_COL_MAP;
}

/**
 * Get the last non-empty numeric weight from the set columns (dynamic range).
 */
function lastSetWeight(row: string[], colMap: ColMap): string | null {
  let last: string | null = null;
  for (let c = colMap.setStart; c <= colMap.setEnd; c++) {
    const s = trimCell(row[c]);
    if (s !== "") last = s;
  }
  return last;
}

// ─── training-sheet parser ───────────────────────────────────────────────────

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
  let colMap: ColMap = DEFAULT_COL_MAP;

  const flushWorkout = () => {
    if (currentWorkout && currentWorkout.exercises.length > 0 && currentWeek !== null) {
      const list = result.get(currentWeek) ?? [];
      list.push(currentWorkout);
      result.set(currentWeek, list);
      currentWorkout = null;
    }
  };

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const colA = trimCell(row[0]);
    const colB = trimCell(row[1]);

    // Skip blank rows and boilerplate
    if (!colA && !colB) continue;
    if (/^upper.lower split/i.test(colA)) continue;
    if (/^trainingsprogramma/i.test(colA)) continue;

    // ── Week header: "Week 1 | Oefening: | ..." or "Week 2 | Datum: | ..."
    if (/^week\s+\d+$/i.test(colA) && (colB === "" || /^(oefening|datum)/i.test(colB))) {
      const match = colA.match(/\d+/);
      if (match) {
        flushWorkout();
        currentWeek = parseInt(match[0], 10);
        // Detect column positions from THIS header row
        colMap = detectColMap(row);
      }
      continue;
    }

    if (currentWeek === null) continue;

    // ── Training block start: "Training A (Upper)" etc.
    if (/^training\s+[A-D]/i.test(colA)) {
      flushWorkout();

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

      // Pattern A (Week 1-style): training name + first exercise on same row
      // Pattern B (Week 2+-style): col B is "Oefening:" = just a column header, exercises on next rows
      if (colB && /^[A-Z]\s*:/i.test(colB)) {
        const videoUrl = cellVideoUrl(sheet, addr(1, ri));
        exerciseOrder++;
        currentWorkout.exercises.push({
          id: `w${currentWeek}-${letter}-${exerciseOrder}`,
          name: stripLetterPrefix(colB),
          notes: trimCell(row[2]) || null,
          sets: toNum(row[colMap.werkSets]),
          reps: trimCell(row[colMap.reps]) || null,
          prescribedWeight: lastSetWeight(row, colMap),
          videoUrl,
          imageUrl: null,
          order: exerciseOrder,
        });
      }
      continue;
    }

    // ── Exercise row: col B matches "X: Exercise name" pattern.
    // NOTE: col A may contain overflow data (previous logged weights) — do NOT require !colA.
    // Only skip if col A clearly matches a special row type already handled above.
    if (
      colB &&
      /^[A-Z]\s*:/i.test(colB) &&
      !/^opmerkingen/i.test(colB) &&
      currentWorkout
    ) {
      const videoUrl = cellVideoUrl(sheet, addr(1, ri));
      exerciseOrder++;
      currentWorkout.exercises.push({
        id: `w${currentWeek}-${currentWorkout.id.split("-").pop()}-${exerciseOrder}`,
        name: stripLetterPrefix(colB),
        notes: trimCell(row[2]) || null,
        sets: toNum(row[colMap.werkSets]),
        reps: trimCell(row[colMap.reps]) || null,
        prescribedWeight: lastSetWeight(row, colMap),
        videoUrl,
        imageUrl: null,
        order: exerciseOrder,
      });
    }
  }

  flushWorkout();
  return result;
}

// ─── video URL inheritance ───────────────────────────────────────────────────

/**
 * For exercises that share the same name across weeks, inherit the video URL
 * from the earliest week that has one.
 */
function inheritVideoUrls(weeks: ParsedWeek[]): void {
  const urlByName = new Map<string, string>();

  // First pass: collect all video URLs
  for (const week of weeks) {
    for (const workout of week.workouts) {
      for (const ex of workout.exercises) {
        if (ex.videoUrl && !urlByName.has(ex.name.toLowerCase())) {
          urlByName.set(ex.name.toLowerCase(), ex.videoUrl);
        }
      }
    }
  }

  // Second pass: fill in missing URLs
  for (const week of weeks) {
    for (const workout of week.workouts) {
      for (const ex of workout.exercises) {
        if (!ex.videoUrl) {
          const url = urlByName.get(ex.name.toLowerCase());
          if (url) ex.videoUrl = url;
        }
      }
    }
  }
}

// ─── feedback parser ─────────────────────────────────────────────────────────

function parseFeedbackQuestions(wb: XLSX.WorkBook): ParsedFeedbackQuestion[] {
  const sheetName = wb.SheetNames.find((n) => /feedback/i.test(n));
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
    if (cell.length > 10 && cell.endsWith("?")) {
      const order = questions.length + 1;
      questions.push({ id: order, question: cell, order });
      if (questions.length >= 4) break;
    }
  }

  return questions.length > 0 ? questions : DEFAULT_FEEDBACK_QUESTIONS;
}

function parseFeedbackAnswers(wb: XLSX.WorkBook, questions: ParsedFeedbackQuestion[]): ParsedFeedbackAnswer[] {
  const sheetName = wb.SheetNames.find((n) => /feedback/i.test(n));
  if (!sheetName) return [];

  const sheet = wb.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const answers: ParsedFeedbackAnswer[] = [];
  let currentWeekNum: number | null = null;
  let currentQuestionId: number | null = null;
  const currentLines: string[] = [];

  const saveCurrentAnswer = () => {
    if (currentWeekNum !== null && currentQuestionId !== null && currentLines.length > 0) {
      const joined = currentLines.join("\n").trim();
      if (joined) {
        answers.push({
          weekNumber: currentWeekNum,
          questionId: currentQuestionId,
          answer: joined,
        });
      }
    }
    currentLines.length = 0;
  };

  for (const row of rows) {
    const cellValue = trimCell(row[0]);
    if (!cellValue) continue;

    // Check for Week header (e.g. "Week 1:")
    const weekMatch = cellValue.match(/^week\s+(\d+)\s*:/i);
    if (weekMatch) {
      saveCurrentAnswer();
      currentWeekNum = parseInt(weekMatch[1], 10);
      currentQuestionId = null;
      continue;
    }

    // Check if cell matches a question
    const lower = cellValue.toLowerCase();
    const matchedQ = questions.find((q) => q.question.toLowerCase() === lower);
    if (matchedQ) {
      saveCurrentAnswer();
      currentQuestionId = matchedQ.id;
      continue;
    }

    // If we are currently tracking a week and a question, accumulate the text
    if (currentWeekNum !== null && currentQuestionId !== null) {
      currentLines.push(cellValue);
    }
  }

  // Save the last one
  saveCurrentAnswer();

  return answers;
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
      if (result.kcal === null) result.kcal = toNum(value);
    } else if (label.includes("eiwit") || label.includes("protein")) {
      if (result.eiwitten === null) result.eiwitten = toNum(value);
    } else if (label.includes("koolhydr")) {
      if (result.koolhydraten === null) result.koolhydraten = toNum(value);
    } else if (label.includes("vet") && !label.includes("eiwit") && !label.includes("koolh")) {
      if (result.vetten === null) result.vetten = toNum(value);
    } else if (label.includes("water")) {
      if (result.waterL === null) result.waterL = toNum(value);
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

    const allWeeks = new Map<number, ParsedWorkout[]>();

    for (const sheetName of wb.SheetNames) {
      const lower = sheetName.toLowerCase().trim();
      if (lower.includes("upperlower") || lower.includes("upper lower") || lower.includes("deload")) {
        const weekMap = parseTrainingSheet(wb, sheetName);
        for (const [weekNum, workouts] of weekMap) {
          allWeeks.set(weekNum, workouts);
        }
      }
    }

    const weeks: ParsedWeek[] = Array.from(allWeeks.entries())
      .sort(([a], [b]) => a - b)
      .map(([weekNumber, workouts]) => ({ weekNumber, workouts }));

    // Fill in missing video URLs from weeks that do have them
    inheritVideoUrls(weeks);

    const feedbackQuestions = parseFeedbackQuestions(wb);
    const feedbackAnswers = parseFeedbackAnswers(wb, feedbackQuestions);
    const nutritionTarget = parseNutritionTarget(wb);

    logger.info(
      {
        weeksParsed: weeks.length,
        feedbackQ: feedbackQuestions.length,
        feedbackA: feedbackAnswers.length,
        hasNutrition: nutritionTarget !== null,
      },
      "Excel parse complete"
    );

    return {
      weeks,
      feedbackQuestions,
      feedbackAnswers,
      nutritionTarget,
      sheetNames: wb.SheetNames,
      parsedAt: new Date(),
    };
  } catch (err) {
    logger.error({ err }, "Failed to parse Excel file");
    return null;
  }
}
