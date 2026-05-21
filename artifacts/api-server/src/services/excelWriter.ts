/**
 * excelWriter.ts
 * Schrijft data uit de database terug naar het Excel-bestand (programma.xlsx).
 * Het bestand wordt in-place bijgewerkt en als buffer teruggegeven.
 *
 * Strategie per data-type:
 *  1. Exercise logs  → Week-tabbladen (Training A/B/C/D kolommen invullen)
 *  2. Nutrition       → "Logboek" tabblad (aanmaken of bijwerken)
 *  3. Feedback        → "Feedback" tabblad (antwoorden toevoegen)
 */

import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import { exerciseLogsTable, nutritionEntriesTable, feedbackAnswersTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { EXCEL_PATH } from "./excelParser.js";
import { getWorkoutById, getAllWeekNumbers, getWeek } from "./dataService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── helpers ─────────────────────────────────────────────────────────────────

function trimCell(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function getCellValue(sheet: XLSX.WorkSheet, col: number, row: number): string {
  const addr = XLSX.utils.encode_cell({ c: col, r: row });
  return trimCell(sheet[addr]?.v);
}

function setCellValue(sheet: XLSX.WorkSheet, col: number, row: number, value: string | number): void {
  const addr = XLSX.utils.encode_cell({ c: col, r: row });
  sheet[addr] = { t: typeof value === "number" ? "n" : "s", v: value };
  // Update sheet range if needed
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  if (row > range.e.r) range.e.r = row;
  if (col > range.e.c) range.e.c = col;
  sheet["!ref"] = XLSX.utils.encode_range(range);
}

// ─── exercise logs → Week sheets ─────────────────────────────────────────────

async function writeExerciseLogsToWeekSheets(wb: XLSX.WorkBook): Promise<void> {
  const allLogs = await db.select().from(exerciseLogsTable);
  if (allLogs.length === 0) return;

  // Group logs by weekNumber
  const byWeek = new Map<number, typeof allLogs>();
  for (const log of allLogs) {
    const list = byWeek.get(log.weekNumber) ?? [];
    list.push(log);
    byWeek.set(log.weekNumber, list);
  }

  for (const [weekNumber, logs] of byWeek) {
    // Find the sheet that contains this week's data
    const sheetName = wb.SheetNames.find((n) => {
      const lower = n.toLowerCase();
      return (lower.includes("upperlower") || lower.includes("upper lower") || lower.includes("deload"));
    });
    if (!sheetName) continue;

    const sheet = wb.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

    for (const log of logs) {
      // Find the exercise name
      const workout = getWorkoutById(log.workoutId);
      const exerciseName = workout?.exercises.find((e) => e.id === log.exerciseId)?.name;
      if (!exerciseName) continue;

      const exerciseNameLower = exerciseName.toLowerCase().trim();

      // Find this exercise row in the sheet (within this week's block)
      for (let ri = 0; ri < rows.length; ri++) {
        const colA = trimCell(rows[ri][0]);
        const colB = trimCell(rows[ri][1]);

        // Check if this row belongs to the right week
        const isWeekHeader = /^week\s+\d+$/i.test(colA);
        if (isWeekHeader) {
          const m = colA.match(/\d+/);
          if (m && parseInt(m[0]) !== weekNumber) {
            // Wrong week, skip ahead
            continue;
          }
        }

        // Match exercise row: col B contains "X: ExerciseName"
        const cellBName = colB.replace(/^[A-Za-z]\s*:\s*/, "").toLowerCase().trim();
        if (cellBName && cellBName === exerciseNameLower) {
          // Found the exercise row — detect Set columns by scanning the header row above
          let setStart = 3; // default Set 1 column index
          let setCount = 5; // default 5 sets

          // Look backwards for the header row
          for (let hi = ri - 1; hi >= Math.max(0, ri - 20); hi--) {
            const headerRow = rows[hi].map((c) => trimCell(c).toLowerCase());
            const werkSetsIdx = headerRow.findIndex((c) => /^werk\s*sets?$/.test(c));
            if (werkSetsIdx > 0) {
              setCount = werkSetsIdx - setStart;
              break;
            }
          }

          // Write weight values into Set columns
          const weights = log.weight ? log.weight.split(",").map((s) => s.trim()) : [];
          for (let si = 0; si < setCount && si < weights.length; si++) {
            const w = parseFloat(weights[si]);
            if (!isNaN(w) && w > 0) {
              setCellValue(sheet, setStart + si, ri, w);
            }
          }

          // Write reps into the Reps column (usually werkSetsIdx + 1)
          // Also check if there's a separate reps block (second "Set 1" occurrence)
          const headerRowArr = rows.slice(Math.max(0, ri - 20), ri).reverse().find((r) =>
            r.map((c) => trimCell(c).toLowerCase()).some((c) => /^werk\s*sets?$/.test(c))
          );
          if (headerRowArr) {
            const hLower = headerRowArr.map((c) => trimCell(c).toLowerCase());
            const werkIdx = hLower.findIndex((c) => /^werk\s*sets?$/.test(c));
            if (werkIdx > 0) {
              const repsCol = werkIdx + 1; // Reps column is right after Werk sets
              if (log.reps) {
                setCellValue(sheet, repsCol, ri, log.reps);
              }
            }
          }

          break; // Found and updated
        }
      }
    }
  }
}

// ─── nutrition & dagboek → Progressie sheet ─────────────────────────────────────

const DAYS_NL: Record<string, string> = {
  mon: "Maandag",
  tue: "Dinsdag",
  wed: "Woensdag",
  thu: "Donderdag",
  fri: "Vrijdag",
  sat: "Zaterdag",
  sun: "Zondag",
};

async function writeNutritionToProgressie(wb: XLSX.WorkBook): Promise<void> {
  const entries = await db.select().from(nutritionEntriesTable);
  if (entries.length === 0) return;

  const sheetName = wb.SheetNames.find((n) => /progressie/i.test(n));
  if (!sheetName) {
    logger.warn("Progressie sheet not found, skipping nutrition export");
    return;
  }

  const sheet = wb.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

  // Group entries by weekNumber and day name (lowercased)
  const entriesMap = new Map<string, typeof entries[0]>();
  for (const entry of entries) {
    const dayNL = DAYS_NL[entry.day] || entry.dayLabel || entry.day;
    entriesMap.set(`${entry.weekNumber}-${dayNL.toLowerCase()}`, entry);
  }

  let currentWeekNumber: number | null = null;
  let colGewicht = 1;
  let colKcal = 2;
  let colBuik = 3;
  let colHeup = 4;
  let colKracht = 5;
  let colEnergie = 6;
  let colSlaap = 7;
  let colStress = 8;
  let colStappen = 9;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const col0 = trimCell(row[0]);
    if (!col0) continue;

    const col0Lower = col0.toLowerCase();

    // Check for "Week N"
    const weekMatch = col0.match(/^week\s+(\d+)$/i);
    if (weekMatch) {
      currentWeekNumber = parseInt(weekMatch[1], 10);

      // detect columns
      const headerRow = row.map((c) => trimCell(c).toLowerCase());
      for (let ci = 1; ci < headerRow.length; ci++) {
        const h = headerRow[ci];
        if (h === "gewicht") colGewicht = ci;
        else if (h.includes("kcal")) colKcal = ci;
        else if (h.includes("buikomvang")) colBuik = ci;
        else if (h.includes("heupomvang")) colHeup = ci;
        else if (h.includes("krachtniveau")) colKracht = ci;
        else if (h.includes("energieniveau")) colEnergie = ci;
        else if (h === "slaap") colSlaap = ci;
        else if (h === "stress") colStress = ci;
        else if (h.includes("stappen")) colStappen = ci;
      }
      continue;
    }

    if (!currentWeekNumber) continue;

    // Is it a day row?
    const entry = entriesMap.get(`${currentWeekNumber}-${col0Lower}`);
    if (entry) {
      let metrics: Record<string, string> = {};
      try {
        if (entry.notes && entry.notes.startsWith("{")) {
          metrics = JSON.parse(entry.notes).metrics || {};
        }
      } catch { /* ignore */ }

      // Write mapped values back using setCellValue
      if (metrics.lichaamsgewicht) setCellValue(sheet, colGewicht, ri, parseFloat(metrics.lichaamsgewicht));
      if (entry.kcal) setCellValue(sheet, colKcal, ri, parseFloat(entry.kcal));
      if (metrics.buikomvang) setCellValue(sheet, colBuik, ri, parseFloat(metrics.buikomvang));
      if (metrics.heupomvang) setCellValue(sheet, colHeup, ri, parseFloat(metrics.heupomvang));
      if (metrics.krachtniveau) setCellValue(sheet, colKracht, ri, parseFloat(metrics.krachtniveau));
      if (metrics.energieNiveau) setCellValue(sheet, colEnergie, ri, parseFloat(metrics.energieNiveau));
      if (metrics.slaapUren) setCellValue(sheet, colSlaap, ri, parseFloat(metrics.slaapUren));
      if (metrics.stressNiveau) setCellValue(sheet, colStress, ri, parseFloat(metrics.stressNiveau));
      if (metrics.stappen) setCellValue(sheet, colStappen, ri, parseFloat(metrics.stappen));
    }
  }

  // Also remove the old Logboek/Dagboek sheet if it exists, as it's no longer used
  const oldSheetIndex = wb.SheetNames.findIndex(n => /dagboek|logboek/i.test(n));
  if (oldSheetIndex >= 0) {
    const oldSheetName = wb.SheetNames[oldSheetIndex];
    wb.SheetNames.splice(oldSheetIndex, 1);
    delete wb.Sheets[oldSheetName];
  }
}

// ─── feedback answers → Feedback sheet ───────────────────────────────────────

async function writeFeedbackAnswers(wb: XLSX.WorkBook): Promise<void> {
  const answers = await db.select().from(feedbackAnswersTable);
  if (answers.length === 0) return;

  const sheetName = wb.SheetNames.find((n) => /feedback/i.test(n));
  if (!sheetName) return;

  const sheet = wb.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

  // Group answers by weekNumber + questionId
  const byWeekQ = new Map<string, string>();
  for (const ans of answers) {
    byWeekQ.set(`${ans.weekNumber}-${ans.questionId}`, ans.answer);
  }

  // Find the answer column (usually col H = index 7) based on header
  let answerCol = 7; // default col H
  let weekCol = 7;
  let qIdCol = 8;
  let ansCol = 9;
  
  for (let ri = 0; ri < Math.min(5, rows.length); ri++) {
    const row = rows[ri].map((c) => trimCell(c).toLowerCase());
    const wIdx = row.findIndex((c) => c === "week");
    const aIdx = row.findIndex((c) => c.includes("antwoord") || c.includes("answer"));
    if (wIdx >= 0 && aIdx >= 0) {
      weekCol = wIdx;
      ansCol = aIdx;
      qIdCol = wIdx + 1;
      break;
    }
  }

  // Append new answers after last row (avoid duplicates by tracking existing)
  const existingKeys = new Set<string>();
  for (let ri = 1; ri < rows.length; ri++) {
    const wk = trimCell(rows[ri][weekCol]);
    const qid = trimCell(rows[ri][qIdCol]);
    if (wk && qid) existingKeys.add(`${wk}-${qid}`);
  }

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  let nextRow = range.e.r + 1;

  for (const [key, answer] of byWeekQ) {
    if (existingKeys.has(key)) continue;
    const [weekStr, qidStr] = key.split("-");
    setCellValue(sheet, weekCol, nextRow, parseInt(weekStr));
    setCellValue(sheet, qIdCol, nextRow, parseInt(qidStr));
    setCellValue(sheet, ansCol, nextRow, answer);
    nextRow++;
  }
}

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Generates an updated Excel workbook with all logged data written back.
 * Returns the workbook as a Buffer for download.
 * If no source Excel file exists, creates a fresh workbook.
 */
export async function generateExportExcel(): Promise<Buffer> {
  let wb: XLSX.WorkBook;

  if (fs.existsSync(EXCEL_PATH)) {
    wb = XLSX.readFile(EXCEL_PATH);
    logger.info("Loaded existing Excel file for export");
  } else {
    // No source file — create a minimal workbook with logged data only
    wb = XLSX.utils.book_new();
    logger.info("No source Excel, creating export from scratch");
  }

  try {
    await writeExerciseLogsToWeekSheets(wb);
  } catch (err) {
    logger.warn({ err }, "Failed to write exercise logs to Excel");
  }

  try {
    await writeNutritionToProgressie(wb);
  } catch (err) {
    logger.warn({ err }, "Failed to write nutrition to Excel Progressie sheet");
  }

  try {
    await writeFeedbackAnswers(wb);
  } catch (err) {
    logger.warn({ err }, "Failed to write feedback to Excel");
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  logger.info("Export Excel generated successfully");
  return buffer;
}
