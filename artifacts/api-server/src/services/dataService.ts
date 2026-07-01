/**
 * Unified data service.
 * Tries to load from uploaded Excel file first.
 */
import { parseExcelFile, getExcelPath, type ParsedExcelData, type ParsedWorkout, type ParsedExercise, type ParsedFeedbackQuestion, type ParsedFeedbackAnswer, type ParsedProgressieWeek, type ParsedProgressieDay } from "./excelParser.js";
import fs from "fs";

type CacheEntry = {
  data: ParsedExcelData | null;
  lastMtime: number | null;
};

export interface ExerciseDefinition {
  id: string;
  name: string;
  notes?: string | null;
  sets: number | null;
  reps: string | null;
  prescribedWeight: string | null;
  sheetWeights?: string | null;
  sheetReps?: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  order: number;
}

export interface WorkoutDefinition {
  id: string;
  name: string;
  dayLabel: string;
  exercises: ExerciseDefinition[];
}

const cacheByExcelPath = new Map<string, CacheEntry>();

function refreshIfNeeded(clientId?: string): ParsedExcelData | null {
  const excelPath = getExcelPath(clientId);
  const cache = cacheByExcelPath.get(excelPath) ?? { data: null, lastMtime: null };
  try {
    if (!fs.existsSync(excelPath)) {
      cache.data = null;
      cache.lastMtime = null;
      cacheByExcelPath.set(excelPath, cache);
      return null;
    }
    const mtime = fs.statSync(excelPath).mtimeMs;
    if (mtime !== cache.lastMtime) {
      cache.data = parseExcelFile(excelPath);
      cache.lastMtime = mtime;
      cacheByExcelPath.set(excelPath, cache);
    }
    return cache.data;
  } catch {
    return cache.data;
  }
}

export function getDataStatus(clientId?: string): {
  source: "excel" | "none";
  excelFilePresent: boolean;
  sheetNames?: string[];
  weeksLoaded?: number;
  parsedAt?: Date;
  excelFilePath: string;
} {
  const data = refreshIfNeeded(clientId);
  const excelFilePath = getExcelPath(clientId);
  if (data) {
    return {
      source: "excel",
      excelFilePresent: true,
      excelFilePath,
      sheetNames: data.sheetNames,
      weeksLoaded: data.weeks.length,
      parsedAt: data.parsedAt,
    };
  }
  return {
    source: "none",
    excelFilePresent: false,
    excelFilePath,
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
    sheetWeights: e.sheetWeights,
    sheetReps: e.sheetReps,
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

export function getAllWeekNumbers(clientId?: string): number[] {
  const data = refreshIfNeeded(clientId);
  if (data && data.weeks.length > 0) {
    return data.weeks.map((w) => w.weekNumber);
  }
  return [];
}

export function getWeek(weekNumber: number, clientId?: string): { weekNumber: number; workouts: WorkoutDefinition[] } | undefined {
  const data = refreshIfNeeded(clientId);
  if (data && data.weeks.length > 0) {
    const week = data.weeks.find((w) => w.weekNumber === weekNumber);
    if (!week) return undefined;
    return {
      weekNumber: week.weekNumber,
      workouts: week.workouts.map(toWorkoutDef),
    };
  }
  return undefined;
}

export function getWorkoutById(workoutId: string, clientId?: string): (WorkoutDefinition & { weekNumber: number }) | undefined {
  const data = refreshIfNeeded(clientId);
  if (data && data.weeks.length > 0) {
    for (const week of data.weeks) {
      const workout = week.workouts.find((w) => w.id === workoutId);
      if (workout) {
        return { ...toWorkoutDef(workout), weekNumber: week.weekNumber };
      }
    }
    return undefined;
  }
  return undefined;
}

export function getFeedbackQuestions(clientId?: string): ParsedFeedbackQuestion[] {
  const data = refreshIfNeeded(clientId);
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

export function getFeedbackAnswers(clientId?: string): ParsedFeedbackAnswer[] {
  const data = refreshIfNeeded(clientId);
  if (data && data.feedbackAnswers.length > 0) {
    return data.feedbackAnswers;
  }
  return [];
}

export function getNutritionTarget(_weekNumber: number, clientId?: string): { kcal: number | null; eiwitten: number | null; koolhydraten: number | null; vetten: number | null; water: number | null } | null {
  const data = refreshIfNeeded(clientId);
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

export function getProgressieWeek(weekNumber: number, clientId?: string): ParsedProgressieWeek | null {
  const data = refreshIfNeeded(clientId);
  if (!data?.progressie) return null;
  return data.progressie.find((w) => w.weekNumber === weekNumber) ?? null;
}

export function getProgressieDay(weekNumber: number, dayId: string, clientId?: string): ParsedProgressieDay | null {
  const week = getProgressieWeek(weekNumber, clientId);
  if (!week) return null;
  return week.days.find((d) => d.dayId === dayId) ?? null;
}
