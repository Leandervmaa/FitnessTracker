import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, ArrowRight, Dumbbell, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useClient } from "@/components/client-context";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(a: number, b: number): number | null {
  if (!a || !b) return null;
  return Math.round(((b - a) / a) * 100);
}

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

function DeltaBadge({ a, b, higherIsBetter = true }: { a: number; b: number; higherIsBetter?: boolean }) {
  const diff = pct(a, b);
  if (diff === null) return <span className="text-muted-foreground text-xs">—</span>;
  const isPositive = diff > 0;
  const isGood = higherIsBetter ? isPositive : !isPositive;
  const color = diff === 0 ? "text-muted-foreground" : isGood ? "text-green-500" : "text-red-500";
  const Icon = diff === 0 ? Minus : isPositive ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      <Icon className="h-3 w-3" />
      {diff > 0 ? "+" : ""}{diff}%
    </span>
  );
}

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatRow({
  label,
  valueA,
  valueB,
  higherIsBetter = true,
  decimals = 0,
}: {
  label: string;
  valueA: number;
  valueB: number;
  higherIsBetter?: boolean;
  decimals?: number;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2 border-b border-border/50 last:border-0">
      <span className="text-right font-semibold text-sm text-foreground tabular-nums">{fmt(valueA, decimals)}</span>
      <div className="flex flex-col items-center gap-0.5 min-w-[80px]">
        <span className="text-xs text-muted-foreground text-center leading-tight">{label}</span>
        <DeltaBadge a={valueA} b={valueB} higherIsBetter={higherIsBetter} />
      </div>
      <span className="text-left font-semibold text-sm text-foreground tabular-nums">{fmt(valueB, decimals)}</span>
    </div>
  );
}

function WorkoutCompare({ workoutA, workoutB }: { workoutA: Workout | undefined; workoutB: Workout | undefined }) {
  const allExerciseNames = useMemo(() => {
    const names = new Set<string>();
    workoutA?.exercises.forEach((e) => names.add(e.name));
    workoutB?.exercises.forEach((e) => names.add(e.name));
    return Array.from(names);
  }, [workoutA, workoutB]);

  const getExSummary = (workout: Workout | undefined, name: string) => {
    const ex = workout?.exercises.find((e) => e.name === name);
    if (!ex || ex.currentSetLogs.length === 0) return null;
    return ex.currentSetLogs
      .map((l) => `S${l.setNumber}: ${l.weight || "?"} kg · ${l.reps || "?"} reps`)
      .join("  ");
  };

  return (
    <div className="space-y-1">
      {allExerciseNames.map((name) => {
        const summaryA = getExSummary(workoutA, name);
        const summaryB = getExSummary(workoutB, name);
        const inA = !!workoutA?.exercises.find((e) => e.name === name);
        const inB = !!workoutB?.exercises.find((e) => e.name === name);

        return (
          <div key={name} className="rounded-lg bg-card border border-border p-3">
            <p className="text-xs font-semibold text-foreground text-center mb-2">{name}</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="text-right">
                {inA ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">{summaryA || "geen logs"}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">—</p>
                )}
              </div>
              <div className="flex items-center justify-center">
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="text-left">
                {inB ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">{summaryB || "geen logs"}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">—</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VergelijkPage() {
  const [, setLocation] = useLocation();
  const { activeClientId } = useClient();

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

  // Match workouts by name/dayLabel across both weeks
  const workoutPairs = useMemo(() => {
    if (!compareData) return [];
    const planA = compareData.weekA.plan;
    const planB = compareData.weekB.plan;
    const allNames = Array.from(new Set([...planA.map((w) => w.name), ...planB.map((w) => w.name)]));
    return allNames.map((name) => ({
      name,
      wA: planA.find((w) => w.name === name),
      wB: planB.find((w) => w.name === name),
    }));
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

      {/* Column headers */}
      {compareData && (
        <div className="w-full px-4 py-2 grid grid-cols-[1fr_auto_1fr] text-xs font-bold text-muted-foreground border-b border-border/50">
          <span className="text-right">Week {compareData.weekA.weekNumber}</span>
          <span className="w-[80px]" />
          <span className="text-left">Week {compareData.weekB.weekNumber}</span>
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
            {/* ─── Metingen ─── */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Utensils className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Metingen (weekgemiddelde)</h2>
              </div>
              <div className="rounded-xl bg-card border border-border p-4">
                <StatRow
                  label="Gewicht (kg)"
                  valueA={compareData.weekA.nutrition.avgGewicht}
                  valueB={compareData.weekB.nutrition.avgGewicht}
                  higherIsBetter={false}
                  decimals={1}
                />
                <StatRow
                  label="Calorieën (kcal)"
                  valueA={compareData.weekA.nutrition.avgKcal}
                  valueB={compareData.weekB.nutrition.avgKcal}
                  decimals={0}
                />
                <StatRow
                  label="Eiwit (g)"
                  valueA={compareData.weekA.nutrition.avgEiwit}
                  valueB={compareData.weekB.nutrition.avgEiwit}
                  decimals={0}
                />
                <StatRow
                  label="Slaap (uren)"
                  valueA={compareData.weekA.nutrition.avgSlaap}
                  valueB={compareData.weekB.nutrition.avgSlaap}
                  decimals={1}
                />
                <StatRow
                  label="Energieniveau"
                  valueA={compareData.weekA.nutrition.avgEnergie}
                  valueB={compareData.weekB.nutrition.avgEnergie}
                  decimals={1}
                />
                <StatRow
                  label="Stressniveau"
                  valueA={compareData.weekA.nutrition.avgStress}
                  valueB={compareData.weekB.nutrition.avgStress}
                  higherIsBetter={false}
                  decimals={1}
                />
              </div>
            </section>

            {/* ─── Per training ─── */}
            {workoutPairs.map(({ name, wA, wB }) => (
              <section key={name}>
                <div className="flex items-center gap-2 mb-3">
                  <Dumbbell className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-bold text-foreground">{name}</h2>
                  {!wA && <span className="text-xs bg-green-500/20 text-green-600 px-1.5 py-0.5 rounded font-semibold">Nieuw</span>}
                </div>
                <WorkoutCompare workoutA={wA} workoutB={wB} />
              </section>
            ))}

            {workoutPairs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Geen trainingsdata gevonden voor deze weken.
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
