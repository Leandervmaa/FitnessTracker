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
  sheetWeights: string | null;
  sheetReps: string | null;
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

export interface ParsedWeekNutrition {
  weekNumber: number;
  kcal: number | null;
  eiwitten: number | null;
  koolhydraten: number | null;
  vetten: number | null;
  waterL: number | null;
  lichaamsgewicht: number | null;
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
  weekNutrition: ParsedWeekNutrition[];
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

/**
 * Maps an exercise name to a local image URL (served from /images/).
 * Returns null when no match found (frontend falls back to getExerciseImage).
 */
export function getExerciseImageUrl(name: string): string | null {
  const n = name.toLowerCase();

  // Specific detailed mappings (high-resolution uploaded images)
  if (n.includes("biceps cable curl") || (n.includes("biceps") && n.includes("cable") && n.includes("curl"))) return "/images/biceps_cable_curl.jpg";
  if (n.includes("anterior delt") || (n.includes("incline") && n.includes("db") && n.includes("press"))) return "/images/anterior_delt_incline_db_press.jpg";
  if (n.includes("chest supported pulldown") || n.includes("chest-supported pulldown") || (n.includes("chest") && n.includes("pulldown"))) return "/images/chest_supported_pulldown.jpg";
  if (n.includes("costal pec fly") || (n.includes("pec") && n.includes("fly")) || (n.includes("cable") && n.includes("fly"))) return "/images/costal_pec_fly.jpg";
  if (n.includes("cable row") || (n.includes("cable") && n.includes("row"))) return "/images/cable_row.jpg";

  // Benen & Billen
  if (n.includes("front squat")) return "/images/frontsquat_muscles.png";
  if (n.includes("squat")) return "/images/squat_muscles.png";
  if (n.includes("roemeense") || n.includes("rdl") || n.includes("romanian")) return "/images/rdl_muscles.png";
  if (n.includes("sumo deadlift") || n.includes("deadlift")) return "/images/rdl_muscles.png";
  if (n.includes("leg press")) return "/images/legpress_muscles.png";
  if (n.includes("leg curl")) return "/images/legcurl_muscles.png";
  if (n.includes("hip thrust")) return "/images/hipthrust_muscles.png";

  // Borst & Schouders & Triceps
  if (n.includes("incline") && n.includes("press")) return "/images/inclinepress_muscles.png";
  if (n.includes("bench press") || n.includes("druk")) return "/images/benchpress_muscles.png";
  if (n.includes("push press")) return "/images/pushpress_muscles.png";
  if (n.includes("schouderpers") || n.includes("shoulder press") || n.includes("overhead press") || n.includes("ohp")) return "/images/schouderpers_muscles.png";
  if (n.includes("lateral raise") || n.includes("zijwaartse hef")) return "/images/lateralraise_muscles.png";
  if (n.includes("dip")) return "/images/tricepdip_muscles.png";

  // Rug & Biceps
  if (n.includes("pull-up") || n.includes("pullup") || n.includes("chin-up") || (n.includes("pulldown") && !n.includes("chest"))) return "/images/pullup_muscles.png";
  if (n.includes("barbell row") || n.includes("bent-over") || (n.includes("row") && !n.includes("cable"))) return "/images/barbellrow_muscles.png";
  if (n.includes("face pull")) return "/images/facepull_muscles.png";
  if (n.includes("bicep curl") || n.includes("biceps curl") || (n.includes("curl") && !n.includes("leg"))) return "/images/bicepcurl_muscles.png";

  return null;
}

// ─── dynamic column map ──────────────────────────────────────────────────────

interface ColMap {
  werkSets: number;  // index of "Werk sets" column
  reps: number;      // index of "Reps" column
  setStart: number;  // first weight column (always 3)
  setEnd: number;    // last weight column (werkSets - 1)
  repsSetStart: number;
  repsSetEnd: number;
}

const DEFAULT_COL_MAP: ColMap = { 
  werkSets: 8, 
  reps: 9, 
  setStart: 3, 
  setEnd: 7,
  repsSetStart: 13,
  repsSetEnd: 17
};

/**
 * Read column positions from a header row such as:
 *   "Week 1 | Oefening: | Bijzonderheden: | Set 1 | Set 2 | Set 3 | Set 4 | Set 5 | Werk sets | Reps | Tempo | Rust"
 * or for DELOAD week 14:
 *   "Week 14 | Oefening: | Bijzonderheden: | Set 1 | Set 2 | Werk sets | Reps | Tempo | Rust | RPE"
 */
function detectColMap(row: string[]): ColMap {
  let werkSets = -1;
  let reps = -1;
  const set1Indices: number[] = [];

  for (let i = 0; i < row.length; i++) {
    const c = trimCell(row[i]).toLowerCase();
    // "Werk sets" or "Werk set" but NOT "Set 1", "Set 2" etc.
    if (/^werk\s*sets?$/.test(c)) werkSets = i;
    if (c === "reps") reps = i;
    if (c === "set 1") {
      set1Indices.push(i);
    }
  }

  const result = {
    werkSets: werkSets !== -1 ? werkSets : DEFAULT_COL_MAP.werkSets,
    reps: reps !== -1 ? reps : DEFAULT_COL_MAP.reps,
    setStart: 3,
    setEnd: werkSets !== -1 ? werkSets - 1 : DEFAULT_COL_MAP.setEnd,
    repsSetStart: -1,
    repsSetEnd: -1,
  };

  if (set1Indices.length >= 2) {
    result.repsSetStart = set1Indices[1];
    const numSets = result.setEnd - result.setStart + 1;
    result.repsSetEnd = result.repsSetStart + numSets - 1;
  } else {
    // Fallback: reps set columns are usually offset by 10 from weight set columns
    result.repsSetStart = result.setStart + 10;
    result.repsSetEnd = result.setEnd + 10;
  }

  return result;
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

function getSetWeightsList(row: string[], colMap: ColMap): string {
  const weights: string[] = [];
  for (let c = colMap.setStart; c <= colMap.setEnd; c++) {
    const s = trimCell(row[c]);
    weights.push(s);
  }
  while (weights.length > 0 && weights[weights.length - 1] === "") {
    weights.pop();
  }
  return weights.join(", ");
}

function getSetRepsList(row: string[], colMap: ColMap): string {
  if (colMap.repsSetStart === -1) return "";
  const reps: string[] = [];
  for (let c = colMap.repsSetStart; c <= colMap.repsSetEnd; c++) {
    const s = trimCell(row[c]);
    // Handle Excel dates parsed as date strings for reps targets like 8-12
    if (s !== "" && !isNaN(Date.parse(s)) && s.includes("-")) {
      // Excel sometimes returns date serial or formatted strings. If it looks like a date,
      // let's try to just preserve the text, but usually it is just numbers like '10', '8', etc.
      reps.push(s);
    } else {
      reps.push(s);
    }
  }
  while (reps.length > 0 && reps[reps.length - 1] === "") {
    reps.pop();
  }
  return reps.join(", ");
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
        const exerciseName = stripLetterPrefix(colB);
        exerciseOrder++;
        currentWorkout.exercises.push({
          id: `w${currentWeek}-${letter}-${exerciseOrder}`,
          name: exerciseName,
          notes: trimCell(row[2]) || null,
          sets: toNum(row[colMap.werkSets]),
          reps: trimCell(row[colMap.reps]) || null,
          prescribedWeight: lastSetWeight(row, colMap),
          sheetWeights: getSetWeightsList(row, colMap),
          sheetReps: getSetRepsList(row, colMap),
          videoUrl,
          imageUrl: getExerciseImageUrl(exerciseName),
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
      const exerciseName2 = stripLetterPrefix(colB);
      exerciseOrder++;
      currentWorkout.exercises.push({
        id: `w${currentWeek}-${currentWorkout.id.split("-").pop()}-${exerciseOrder}`,
        name: exerciseName2,
        notes: trimCell(row[2]) || null,
        sets: toNum(row[colMap.werkSets]),
        reps: trimCell(row[colMap.reps]) || null,
        prescribedWeight: lastSetWeight(row, colMap),
        sheetWeights: getSetWeightsList(row, colMap),
        sheetReps: getSetRepsList(row, colMap),
        videoUrl,
        imageUrl: getExerciseImageUrl(exerciseName2),
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

/**
 * Parse per-week nutrition/progression data from the "Progressie" sheet.
 * Expected layout: rows with week numbers and measured values like weight, kcal etc.
 */
function parseWeekNutrition(wb: XLSX.WorkBook): ParsedWeekNutrition[] {
  const sheetName = wb.SheetNames.find((n) => /progressie/i.test(n));
  if (!sheetName) return [];

  const sheet = wb.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const results: ParsedWeekNutrition[] = [];

  // Find header row to detect column indices
  let headerRowIdx = -1;
  let weekCol = -1;
  let kcalCol = -1;
  let eiwitCol = -1;
  let koolhCol = -1;
  let vetCol = -1;
  let waterCol = -1;
  let gewichtCol = -1;

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i].map((c) => trimCell(c).toLowerCase());
    const hasWeekCol = row.findIndex((c) => c === "week" || c.startsWith("week"));
    if (hasWeekCol >= 0) {
      headerRowIdx = i;
      weekCol = hasWeekCol;
      for (let j = 0; j < row.length; j++) {
        const c = row[j];
        if (c.includes("kcal") || c.includes("calorie") || c.includes("energie")) kcalCol = j;
        else if ((c.includes("eiwit") || c.includes("protein")) && eiwitCol === -1) eiwitCol = j;
        else if (c.includes("koolhydr") && koolhCol === -1) koolhCol = j;
        else if ((c.includes("vet") || c.includes("fat")) && vetCol === -1) vetCol = j;
        else if (c.includes("water") && waterCol === -1) waterCol = j;
        else if ((c.includes("gewicht") || c.includes("weight") || c.includes("kg")) && gewichtCol === -1) gewichtCol = j;
      }
      break;
    }
  }

  if (headerRowIdx === -1 || weekCol === -1) return [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const weekCell = trimCell(row[weekCol]).toLowerCase();
    // Match "Week 1", "1", "w1" etc.
    const weekMatch = weekCell.match(/(\d+)/);
    if (!weekMatch) continue;
    const weekNumber = parseInt(weekMatch[1], 10);
    if (isNaN(weekNumber) || weekNumber < 1) continue;

    results.push({
      weekNumber,
      kcal: kcalCol >= 0 ? toNum(row[kcalCol]) : null,
      eiwitten: eiwitCol >= 0 ? toNum(row[eiwitCol]) : null,
      koolhydraten: koolhCol >= 0 ? toNum(row[koolhCol]) : null,
      vetten: vetCol >= 0 ? toNum(row[vetCol]) : null,
      waterL: waterCol >= 0 ? toNum(row[waterCol]) : null,
      lichaamsgewicht: gewichtCol >= 0 ? toNum(row[gewichtCol]) : null,
    });
  }

  return results;
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
    const weekNutrition = parseWeekNutrition(wb);

    logger.info(
      {
        weeksParsed: weeks.length,
        feedbackQ: feedbackQuestions.length,
        feedbackA: feedbackAnswers.length,
        hasNutrition: nutritionTarget !== null,
        weekNutritionRows: weekNutrition.length,
      },
      "Excel parse complete"
    );

    return {
      weeks,
      feedbackQuestions,
      feedbackAnswers,
      nutritionTarget,
      weekNutrition,
      sheetNames: wb.SheetNames,
      parsedAt: new Date(),
    };
  } catch (err) {
    logger.error({ err }, "Failed to parse Excel file");
    return null;
  }
}
