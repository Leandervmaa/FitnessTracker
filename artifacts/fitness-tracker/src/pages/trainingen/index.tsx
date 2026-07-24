import { useWeek } from "@/components/week-context";
import { useGetWorkoutsForWeek, useGetWeekWorkoutStatus, getGetWorkoutsForWeekQueryKey, getGetWeekWorkoutStatusQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekSelector } from "@/components/week-selector";
import { apiFetch } from "@/lib/api";

type PlannedWeek = {
  workouts: Array<{
    id: string;
    name: string;
    dayLabel: string;
    exerciseCount: number;
    completedCount: number;
    plannedSetCount?: number;
    completedSetCount?: number;
  }>;
};

export default function TrainingList() {
  const { selectedWeek } = useWeek();

  const { data: workouts, isLoading } = useGetWorkoutsForWeek(selectedWeek || 0, {
    query: { queryKey: getGetWorkoutsForWeekQueryKey(selectedWeek || 0), enabled: !!selectedWeek }
  });

  const { data: status } = useGetWeekWorkoutStatus(selectedWeek || 0, {
    query: { queryKey: getGetWeekWorkoutStatusQueryKey(selectedWeek || 0), enabled: !!selectedWeek }
  });

  const { data: plannedWeek, isLoading: isPlanningLoading } = useQuery<PlannedWeek>({
    queryKey: ["planned-week", selectedWeek],
    enabled: !!selectedWeek,
    queryFn: async () => {
      const res = await apiFetch(`/api/plans/week/${selectedWeek}`);
      if (!res.ok) throw new Error("Weekplanning ophalen mislukt");
      return res.json();
    },
  });

  const visibleWorkouts = plannedWeek?.workouts?.length ? plannedWeek.workouts : workouts ?? [];
  const loading = isLoading || isPlanningLoading;

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center max-w-md mx-auto">
      <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-xl font-bold text-foreground flex-1">Trainingen</h1>
        <WeekSelector />
      </header>

      <div className="w-full p-6 flex flex-col gap-4 client-page-end-space">
        {loading && (
          <>
            <Skeleton className="w-full h-32 rounded-xl" />
            <Skeleton className="w-full h-32 rounded-xl" />
            <Skeleton className="w-full h-32 rounded-xl" />
            <Skeleton className="w-full h-32 rounded-xl" />
          </>
        )}

        {!loading && visibleWorkouts.length === 0 && (
          <div className="w-full border border-dashed border-border rounded-xl p-8 text-center bg-card">
            <PlayCircle className="h-9 w-9 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-bold text-card-foreground">Geen training beschikbaar</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Je trainer heeft voor deze week nog geen training klaargezet.
            </p>
          </div>
        )}

        {visibleWorkouts.map(workout => {
          const progress = workout.exerciseCount > 0 
            ? Math.round((workout.completedCount / workout.exerciseCount) * 100) 
            : 0;
          const isDone = workout.exerciseCount > 0 && workout.completedCount === workout.exerciseCount;

          return (
            <Link key={workout.id} href={`/trainingen/${workout.id}`}>
              <div className={`w-full border rounded-xl p-5 flex flex-col gap-4 transition-all cursor-pointer relative overflow-hidden ${isDone ? 'bg-primary/5 border-primary/20' : 'bg-card border-border hover-elevate'}`}>
                {isDone && (
                  <div className="absolute top-0 right-0 w-16 h-16 flex items-start justify-end p-2 pointer-events-none">
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  </div>
                )}
                
                <div className="flex justify-between items-start pr-6">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1 block">{workout.dayLabel}</span>
                    <h2 className="text-lg font-bold text-card-foreground">{workout.name}</h2>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{workout.completedCount} van {workout.exerciseCount} oefeningen</span>
                    <span className="font-semibold text-foreground">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
