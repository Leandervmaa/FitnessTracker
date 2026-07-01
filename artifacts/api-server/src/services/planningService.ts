import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  exerciseSetLogsTable,
  plannedWorkoutExercisesTable,
  plannedWorkoutsTable,
  type ExerciseSetLog,
  type PlannedWorkout,
  type PlannedWorkoutExercise,
} from "@workspace/db";

export type PlannedExerciseWithLogs = PlannedWorkoutExercise & {
  currentSetLogs: ExerciseSetLog[];
  previousSetLogs: ExerciseSetLog[];
};

export type PlannedWorkoutWithExercises = PlannedWorkout & {
  exercises: PlannedExerciseWithLogs[];
  exerciseCount: number;
  completedCount: number;
  completedSetCount: number;
  plannedSetCount: number;
};

function byOrder<T extends { sortOrder: number; name?: string }>(a: T, b: T) {
  return a.sortOrder - b.sortOrder || String(a.name || "").localeCompare(String(b.name || ""), "nl");
}

function groupLogsByExercise(logs: ExerciseSetLog[]): Map<string, ExerciseSetLog[]> {
  const map = new Map<string, ExerciseSetLog[]>();
  for (const log of logs) {
    const existing = map.get(log.plannedExerciseId) || [];
    existing.push(log);
    map.set(log.plannedExerciseId, existing);
  }
  for (const values of map.values()) {
    values.sort((a, b) => a.setNumber - b.setNumber);
  }
  return map;
}

function pickPreviousLogs(
  exercise: PlannedWorkoutExercise,
  allPreviousLogs: ExerciseSetLog[],
  currentWorkoutId: string,
): ExerciseSetLog[] {
  if (!exercise.exerciseLibraryId) return [];

  const bySet = new Map<number, ExerciseSetLog>();
  const matches = allPreviousLogs
    .filter((log) => log.exerciseLibraryId === exercise.exerciseLibraryId && log.plannedWorkoutId !== currentWorkoutId)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

  for (const log of matches) {
    if (!bySet.has(log.setNumber)) bySet.set(log.setNumber, log);
  }

  return Array.from(bySet.values()).sort((a, b) => a.setNumber - b.setNumber);
}

export async function getWeekPlan(clientId: string, weekNumber: number): Promise<PlannedWorkoutWithExercises[]> {
  const workouts = await db
    .select()
    .from(plannedWorkoutsTable)
    .where(and(eq(plannedWorkoutsTable.clientId, clientId), eq(plannedWorkoutsTable.weekNumber, weekNumber)))
    .orderBy(asc(plannedWorkoutsTable.sortOrder), asc(plannedWorkoutsTable.name));

  if (workouts.length === 0) return [];
  const workoutIds = workouts.map((workout) => workout.id);

  const exercises = await db
    .select()
    .from(plannedWorkoutExercisesTable)
    .where(inArray(plannedWorkoutExercisesTable.workoutId, workoutIds));

  const logs = await db
    .select()
    .from(exerciseSetLogsTable)
    .where(and(eq(exerciseSetLogsTable.clientId, clientId), eq(exerciseSetLogsTable.weekNumber, weekNumber)));

  const logsByExercise = groupLogsByExercise(logs);
  const exercisesByWorkout = new Map<string, PlannedWorkoutExercise[]>();
  for (const exercise of exercises) {
    const existing = exercisesByWorkout.get(exercise.workoutId) || [];
    existing.push(exercise);
    exercisesByWorkout.set(exercise.workoutId, existing);
  }

  return workouts.map((workout) => {
    const workoutExercises = (exercisesByWorkout.get(workout.id) || []).sort(byOrder).map((exercise) => ({
      ...exercise,
      currentSetLogs: logsByExercise.get(exercise.id) || [],
      previousSetLogs: [],
    }));
    const completedExerciseIds = new Set(workoutExercises.filter((exercise) => exercise.currentSetLogs.length > 0).map((exercise) => exercise.id));
    const plannedSetCount = workoutExercises.reduce((sum, exercise) => sum + (exercise.sets || 0), 0);
    const completedSetCount = workoutExercises.reduce((sum, exercise) => sum + exercise.currentSetLogs.length, 0);

    return {
      ...workout,
      exercises: workoutExercises,
      exerciseCount: workoutExercises.length,
      completedCount: completedExerciseIds.size,
      plannedSetCount,
      completedSetCount,
    };
  });
}

export async function getWorkoutPlan(clientId: string, workoutId: string): Promise<PlannedWorkoutWithExercises | null> {
  const [workout] = await db
    .select()
    .from(plannedWorkoutsTable)
    .where(and(eq(plannedWorkoutsTable.id, workoutId), eq(plannedWorkoutsTable.clientId, clientId)));

  if (!workout) return null;

  const exercises = await db
    .select()
    .from(plannedWorkoutExercisesTable)
    .where(eq(plannedWorkoutExercisesTable.workoutId, workout.id));

  const currentLogs = await db
    .select()
    .from(exerciseSetLogsTable)
    .where(and(eq(exerciseSetLogsTable.clientId, clientId), eq(exerciseSetLogsTable.plannedWorkoutId, workout.id)));

  const libraryIds = exercises
    .map((exercise) => exercise.exerciseLibraryId)
    .filter((id): id is string => !!id);

  const previousLogs =
    libraryIds.length > 0
      ? await db
          .select()
          .from(exerciseSetLogsTable)
          .where(and(eq(exerciseSetLogsTable.clientId, clientId), inArray(exerciseSetLogsTable.exerciseLibraryId, libraryIds)))
      : [];

  const currentLogsByExercise = groupLogsByExercise(currentLogs);
  const exercisesWithLogs = exercises.sort(byOrder).map((exercise) => ({
    ...exercise,
    currentSetLogs: currentLogsByExercise.get(exercise.id) || [],
    previousSetLogs: pickPreviousLogs(exercise, previousLogs, workout.id),
  }));
  const plannedSetCount = exercisesWithLogs.reduce((sum, exercise) => sum + (exercise.sets || 0), 0);
  const completedSetCount = exercisesWithLogs.reduce((sum, exercise) => sum + exercise.currentSetLogs.length, 0);

  return {
    ...workout,
    exercises: exercisesWithLogs,
    exerciseCount: exercisesWithLogs.length,
    completedCount: exercisesWithLogs.filter((exercise) => exercise.currentSetLogs.length > 0).length,
    plannedSetCount,
    completedSetCount,
  };
}
