import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type SetLog = {
  setNumber: number;
  reps: number | null;
  weight: string | null;
};

type Exercise = {
  id: string;
  name: string;
  sets: number;
  repRange: string | null;
  targetRpe: string | null;
  currentSetLogs: SetLog[];
  previousSetLogs: SetLog[];
};

type Workout = {
  id: string;
  name: string;
  dayLabel: string;
  exercises: Exercise[];
  exerciseCount: number;
  completedCount: number;
};

type WeekTotals = {
  totalVolume: number;
  totalSets: number;
  totalReps: number;
  workoutCount: number;
};

type NutritionAvg = {
  avgKcal: number;
  avgEiwit: number;
  avgGewicht: number;
  avgSlaap: number;
  avgStress: number;
  avgEnergie: number;
};

type WeekData = {
  weekNumber: number;
  plan: Workout[];
  totals: WeekTotals;
  nutrition: NutritionAvg;
};

type CompareData = {
  weekA: WeekData;
  weekB: WeekData;
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useCompare(weekA: number, weekB: number) {
  return useQuery<CompareData>({
    queryKey: ["compare-weeks", weekA, weekB],
    queryFn: async () => {
      const res = await apiFetch(`/api/plans/compare/${weekA}/${weekB}`);
      if (!res.ok) throw new Error("Vergelijking ophalen mislukt");
      return res.json();
    },
    enabled: weekA >= 1 && weekB >= 1 && weekA !== weekB,
    staleTime: 30_000,
  });
}

function usePlannedWeekNumbers() {
  return useQuery<{ weekNumbers: number[] }>({
    queryKey: ["planned-weeks"],
    queryFn: async () => {
      const res = await apiFetch("/api/plans/weeks");
      if (!res.ok) return { weekNumbers: [] };
      return res.json();
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasExecution(log: SetLog): boolean {
  return log.reps !== null || !!log.weight;
}

function exerciseWasDone(exercise: Exercise | undefined): boolean {
  return !!exercise?.currentSetLogs?.some(hasExecution);
}

function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "?";
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value);
  return Number.isInteger(numberValue) ? String(numberValue) : String(numberValue).replace(/\.0+$/, "");
}

function setLines(exercise: Exercise | undefined): string[] {
  if (!exerciseWasDone(exercise)) return [];
  return [...(exercise?.currentSetLogs || [])]
    .filter(hasExecution)
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((log) => `${formatNumber(log.reps)} x ${formatNumber(log.weight)}`);
}

function findExerciseInWeek(plan: Workout[], workoutName: string, exerciseName: string): Exercise | undefined {
  const sameWorkoutMatches = plan
    .find((workout) => workout.name === workoutName)
    ?.exercises.filter((exercise) => exercise.name === exerciseName) || [];
  return sameWorkoutMatches.find(exerciseWasDone) ?? sameWorkoutMatches[0] ??
    plan.flatMap((workout) => workout.exercises).filter((exercise) => exercise.name === exerciseName).find(exerciseWasDone);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExecutionPanel({ weekNumber, lines }: { weekNumber: number; lines: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Week {weekNumber}</p>
      {lines.length > 0 ? (
        <div className="space-y-1">
          {lines.map((line, index) => (
            <p key={`${line}-${index}`} className="text-sm font-bold text-foreground tabular-nums">
              {line}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-sm font-semibold text-muted-foreground italic">Oefening niet gedaan</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VergelijkPage() {
  const [, setLocation] = useLocation();

  const { data: weeksData } = usePlannedWeekNumbers();
  const allWeeks = weeksData?.weekNumbers ?? [];

  const [weekA, setWeekA] = useState<number>(0);
  const [weekB, setWeekB] = useState<number>(0);

  // Auto-select last two weeks on first load
  useMemo(() => {
    if (allWeeks.length >= 2 && weekA === 0 && weekB === 0) {
      setWeekA(allWeeks[allWeeks.length - 2]);
      setWeekB(allWeeks[allWeeks.length - 1]);
    }
  }, [allWeeks]);

  const { data: compareData, isLoading, error } = useCompare(weekA, weekB);

  const stepWeekA = (dir: 1 | -1) => {
    const idx = allWeeks.indexOf(weekA);
    const next = allWeeks[idx + dir];
    if (next !== undefined) setWeekA(next);
  };

  const stepWeekB = (dir: 1 | -1) => {
    const idx = allWeeks.indexOf(weekB);
    const next = allWeeks[idx + dir];
    if (next !== undefined) setWeekB(next);
  };

  const comparisonSections = useMemo(() => {
    if (!compareData) return [];
    const recentWeek = compareData.weekB.weekNumber >= compareData.weekA.weekNumber ? compareData.weekB : compareData.weekA;
    const referenceWeek = recentWeek.weekNumber === compareData.weekB.weekNumber ? compareData.weekA : compareData.weekB;

    return recentWeek.plan
      .map((workout) => ({
        workout,
        recentWeekNumber: recentWeek.weekNumber,
        referenceWeekNumber: referenceWeek.weekNumber,
        exercises: workout.exercises
          .filter(exerciseWasDone)
          .map((exercise) => ({
            exercise,
            recentLines: setLines(exercise),
            referenceLines: setLines(findExerciseInWeek(referenceWeek.plan, workout.name, exercise.name)),
          })),
      }))
      .filter((section) => section.exercises.length > 0);
  }, [compareData]);

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center max-w-md mx-auto">
      {/* Header */}
      <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="mr-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold text-foreground flex-1">Vergelijken</h1>
      </header>

      {/* Week Selectors */}
      <div className="w-full p-4 grid grid-cols-[1fr_auto_1fr] gap-2 items-center border-b border-border">
        {/* Week A */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepWeekA(-1)} disabled={allWeeks.indexOf(weekA) <= 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 text-center">
            <p className="text-xs text-muted-foreground">Oud</p>
            <p className="text-lg font-bold text-foreground">Week {weekA || "—"}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepWeekA(1)} disabled={allWeeks.indexOf(weekA) >= allWeeks.length - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="text-muted-foreground text-xs text-center">vs</div>

        {/* Week B */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepWeekB(-1)} disabled={allWeeks.indexOf(weekB) <= 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 text-center">
            <p className="text-xs text-muted-foreground">Nieuw</p>
            <p className="text-lg font-bold text-foreground">Week {weekB || "—"}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => stepWeekB(1)} disabled={allWeeks.indexOf(weekB) >= allWeeks.length - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {compareData && (
        <div className="w-full px-4 py-3 text-xs font-bold text-muted-foreground border-b border-border/50">
          Oefeningen uit de meest recente week worden hieronder vergeleken met week {Math.min(compareData.weekA.weekNumber, compareData.weekB.weekNumber)}.
        </div>
      )}

      <div className="w-full p-4 flex flex-col gap-5">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive text-center">
            Kon vergelijking niet laden. Controleer of beide weken data hebben.
          </div>
        )}

        {compareData && (
          <>
            {comparisonSections.map(({ workout, exercises, referenceWeekNumber, recentWeekNumber }) => (
              <section key={workout.id}>
                <div className="flex items-center gap-2 mb-3">
                  <Dumbbell className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <h2 className="text-sm font-bold text-foreground">{workout.name}</h2>
                    <p className="text-xs text-muted-foreground">{workout.dayLabel}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {exercises.map(({ exercise, referenceLines, recentLines }) => (
                    <div key={exercise.id} className="rounded-xl bg-card border border-border p-4 shadow-sm">
                      <h3 className="text-base font-black text-foreground mb-3">{exercise.name}</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <ExecutionPanel weekNumber={referenceWeekNumber} lines={referenceLines} />
                        <ExecutionPanel weekNumber={recentWeekNumber} lines={recentLines} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {comparisonSections.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Geen gelogde oefeningen gevonden in de meest recente week.
              </div>
            )}
          </>
        )}

        {!isLoading && !compareData && weekA > 0 && weekB > 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Selecteer twee weken met data om te vergelijken.
          </div>
        )}
      </div>
    </div>
  );
}
