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

            const match = colA.match(/\d+/);
            if (match) {
              currentWeek = parseInt(match[0], 10);
              let werkSets = -1;
              let reps = -1;
              const set1Indices: number[] = [];
              for (let i = 0; i < row.length; i++) {
                const c = toStr(row[i])?.toLowerCase() || "";
                if (/^werk\s*sets?$/.test(c)) werkSets = i;
                if (c === "reps") reps = i;
                if (c === "set 1") set1Indices.push(i);
              }
              const setStart = 3;
              const setEnd = werkSets !== -1 ? werkSets - 1 : 7;
              let repsSetStart = -1;
              let repsSetEnd = -1;
              
              if (set1Indices.length >= 2) {
                repsSetStart = set1Indices[1];
                repsSetEnd = repsSetStart + (setEnd - setStart);
              } else {
                repsSetStart = setStart + 10;
                repsSetEnd = setEnd + 10;
              }
              colMap = { werkSets: werkSets !== -1 ? werkSets : 8, reps: reps !== -1 ? reps : 9, setStart, setEnd, repsSetStart, repsSetEnd } as any;
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
      
      const numSets = colMap.setEnd - colMap.setStart + 1;
      let lastFilledIndex = -1;

      for (let i = 0; i < numSets; i++) {
        const wCol = colMap.setStart + i;
        const rCol = colMap.repsSetStart + i;

        const wVal = wCol < row.length ? toStr(row[wCol]) || "" : "";
        const rVal = (colMap.repsSetStart !== -1 && rCol < row.length) ? toStr(row[rCol]) || "" : "";

        const hasWeight = wVal !== "" && wVal !== "-";
        const hasRep = rVal !== "" && !rVal.includes("-") && !isNaN(parseInt(rVal, 10));

        if (hasWeight || hasRep) {
          lastFilledIndex = i;
        }
      }

      if (lastFilledIndex >= 0) {
        const weekProgram = getWeek(weekNum);
        if (!weekProgram) return;

        const exerciseDef = weekProgram.workouts
          .flatMap(w => w.exercises)
          .find(e => e.name.toLowerCase().trim() === cleanName);

        if (exerciseDef) {
          const workoutDef = weekProgram.workouts.find(w => w.exercises.some(e => e.id === exerciseDef.id));
          if (!workoutDef) return;

          const weightsArr: string[] = [];
          const repsArr: string[] = [];

          for (let i = 0; i <= lastFilledIndex; i++) {
            const wCol = colMap.setStart + i;
            const rCol = colMap.repsSetStart + i;

            const wVal = wCol < row.length ? toStr(row[wCol]) || "" : "";
            const rVal = (colMap.repsSetStart !== -1 && rCol < row.length) ? toStr(row[rCol]) || "" : "";

            weightsArr.push(wVal === "-" ? "" : wVal);

            const hasRep = rVal !== "" && !rVal.includes("-") && !isNaN(parseInt(rVal, 10));
            repsArr.push(hasRep ? rVal : "0");
          }

          const finalWeights = weightsArr.every(w => w === "") ? "" : weightsArr.join(", ");
          const finalReps = repsArr.join(", ");

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
            await db.insert(exerciseLogsTable).values({
              exerciseId: exerciseDef.id,
              workoutId: workoutDef.id,
              weekNumber: weekNum,
              sets: exerciseDef.sets,
              reps: finalReps,
              weight: finalWeights,
              notes: "Geïmporteerd uit Excel bestand"
            });
            importCount++;
          } else {
            const dbLog = existing[0];
            const isHistorical = weekNum <= 14;
            const repsDifferent = dbLog.reps !== finalReps;
            const weightDifferent = dbLog.weight !== finalWeights;
            const needsFix = repsDifferent || weightDifferent;

            if (needsFix && (isHistorical || dbLog.notes?.includes("Geïmporteerd"))) {
              await db.update(exerciseLogsTable)
                .set({ 
                  reps: finalReps,
                  weight: finalWeights,
                  notes: dbLog.notes?.includes("Geïmporteerd") 
                    ? dbLog.notes 
                    : `${dbLog.notes ? dbLog.notes + " | " : ""}Geïmporteerd/Gecorrigeerd uit Excel`
                })
                .where(eq(exerciseLogsTable.id, dbLog.id));
              importCount++;
            }
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
      let repsSetCols: number[] = [];
      let repsCol = -1;

      for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i].map((c) => c?.toLowerCase() || "");
        if (row.some(c => c.includes("set"))) {
          headerRowIndex = i;
          let set1Count = 0;
          for (let j = 0; j < row.length; j++) {
            if (row[j].match(/set\s*1/)) set1Count++;
            if (row[j].match(/set\s*\d/)) {
              if (set1Count <= 1) setCols.push(j);
              else repsSetCols.push(j);
            }
            if (row[j] === "reps") repsCol = j;
          }
          break;
        }
      }

      if (setCols.length === 0) setCols = [3, 4, 5, 6, 7];
      if (repsSetCols.length === 0) repsSetCols = setCols.map(c => c + 10);

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

            const repsArr: string[] = [];
            for (let idx = 0; idx < weights.length; idx++) {
              const repColIdx = repsSetCols[idx];
              if (repColIdx !== undefined && repColIdx < row.length) {
                const val = toStr(row[repColIdx]);
                if (val && !val.includes("-")) {
                  repsArr.push(val);
                } else {
                  repsArr.push("0");
                }
              } else {
                repsArr.push("0");
              }
            }
            const finalReps = repsArr.join(", ");

            if (existing.length === 0) {
              await db.insert(exerciseLogsTable).values({
                exerciseId: exerciseDef.id,
                workoutId: workoutDef.id,
                weekNumber: weekNum,
                sets: exerciseDef.sets,
                reps: finalReps,
                weight: weights.join(", "),
                notes: "Geïmporteerd uit spreadsheet"
              });
              importCount++;
            } else if (existing[0].notes?.includes("Geïmporteerd") && existing[0].reps !== finalReps) {
               await db.update(exerciseLogsTable)
                 .set({ reps: finalReps })
                 .where(eq(exerciseLogsTable.id, existing[0].id));
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
