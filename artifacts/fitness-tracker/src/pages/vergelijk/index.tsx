import { useState, useMemo } from "react";
import { Link } from "wouter";
import { ChevronLeft, ArrowRightLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useWeek } from "@/components/week-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { 
  useGetExerciseLogs, 
  useGetWorkoutsForWeek, 
  useListWeeks,
  getGetExerciseLogsQueryKey,
  getGetWorkoutsForWeekQueryKey
} from "@workspace/api-client-react";

interface ProgressieDay {
  gewicht: number | null;
  kcal: number | null;
  slaap: number | null;
  stress: number | null;
  energieniveau: number | null;
}

interface ProgressieWeek {
  days: ProgressieDay[];
}

function useProgressieWeek(weekNumber: number) {
  return useQuery<ProgressieWeek | null>({
    queryKey: ["progressie-week", weekNumber],
    queryFn: async () => {
      if (!weekNumber) return null;
      try {
        const res = await fetch(`/api/nutrition/progressie/${weekNumber}`);
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    enabled: !!weekNumber,
    staleTime: 60_000,
  });
}

function calculateAverage(days: ProgressieDay[] | undefined, key: keyof ProgressieDay): number | null {
  if (!days) return null;
  const validDays = days.filter(d => d[key] !== null);
  if (validDays.length === 0) return null;
  const sum = validDays.reduce((acc, d) => acc + (d[key] as number), 0);
  return sum / validDays.length;
}

// Helper for rendering differences
function DiffText({ a, b, unit = "", decimals = 1, reverseColors = false }: { a: number | null, b: number | null, unit?: string, decimals?: number, reverseColors?: boolean }) {
  if (a === null || b === null) return <span className="text-muted-foreground">—</span>;
  const diff = b - a;
  if (Math.abs(diff) < 0.01) return <span className="text-muted-foreground font-medium flex items-center gap-1"><Minus className="w-3 h-3"/> 0{unit}</span>;
  
  const isPositive = diff > 0;
  const isGood = reverseColors ? !isPositive : isPositive;
  const Icon = isPositive ? TrendingUp : TrendingDown;
  const colorClass = isGood ? "text-green-600 dark:text-green-400" : "text-destructive";
  
  return (
    <span className={`font-bold flex items-center gap-1 ${colorClass}`}>
      <Icon className="w-3.5 h-3.5" />
      {diff > 0 ? "+" : ""}{diff.toFixed(decimals)}{unit}
    </span>
  );
}

export default function VergelijkPage() {
  const { selectedWeek } = useWeek();
  const { data: weeks } = useListWeeks();
  const maxWeek = weeks ? Math.max(...weeks.map((w: any) => w.weekNumber)) : selectedWeek || 1;
  
  const [weekA, setWeekA] = useState<number>(Math.max(1, (selectedWeek || 2) - 1));
  const [weekB, setWeekB] = useState<number>(selectedWeek || 1);

  // Fetch Dagboek Data
  const { data: progA } = useProgressieWeek(weekA);
  const { data: progB } = useProgressieWeek(weekB);

  // Fetch Training Data
  const { data: logsA = [] } = useGetExerciseLogs(
    { weekNumber: weekA }, 
    { query: { queryKey: getGetExerciseLogsQueryKey({ weekNumber: weekA }), enabled: !!weekA } }
  );
  const { data: logsB = [] } = useGetExerciseLogs(
    { weekNumber: weekB }, 
    { query: { queryKey: getGetExerciseLogsQueryKey({ weekNumber: weekB }), enabled: !!weekB } }
  );
  
  const { data: workoutsA = [] } = useGetWorkoutsForWeek(
    weekA, 
    { query: { queryKey: getGetWorkoutsForWeekQueryKey(weekA), enabled: !!weekA } }
  );
  const { data: workoutsB = [] } = useGetWorkoutsForWeek(
    weekB, 
    { query: { queryKey: getGetWorkoutsForWeekQueryKey(weekB), enabled: !!weekB } }
  );

  // Aggregate logs by workout (full outer join on workouts from Week A and Week B)
  const workoutsCompare = useMemo(() => {
    const pairedWorkouts: Array<{ workoutA: any; workoutB: any }> = [];
    const matchedBIds = new Set<string>();

    workoutsA.forEach((wA: any) => {
      const wB = workoutsB.find((wb: any) => wb.name === wA.name || wb.dayLabel === wA.dayLabel);
      if (wB) {
        matchedBIds.add(wB.id);
      }
      pairedWorkouts.push({ workoutA: wA, workoutB: wB });
    });

    workoutsB.forEach((wB: any) => {
      if (!matchedBIds.has(wB.id)) {
        pairedWorkouts.push({ workoutA: null, workoutB: wB });
      }
    });

    return pairedWorkouts.map(({ workoutA, workoutB }) => {
      const exercisesA = workoutA?.exercises || [];
      const exercisesB = workoutB?.exercises || [];

      // Get the union of all exercise names in order.
      const allExerciseNames: string[] = [];
      exercisesA.forEach((ex: any) => {
        if (!allExerciseNames.includes(ex.name)) {
          allExerciseNames.push(ex.name);
        }
      });
      exercisesB.forEach((ex: any) => {
        if (!allExerciseNames.includes(ex.name)) {
          allExerciseNames.push(ex.name);
        }
      });

      const exercises = allExerciseNames.map((exerciseName) => {
        const exA = exercisesA.find((e: any) => e.name === exerciseName);
        const exB = exercisesB.find((e: any) => e.name === exerciseName);

        const logA = exA
          ? logsA.find((l: any) => 
              l.exerciseId === exA.id || 
              (workoutsA.some((wa: any) => wa.id === l.workoutId && wa.exercises?.some((e: any) => e.id === l.exerciseId && e.name === exerciseName)))
            )
          : null;

        const logB = exB
          ? logsB.find((l: any) => 
              l.exerciseId === exB.id || 
              (workoutsB.some((wb: any) => wb.id === l.workoutId && wb.exercises?.some((e: any) => e.id === l.exerciseId && e.name === exerciseName)))
            )
          : null;

        const parseSetStr = (str: string | null | undefined) => str ? str.split(',').map(s => s.trim()).filter(s => s !== "") : [];

        const weightsA = parseSetStr(logA?.weight);
        const repsA = parseSetStr(logA?.reps);
        const weightsB = parseSetStr(logB?.weight);
        const repsB = parseSetStr(logB?.reps);

        const maxSets = Math.max(weightsA.length, weightsB.length, 1);

        const sets = Array.from({ length: maxSets }).map((_, i) => ({
          setNum: i + 1,
          weightA: weightsA[i] ? parseFloat(weightsA[i]) : null,
          repsA: repsA[i] || null,
          weightB: weightsB[i] ? parseFloat(weightsB[i]) : null,
          repsB: repsB[i] || null,
        }));

        return {
          name: exerciseName,
          sets
        };
      });

      return {
        workoutName: workoutA?.name || workoutB?.name || "",
        dayLabel: workoutA?.dayLabel || workoutB?.dayLabel || "",
        exercises: exercises.filter((e: any) => 
          e.sets.some((s: any) => s.weightA !== null || s.weightB !== null || s.repsA !== null || s.repsB !== null)
        )
      };
    }).filter((w: any) => w.exercises.length > 0);
  }, [workoutsA, workoutsB, logsA, logsB]);

  // Derived Dagboek averages
  const dagboekA = {
    gewicht: calculateAverage(progA?.days, "gewicht"),
    kcal: calculateAverage(progA?.days, "kcal"),
    slaap: calculateAverage(progA?.days, "slaap"),
    stress: calculateAverage(progA?.days, "stress"),
    energie: calculateAverage(progA?.days, "energieniveau"),
  };

  const dagboekB = {
    gewicht: calculateAverage(progB?.days, "gewicht"),
    kcal: calculateAverage(progB?.days, "kcal"),
    slaap: calculateAverage(progB?.days, "slaap"),
    stress: calculateAverage(progB?.days, "stress"),
    energie: calculateAverage(progB?.days, "energieniveau"),
  };

  const weekOptions = Array.from({ length: maxWeek }, (_, i) => i + 1);

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col">
      <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <Link href="/">
          <Button variant="ghost" size="icon" className="mr-2">
            <ChevronLeft className="h-6 w-6" />
          </Button>
        </Link>
        <div className="flex-1 flex items-center">
          <ArrowRightLeft className="w-5 h-5 text-primary mr-2" />
          <h1 className="text-xl font-bold text-foreground">Week Vergelijking</h1>
        </div>
      </header>

      {/* Main container allowing horizontal scroll on mobile, full width on desktop */}
      <div className="flex-1 w-full overflow-x-auto">
        <div className="w-full max-w-7xl mx-auto p-4 md:p-6 flex flex-col gap-6">
          
          {/* Header row: Selectors */}
          <div className="grid grid-cols-3 gap-4 sticky top-0 bg-background/95 pb-2 z-10 border-b border-border pt-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Week A (Oud)</Label>
              <Select value={weekA.toString()} onValueChange={v => setWeekA(parseInt(v))}>
                <SelectTrigger className="font-bold text-lg h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map(w => (
                    <SelectItem key={w} value={w.toString()}>Week {w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Week B (Nieuw)</Label>
              <Select value={weekB.toString()} onValueChange={v => setWeekB(parseInt(v))}>
                <SelectTrigger className="font-bold text-lg h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map(w => (
                    <SelectItem key={w} value={w.toString()}>Week {w}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col justify-end pb-3">
              <span className="text-lg font-black text-primary border-b-2 border-primary w-fit">Verschil (B - A)</span>
            </div>
          </div>

          {/* Section: Dagboek Averages */}
          <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="bg-secondary/40 px-4 py-3 border-b border-border">
              <h2 className="font-bold uppercase tracking-wider text-sm">Dagboek Gemiddelden</h2>
            </div>
            <div className="divide-y divide-border">
              
              <MetricRow 
                label="Lichaamsgewicht" 
                valA={dagboekA.gewicht} valB={dagboekB.gewicht} 
                unit="kg" reverseColors 
              />
              <MetricRow 
                label="Calorieën (Kcal)" 
                valA={dagboekA.kcal} valB={dagboekB.kcal} 
                unit="kcal" decimals={0} reverseColors 
              />
              <MetricRow 
                label="Slaap (uren)" 
                valA={dagboekA.slaap} valB={dagboekB.slaap} 
                unit="u" 
              />
              <MetricRow 
                label="Stressniveau (1-10)" 
                valA={dagboekA.stress} valB={dagboekB.stress} 
                reverseColors 
              />
              <MetricRow 
                label="Energieniveau (1-10)" 
                valA={dagboekA.energie} valB={dagboekB.energie} 
              />
              
            </div>
          </section>

          {/* Section: Trainingen per Workout */}
          {workoutsCompare.length === 0 ? (
             <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">Geen gelogde oefeningen gevonden voor deze weken.</div>
          ) : (
            workoutsCompare.map((workout: any, wIdx: number) => (
              <section key={wIdx} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden mb-6">
                <div className="bg-primary/10 px-4 py-3 border-b border-primary/20 flex justify-between items-center">
                  <h2 className="font-bold uppercase tracking-wider text-sm text-primary">{workout.dayLabel}: {workout.workoutName}</h2>
                </div>
                
                <div className="divide-y divide-border">
                  {workout.exercises.map((ex: any, eIdx: number) => (
                    <div key={eIdx} className="px-4 py-4 hover:bg-secondary/10 transition-colors">
                      <div className="text-sm font-bold mb-3 text-foreground">{ex.name}</div>
                      
                      <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center text-xs mb-1 px-1 text-muted-foreground font-semibold">
                        <div className="w-4 text-center">#</div>
                        <div className="truncate pr-1">Wk {weekA}</div>
                        <div className="truncate pr-1">Wk {weekB}</div>
                        <div className="text-right">Diff</div>
                      </div>

                      <div className="space-y-0.5">
                        {ex.sets.map((set: any, sIdx: number) => (
                          <div key={sIdx} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center py-1.5 border-b border-border/40 last:border-0 text-sm">
                            {/* Set # */}
                            <div className="w-4 text-center font-bold text-muted-foreground">{sIdx + 1}</div>
                            
                            {/* Week A */}
                            <div className="grid grid-cols-[3.25rem_0.75rem_1.75rem] items-center text-sm">
                              <span className="font-semibold tabular-nums text-right">{set.weightA !== null ? set.weightA : "-"}</span>
                              <span className="text-muted-foreground text-xs text-center">×</span>
                              <span className="font-semibold tabular-nums text-left">{set.repsA || "-"}</span>
                            </div>
                            
                            {/* Week B */}
                            <div className="grid grid-cols-[3.25rem_0.75rem_1.75rem] items-center text-sm">
                              <span className="font-semibold tabular-nums text-right">{set.weightB !== null ? set.weightB : "-"}</span>
                              <span className="text-muted-foreground text-xs text-center">×</span>
                              <span className="font-semibold tabular-nums text-left">{set.repsB || "-"}</span>
                            </div>
                            
                            {/* Diff */}
                            <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-1 sm:gap-2 text-xs">
                              <DiffText a={set.weightA} b={set.weightB} unit="kg" decimals={1} />
                              <DiffText 
                                a={set.repsA ? parseInt(set.repsA) : null} 
                                b={set.repsB ? parseInt(set.repsB) : null} 
                                unit="r" 
                                decimals={0} 
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}

        </div>
      </div>
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode, className?: string }) {
  return <label className={className}>{children}</label>;
}

function MetricRow({ label, valA, valB, unit = "", decimals = 1, reverseColors = false }: any) {
  return (
    <div className="grid grid-cols-3 gap-4 px-4 py-3 hover:bg-secondary/20 transition-colors items-center">
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-1">{label}</div>
        <div className="text-sm font-bold">{valA !== null ? `${valA.toFixed(decimals)}${unit}` : <span className="text-muted-foreground font-normal">—</span>}</div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-1 invisible">{label}</div>
        <div className="text-sm font-bold">{valB !== null ? `${valB.toFixed(decimals)}${unit}` : <span className="text-muted-foreground font-normal">—</span>}</div>
      </div>
      <div>
        <DiffText a={valA} b={valB} unit={unit} decimals={decimals} reverseColors={reverseColors} />
      </div>
    </div>
  );
}
