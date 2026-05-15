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
  water: number | null;
}

export interface ParsedExcelData {
  weeks: ParsedWeek[];
  feedbackQuestions: ParsedFeedbackQuestion[];
  videoLinks: Map<string, string>;
  nutritionTargets: Map<number, ParsedNutritionTarget>;
  sheetNames: string[];
  parsedAt: Date;
}

function toStr(val: unknown): string | null {
  if (val === undefined || val === null || val === "") return null;
  const s = String(val).trim();
  return s === "" || s === "-" || s === "n.v.t." ? null : s;
}

function toNum(val: unknown): number | null {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const s = String(val).replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function getSheet(wb: XLSX.WorkBook, name: string): string[][] | null {
  const sheet = wb.Sheets[name];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
}

function findSheetFuzzy(sheetNames: string[], pattern: RegExp): string | null {
  return sheetNames.find((n) => pattern.test(n.toLowerCase())) ?? null;
}

/** Parse "Video links" tab: col A = exercise name, col B = URL */
function parseVideoLinks(wb: XLSX.WorkBook): Map<string, string> {
  const map = new Map<string, string>();
  const sheetName =
    findSheetFuzzy(wb.SheetNames, /video/) ?? "Video links";
  const rows = getSheet(wb, sheetName);
  if (!rows) return map;

  for (const row of rows) {
    const name = toStr(row[0]);
    const url = toStr(row[1]);
    if (name && url && (url.includes("http") || url.includes("youtube"))) {
      map.set(name.toLowerCase(), url);
      map.set(name.toLowerCase().replace(/\s+/g, "-"), url);
    }
  }
  return map;
}

/** Parse "Feedback" tab: find rows that end in "?" */
function parseFeedbackQuestions(wb: XLSX.WorkBook): ParsedFeedbackQuestion[] {
  const sheetName =
    findSheetFuzzy(wb.SheetNames, /feedback/) ?? "Feedback";
  const rows = getSheet(wb, sheetName);
  if (!rows) return DEFAULT_FEEDBACK_QUESTIONS;

  const questions: ParsedFeedbackQuestion[] = [];
  let order = 1;
  for (const row of rows) {
    for (const cell of row) {
      const s = toStr(cell);
      if (s && s.includes("?") && s.length > 10) {
        questions.push({ id: order, question: s, order });
        order++;
        if (questions.length >= 4) break;
      }
    }
    if (questions.length >= 4) break;
  }
  return questions.length > 0 ? questions : DEFAULT_FEEDBACK_QUESTIONS;
}

/** Parse "Voeding" tab for nutrition targets per week */
function parseNutritionTargets(wb: XLSX.WorkBook): Map<number, ParsedNutritionTarget> {
  const map = new Map<number, ParsedNutritionTarget>();
  const sheetName =
    findSheetFuzzy(wb.SheetNames, /voeding/) ?? "Voeding";
  const rows = getSheet(wb, sheetName);
  if (!rows) return map;

  // Look for header row to find column positions
  let kcalCol = -1, eiwitCol = -1, koolhCol = -1, vetCol = -1, waterCol = -1;
  let headerRowIdx = -1;

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i].map((c) => String(c).toLowerCase());
    const hasKcal = row.findIndex((c) => c.includes("kcal") || c.includes("calorie") || c.includes("energie"));
    const hasEiwit = row.findIndex((c) => c.includes("eiwit") || c.includes("proteïne") || c.includes("protein"));
    if (hasKcal >= 0 || hasEiwit >= 0) {
      headerRowIdx = i;
      kcalCol = hasKcal >= 0 ? hasKcal : row.findIndex(c => c.includes("kcal"));
      eiwitCol = hasEiwit >= 0 ? hasEiwit : -1;
      koolhCol = row.findIndex((c) => c.includes("koolh"));
      vetCol = row.findIndex((c) => c.includes("vet") && !c.includes("eiwit"));
      waterCol = row.findIndex((c) => c.includes("water"));
      break;
    }
  }

  // Parse data rows after header
  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 1;
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const weekCell = toStr(row[0]);
    if (!weekCell) continue;

    const weekMatch = weekCell.match(/\d+/);
    if (!weekMatch) continue;
    const weekNumber = parseInt(weekMatch[0], 10);
    if (weekNumber < 1 || weekNumber > 12) continue;

    map.set(weekNumber, {
      kcal: kcalCol >= 0 ? toNum(row[kcalCol]) : toNum(row[1]),
      eiwitten: eiwitCol >= 0 ? toNum(row[eiwitCol]) : toNum(row[2]),
      koolhydraten: koolhCol >= 0 ? toNum(row[koolhCol]) : toNum(row[3]),
      vetten: vetCol >= 0 ? toNum(row[vetCol]) : toNum(row[4]),
      water: waterCol >= 0 ? toNum(row[waterCol]) : toNum(row[5]),
    });
  }
  return map;
}

/** Detect column indices for exercises in a week tab */
function detectColumns(rows: string[][]): {
  nameCol: number;
  setsCol: number;
  repsCol: number;
  weightCol: number;
} {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i].map((c) => String(c).toLowerCase());
    const setsIdx = row.findIndex((c) => c === "sets" || c.includes("aantal sets"));
    const repsIdx = row.findIndex(
      (c) =>
        c === "reps" ||
        c.includes("herhaling") ||
        c.includes("rep") ||
        c === "herhalingen"
    );
    if (setsIdx >= 0 || repsIdx >= 0) {
      const nameIdx = row.findIndex(
        (c) => c.includes("oefening") || c.includes("exercise") || c.includes("naam")
      );
      const weightIdx = row.findIndex(
        (c) =>
          c.includes("gewicht") ||
          c.includes("kg") ||
          c.includes("load") ||
          c === "kg"
      );
      return {
        nameCol: nameIdx >= 0 ? nameIdx : 0,
        setsCol: setsIdx >= 0 ? setsIdx : -1,
        repsCol: repsIdx >= 0 ? repsIdx : -1,
        weightCol: weightIdx >= 0 ? weightIdx : -1,
      };
    }
  }
  // Default: name=col0, sets=col1, reps=col2, weight=col3
  return { nameCol: 0, setsCol: 1, repsCol: 2, weightCol: 3 };
}

const TRAINING_PATTERN =
  /^(training\s*[a-d]|dag\s*[1-4]|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/i;

const SKIP_PATTERNS = [
  /^(oefening|exercise|naam|#|sets?|reps?|herhaling|gewicht|kg|load|week|dag|training)\s*$/i,
  /^-+$/,
];

function isTrainingHeader(cell: string): boolean {
  return TRAINING_PATTERN.test(cell.trim());
}

function isSkip(cell: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(cell.trim()));
}

function trainingLabel(cell: string): { name: string; dayLabel: string } {
  const lower = cell.toLowerCase().trim();
  const dayMap: Record<string, string> = {
    maandag: "Maandag",
    dinsdag: "Dinsdag",
    woensdag: "Woensdag",
    donderdag: "Donderdag",
    vrijdag: "Vrijdag",
    zaterdag: "Zaterdag",
    zondag: "Zondag",
  };
  for (const [key, label] of Object.entries(dayMap)) {
    if (lower.includes(key)) return { name: cell.trim(), dayLabel: label };
  }
  const letterMatch = cell.match(/\b([A-D])\b/i);
  const letter = letterMatch ? letterMatch[1].toUpperCase() : "";
  return {
    name: letter ? `Training ${letter}` : cell.trim(),
    dayLabel: letter ? `Training ${letter}` : cell.trim(),
  };
}

/** Parse a single week sheet */
function parseWeekSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  weekNumber: number,
  videoLinks: Map<string, string>
): ParsedWorkout[] {
  const rows = getSheet(wb, sheetName);
  if (!rows || rows.length < 2) return [];

  const cols = detectColumns(rows);
  const workouts: ParsedWorkout[] = [];
  let current: ParsedWorkout | null = null;
  let exOrder = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstCell = toStr(row[0]) ?? "";
    if (!firstCell) continue;

    if (isTrainingHeader(firstCell)) {
      if (current && current.exercises.length > 0) workouts.push(current);
      const { name, dayLabel } = trainingLabel(firstCell);
      const suffix = name.match(/[A-D]$/i)?.[0]?.toUpperCase() ?? String(workouts.length + 1);
      exOrder = 0;
      current = {
        id: `w${weekNumber}-${suffix}`,
        name,
        dayLabel,
        exercises: [],
      };
      continue;
    }

    if (isSkip(firstCell) || !current) continue;

    // Check if this is likely an exercise row (has name + numeric data)
    const nameVal =
      cols.nameCol === 0 ? firstCell : toStr(row[cols.nameCol]) ?? firstCell;
    if (!nameVal || nameVal.length < 2) continue;

    const setsVal = cols.setsCol >= 0 ? toNum(row[cols.setsCol]) : null;
    const repsVal = cols.repsCol >= 0 ? toStr(row[cols.repsCol]) : null;
    const weightVal = cols.weightCol >= 0 ? toNum(row[cols.weightCol]) : null;

    // Skip rows that look like headers or empty data rows
    if (!setsVal && !repsVal && !weightVal && nameVal.length > 30) continue;

    exOrder++;
    const videoKey = nameVal.toLowerCase();
    const videoUrl =
      videoLinks.get(videoKey) ??
      videoLinks.get(videoKey.replace(/\s+/g, "-")) ??
      null;

    current.exercises.push({
      id: `w${weekNumber}-${current.id.split("-").pop()}-${exOrder}`,
      name: nameVal,
      sets: setsVal,
      reps: repsVal,
      prescribedWeight: weightVal,
      videoUrl,
      imageUrl: null,
      order: exOrder,
    });
  }

  if (current && current.exercises.length > 0) workouts.push(current);
  return workouts.slice(0, 4);
}

const DEFAULT_FEEDBACK_QUESTIONS: ParsedFeedbackQuestion[] = [
  { id: 1, question: "Hoe voelde je je deze week qua energie en herstel?", order: 1 },
  { id: 2, question: "Welke training ging het beste en waarom?", order: 2 },
  { id: 3, question: "Zijn er oefeningen waarbij je progressie hebt geboekt of die moeizamer gingen?", order: 3 },
  { id: 4, question: "Wat wil je volgende week anders aanpakken of verbeteren?", order: 4 },
];

export function parseExcelFile(filePath: string = EXCEL_PATH): ParsedExcelData | null {
  if (!fs.existsSync(filePath)) {
    logger.info({ filePath }, "Excel file not found, using hardcoded fallback");
    return null;
  }

  try {
    const wb = XLSX.readFile(filePath);
    logger.info({ sheets: wb.SheetNames }, "Parsing Excel workbook");

    const videoLinks = parseVideoLinks(wb);
    const feedbackQuestions = parseFeedbackQuestions(wb);
    const nutritionTargets = parseNutritionTargets(wb);

    const weeks: ParsedWeek[] = [];
    for (let w = 1; w <= 12; w++) {
      const sheetName =
        wb.SheetNames.find(
          (n) =>
            n.toLowerCase() === `week ${w}` ||
            n.toLowerCase() === `week${w}` ||
            n === String(w)
        ) ?? null;

      if (!sheetName) continue;

      const workouts = parseWeekSheet(wb, sheetName, w, videoLinks);
      if (workouts.length > 0) {
        weeks.push({ weekNumber: w, workouts });
      }
    }

    logger.info(
      { weeksParsed: weeks.length, videoLinks: videoLinks.size, feedbackQ: feedbackQuestions.length },
      "Excel parse complete"
    );

    return {
      weeks,
      feedbackQuestions,
      videoLinks,
      nutritionTargets,
      sheetNames: wb.SheetNames,
      parsedAt: new Date(),
    };
  } catch (err) {
    logger.error({ err }, "Failed to parse Excel file");
    return null;
  }
}
