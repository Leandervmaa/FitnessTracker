/**
 * Unified data service.
 * Tries to load from uploaded Excel file first.
 * Falls back to hardcoded workoutProgram.ts when file is absent.
 */
import { parseExcelFile, EXCEL_PATH, type ParsedExcelData, type ParsedWorkout, type ParsedExercise, type ParsedFeedbackQuestion } from "./excelParser.js";
import { getWeekProgram, getAllWeeks, getWorkoutById as getWorkoutByIdHardcoded, type WorkoutDefinition, type ExerciseDefinition } from "../data/workoutProgram.js";
import { logger } from "../lib/logger.js";
import fs from "fs";

let cachedData: ParsedExcelData | null = null;
let lastMtime: number | null = null;

function refreshIfNeeded(): ParsedExcelData | null {
  try {
    if (!fs.existsSync(EXCEL_PATH)) {
      cachedData = null;
      lastMtime = null;
      return null;
    }
    const mtime = fs.statSync(EXCEL_PATH).mtimeMs;
    if (mtime !== lastMtime) {
      cachedData = parseExcelFile(EXCEL_PATH);
      lastMtime = mtime;
    }
    return cachedData;
  } catch {
    return cachedData;
  }
}

export function getDataStatus(): {
  source: "excel" | "demo";
  excelFilePresent: boolean;
  sheetNames?: string[];
  weeksLoaded?: number;
  parsedAt?: Date;
} {
  const data = refreshIfNeeded();
  if (data) {
    return {
      source: "excel",
      excelFilePresent: true,
      sheetNames: data.sheetNames,
      weeksLoaded: data.weeks.length,
      parsedAt: data.parsedAt,
    };
  }
  return {
    source: "demo",
    excelFilePresent: false,
  };
}

function toExerciseDef(e: ParsedExercise): ExerciseDefinition {
  return {
    id: e.id,
    name: e.name,
    notes: e.notes,
    sets: e.sets,
    reps: e.reps,
    prescribedWeight: e.prescribedWeight,
    videoUrl: e.videoUrl,
    imageUrl: e.imageUrl,
    order: e.order,
  };
}

function toWorkoutDef(w: ParsedWorkout): WorkoutDefinition {
  return {
    id: w.id,
    name: w.name,
    dayLabel: w.dayLabel,
    exercises: w.exercises.map(toExerciseDef),
  };
}

export function getAllWeekNumbers(): number[] {
  const data = refreshIfNeeded();
  if (data && data.weeks.length > 0) {
    return data.weeks.map((w) => w.weekNumber);
  }
  return getAllWeeks();
}

export function getWeek(weekNumber: number): { weekNumber: number; workouts: WorkoutDefinition[] } | undefined {
  const data = refreshIfNeeded();
  if (data && data.weeks.length > 0) {
    const week = data.weeks.find((w) => w.weekNumber === weekNumber);
    if (!week) return undefined;
    return {
      weekNumber: week.weekNumber,
      workouts: week.workouts.map(toWorkoutDef),
    };
  }
  const fallback = getWeekProgram(weekNumber);
  return fallback;
}

export function getWorkoutById(workoutId: string): (WorkoutDefinition & { weekNumber: number }) | undefined {
  const data = refreshIfNeeded();
  if (data && data.weeks.length > 0) {
    for (const week of data.weeks) {
      const workout = week.workouts.find((w) => w.id === workoutId);
      if (workout) {
        return { ...toWorkoutDef(workout), weekNumber: week.weekNumber };
      }
    }
    return undefined;
  }
  return getWorkoutByIdHardcoded(workoutId);
}

export function getFeedbackQuestions(): ParsedFeedbackQuestion[] {
  const data = refreshIfNeeded();
  if (data && data.feedbackQuestions.length > 0) {
    return data.feedbackQuestions;
  }
  return [
    { id: 1, question: "Hoe voelde je je deze week qua energie en herstel?", order: 1 },
    { id: 2, question: "Welke training ging het beste en waarom?", order: 2 },
    { id: 3, question: "Zijn er oefeningen waarbij je progressie hebt geboekt of die moeizamer gingen?", order: 3 },
    { id: 4, question: "Wat wil je volgende week anders aanpakken of verbeteren?", order: 4 },
  ];
}

export function getNutritionTarget(_weekNumber: number): { kcal: number | null; eiwitten: number | null; koolhydraten: number | null; vetten: number | null; water: number | null } | null {
  const data = refreshIfNeeded();
  if (data?.nutritionTarget) {
    return {
      kcal: data.nutritionTarget.kcal,
      eiwitten: data.nutritionTarget.eiwitten,
      koolhydraten: data.nutritionTarget.koolhydraten,
      vetten: data.nutritionTarget.vetten,
      water: data.nutritionTarget.waterL,
    };
  }
  return null;
}
