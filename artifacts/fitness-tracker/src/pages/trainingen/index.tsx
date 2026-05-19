import { useWeek } from "@/components/week-context";
import { useGetWorkoutsForWeek, useGetWeekWorkoutStatus, getGetWorkoutsForWeekQueryKey, getGetWeekWorkoutStatusQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, CheckCircle2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekSelector } from "@/components/week-selector";

export default function TrainingList() {
  const { selectedWeek } = useWeek();
  const [, setLocation] = useLocation();

  const { data: workouts, isLoading } = useGetWorkoutsForWeek(selectedWeek || 0, {
    query: { queryKey: getGetWorkoutsForWeekQueryKey(selectedWeek || 0), enabled: !!selectedWeek }
  });

  const { data: status } = useGetWeekWorkoutStatus(selectedWeek || 0, {
    query: { queryKey: getGetWeekWorkoutStatusQueryKey(selectedWeek || 0), enabled: !!selectedWeek }
  });

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center max-w-md mx-auto">
      <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="mr-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold text-foreground flex-1">Trainingen</h1>
        <WeekSelector />
      </header>

      <div className="w-full p-6 flex flex-col gap-4">
        {isLoading && (
          <>
            <Skeleton className="w-full h-32 rounded-xl" />
            <Skeleton className="w-full h-32 rounded-xl" />
            <Skeleton className="w-full h-32 rounded-xl" />
            <Skeleton className="w-full h-32 rounded-xl" />
          </>
        )}

        {workouts && workouts.map(workout => {
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
