import { db } from "@workspace/db";
import { exerciseLogsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { EXCEL_PATH } from "./excelParser.js";
import { readRange } from "./sheetsService.js";
import { getAllWeekNumbers, getWeek } from "./dataService.js";
import { logger } from "../lib/logger.js";
import fs from "fs";

function toStr(val: any): string | null {
  if (val === undefined || val === null || String(val).trim() === "" || String(val).trim() === "-") return null;
  return String(val).trim();
}

export async function syncLogsFromExcel(): Promise<void> {
  if (!fs.existsSync(EXCEL_PATH)) return;
  try {
    logger.info("Syncing historical logs from Excel file...");
    const XLSX = await import("xlsx");
    const wb = XLSX.readFile(EXCEL_PATH);
    
    let importCount = 0;

    for (const sheetName of wb.SheetNames) {
      const lower = sheetName.toLowerCase().trim();
      if (lower.includes("upperlower") || lower.includes("upper lower") || lower.includes("deload")) {
        const sheet = wb.Sheets[sheetName];
        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          raw: false,
        });

        let currentWeek: number | null = null;
        let currentWorkoutId = "";
        let exerciseOrder = 0;
        let colMap = { werkSets: 8, reps: 9, setStart: 3, setEnd: 7 };

        for (let ri = 0; ri < rows.length; ri++) {
          const row = rows[ri];
          const colA = toStr(row[0]) || "";
          const colB = toStr(row[1]) || "";

          if (!colA && !colB) continue;

          if (/^week\s+\d+$/i.test(colA) && (colB === "" || /^(oefening|datum)/i.test(colB))) {
            const match = colA.match(/\d+/);
            if (match) {
              currentWeek = parseInt(match[0], 10);
              let werkSets = -1;
              let reps = -1;
              for (let i = 0; i < row.length; i++) {
                const c = toStr(row[i])?.toLowerCase() || "";
                if (/^werk\s*sets?$/.test(c)) werkSets = i;
                if (c === "reps") reps = i;
              }
              if (werkSets !== -1 && reps !== -1) {
                colMap = { werkSets, reps, setStart: 3, setEnd: werkSets - 1 };
              } else {
                colMap = { werkSets: 8, reps: 9, setStart: 3, setEnd: 7 };
              }
            }
            continue;
          }

          if (currentWeek === null) continue;

          if (/^training\s+[A-D]/i.test(colA)) {
            exerciseOrder = 0;
            const letterMatch = colA.match(/training\s+([A-D])/i);
            const letter = letterMatch ? letterMatch[1].toUpperCase() : "A";
            currentWorkoutId = `w${currentWeek}-${letter}`;
            
            if (colB && /^[A-Z]\s*:/i.test(colB)) {
              exerciseOrder++;
              await processExcelRow(row, colMap, currentWeek, currentWorkoutId, exerciseOrder, colB);
            }
            continue;
          }

          if (colB && /^[A-Z]\s*:/i.test(colB) && !/^opmerkingen/i.test(colB)) {
            exerciseOrder++;
            await processExcelRow(row, colMap, currentWeek, currentWorkoutId, exerciseOrder, colB);
          }
        }
      }
    }

    async function processExcelRow(row: string[], colMap: any, weekNum: number, workoutId: string, order: number, rawName: string) {
      const cleanName = rawName.replace(/^\s*[A-Za-z]\s*:\s*/, "").trim().toLowerCase();
      
      const weights: string[] = [];
      for (let c = colMap.setStart; c <= colMap.setEnd; c++) {
        if (c < row.length) {
          const val = toStr(row[c]);
          if (val && val !== "-") {
            weights.push(val);
          }
        }
      }

      if (weights.length > 0) {
        const weekProgram = getWeek(weekNum);
        if (!weekProgram) return;

        const exerciseDef = weekProgram.workouts
          .flatMap(w => w.exercises)
          .find(e => e.name.toLowerCase().trim() === cleanName);

        if (exerciseDef) {
          const workoutDef = weekProgram.workouts.find(w => w.exercises.some(e => e.id === exerciseDef.id));
          if (!workoutDef) return;

          const existing = await db
            .select()
            .from(exerciseLogsTable)
            .where(
              and(
                eq(exerciseLogsTable.exerciseId, exerciseDef.id),
                eq(exerciseLogsTable.weekNumber, weekNum)
              )
            );

          if (existing.length === 0) {
            const repsVal = colMap.reps < row.length ? toStr(row[colMap.reps]) || "0" : "0";
            const repsArr = Array(weights.length).fill(repsVal);

            await db.insert(exerciseLogsTable).values({
              exerciseId: exerciseDef.id,
              workoutId: workoutDef.id,
              weekNumber: weekNum,
              sets: exerciseDef.sets,
              reps: repsArr.join(", "),
              weight: weights.join(", "),
              notes: "Geïmporteerd uit Excel bestand"
            });
            importCount++;
          }
        }
      }
    }

    logger.info(`Synced ${importCount} logs from Excel.`);
  } catch (err) {
    logger.error({ err }, "Failed to sync logs from Excel");
  }
}

export async function syncLogsFromSheets(): Promise<void> {
  try {
    logger.info("Syncing historical logs from Google Sheets...");
    const weekNumbers = getAllWeekNumbers();
    let importCount = 0;

    for (const weekNum of weekNumbers) {
      const sheetName = `Week ${weekNum}`;
      const data = await readRange(`${sheetName}!A1:Z200`);
      if (!data || data.length < 2) continue;

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

      const weekProgram = getWeek(weekNum);
      if (!weekProgram) continue;

      let currentWorkoutId = "";
      let exerciseOrder = 0;

      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        const firstCell = toStr(row[0]) || "";
        if (!firstCell) continue;

        const firstLower = firstCell.toLowerCase();
        const isDay = firstLower.includes("training") || firstLower.includes("dag") || 
                      ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"].some(d => firstLower.includes(d));

        if (isDay) {
          exerciseOrder = 0;
          const trainingLetter = firstCell.match(/[ABCD]$/)?.[0] || "";
          const foundWorkout = weekProgram.workouts.find(w => w.id.endsWith(trainingLetter));
          currentWorkoutId = foundWorkout ? foundWorkout.id : `w${weekNum}-${trainingLetter || "A"}`;
          continue;
        }

        if (
          firstLower.includes("oefening") ||
          firstLower.includes("exercise") ||
          firstLower.includes("naam") ||
          firstLower.startsWith("#")
        )
          continue;

        exerciseOrder++;

        const weights: string[] = [];
        for (const colIdx of setCols) {
          if (colIdx < row.length) {
            const val = toStr(row[colIdx]);
            if (val && val !== "-") {
              weights.push(val);
            }
          }
        }

        if (weights.length > 0) {
          const cleanName = firstCell.replace(/^[a-z]\s*:/i, "").trim().toLowerCase();
          const exerciseDef = weekProgram.workouts
            .flatMap(w => w.exercises)
            .find(e => e.name.toLowerCase().trim() === cleanName);

          if (exerciseDef) {
            const workoutDef = weekProgram.workouts.find(w => w.exercises.some(e => e.id === exerciseDef.id));
            if (!workoutDef) continue;

            const existing = await db
              .select()
              .from(exerciseLogsTable)
              .where(
                and(
                  eq(exerciseLogsTable.exerciseId, exerciseDef.id),
                  eq(exerciseLogsTable.weekNumber, weekNum)
                )
              );

            if (existing.length === 0) {
              const repsVal = repsCol >= 0 && repsCol < row.length ? toStr(row[repsCol]) || "0" : "0";
              const repsArr = Array(weights.length).fill(repsVal);

              await db.insert(exerciseLogsTable).values({
                exerciseId: exerciseDef.id,
                workoutId: workoutDef.id,
                weekNumber: weekNum,
                sets: exerciseDef.sets,
                reps: repsArr.join(", "),
                weight: weights.join(", "),
                notes: "Geïmporteerd uit spreadsheet"
              });
              importCount++;
            }
          }
        }
      }
    }
    logger.info(`Synced ${importCount} logs from Google Sheets.`);
  } catch (err) {
    logger.error({ err }, "Failed to sync logs from Google Sheets");
  }
}

export async function syncAllLogs(): Promise<void> {
  // Sync from Excel first, then Sheets (Sheets overrides Excel if both have it, though existing check blocks duplicates)
  await syncLogsFromExcel();
  await syncLogsFromSheets();
}
