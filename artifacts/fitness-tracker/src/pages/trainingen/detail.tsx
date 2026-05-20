import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { 
  useGetWorkout, 
  getGetWorkoutQueryKey,
  useGetExerciseLogs,
  useCreateExerciseLog,
  useUpdateExerciseLog,
  getGetExerciseLogsQueryKey,
  getGetWeekWorkoutStatusQueryKey,
  getGetWorkoutsForWeekQueryKey,
  ExerciseLog
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, PlayCircle, ExternalLink, Check, ArrowRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

export default function TrainingDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const workoutId = params.workoutId || "";
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const { data: workout, isLoading } = useGetWorkout(workoutId, {
    query: { queryKey: getGetWorkoutQueryKey(workoutId), enabled: !!workoutId }
  });

  const exercises = workout?.exercises || [];
  const exercise = exercises[currentStep];

  const { data: logs } = useGetExerciseLogs(
    { workoutId, weekNumber: workout?.weekNumber },
    { query: { queryKey: getGetExerciseLogsQueryKey({ workoutId, weekNumber: workout?.weekNumber }), enabled: !!workoutId && !!workout?.weekNumber } }
  );

  const createLog = useCreateExerciseLog();
  const updateLog = useUpdateExerciseLog();

  const [weights, setWeights] = useState<string[]>([]);
  const [repsList, setRepsList] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const currentLog = logs?.find(l => l.exerciseId === exercise?.id);

  useEffect(() => {
    const numSets = exercise?.sets || 1;
    if (currentLog) {
      setWeights(currentLog.weight ? currentLog.weight.toString().split(',').map(s => s.trim()) : Array(numSets).fill(""));
      setRepsList(currentLog.reps ? currentLog.reps.split(',').map(s => s.trim()) : Array(numSets).fill(""));
      setNotes(currentLog.notes || "");
    } else {
      const prevWeights = exercise?.previousWeekWeight ? exercise.previousWeekWeight.toString().split(',').map(s => s.trim()) : [];
      const prevReps = exercise?.previousWeekReps ? exercise.previousWeekReps.toString().split(',').map(s => s.trim()) : [];
      setWeights(Array(numSets).fill("").map((_, i) => prevWeights[i] || exercise?.prescribedWeight?.toString().split(',')[i]?.trim() || ""));
      setRepsList(Array(numSets).fill("").map((_, i) => prevReps[i] || exercise?.reps?.split(',')[i]?.trim() || ""));
      setNotes("");
    }
  }, [currentLog, exercise]);

  if (isLoading || !workout) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div></div>;
  }

  if (isFinished) {
    return (
      <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center">
        <div className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <Trophy className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Lekker bezig!</h1>
        <p className="text-muted-foreground mb-8">Je hebt de {workout.name} workout succesvol afgerond.</p>
        <Button onClick={() => setLocation("/trainingen")} className="w-full py-6 text-lg rounded-xl font-bold">
          Terug naar overzicht
        </Button>
      </div>
    );
  }

  if (!exercise) return null;

  const handleNext = () => {
    const finalWeights = weights.map(w => w.trim() === "" ? "0" : w).join(", ");
    const finalReps = repsList.map(r => r.trim() === "" ? "0" : r).join(", ");

    const data = {
      exerciseId: exercise.id,
      workoutId: workout.id,
      weekNumber: workout.weekNumber,
      sets: exercise.sets,
      reps: finalReps,
      weight: finalWeights,
      notes: notes || null
    };

    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getGetWorkoutQueryKey(workoutId) });
      queryClient.invalidateQueries({ queryKey: getGetWeekWorkoutStatusQueryKey(workout.weekNumber) });
      queryClient.invalidateQueries({ queryKey: getGetWorkoutsForWeekQueryKey(workout.weekNumber) });
      
      if (currentStep < exercises.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        setIsFinished(true);
      }
    };

    if (currentLog) {
      updateLog.mutate({ id: currentLog.id, data }, { onSuccess });
    } else {
      createLog.mutate({ data }, { onSuccess });
    }
  };

  const progress = ((currentStep) / exercises.length) * 100;
  
  // Use generated images based on typical exercises
  const getExerciseImage = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("squat")) return "/images/squat.png";
    if (lowerName.includes("bench") || lowerName.includes("druk")) return "/images/bench-press.png";
    if (lowerName.includes("deadlift")) return "/images/deadlift.png";
    return "/images/generic-muscles.png"; // Fallback voor alle oefeningen
  };

  const imageUrl = exercise.imageUrl || getExerciseImage(exercise.name);

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col max-w-md mx-auto">
      <header className="w-full p-4 flex items-center border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/trainingen")} className="mr-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{workout.name}</div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-foreground">Oefening {currentStep + 1} van {exercises.length}</h1>
          </div>
        </div>
      </header>

      <Progress value={progress} className="h-1 rounded-none bg-secondary" />

      <main className="flex-1 p-6 flex flex-col overflow-y-auto pb-24">
        
        {imageUrl ? (
          <div className="w-full aspect-video bg-muted rounded-xl mb-6 overflow-hidden border border-border relative">
            <img src={imageUrl} alt={exercise.name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-full aspect-video bg-secondary rounded-xl mb-6 flex items-center justify-center border border-border">
            <PlayCircle className="w-12 h-12 text-muted-foreground opacity-50" />
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-1 flex items-start justify-between">
            {exercise.name}
            {exercise.videoUrl && (
              <a href={exercise.videoUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
                <ExternalLink className="w-5 h-5 mt-1" />
              </a>
            )}
          </h2>
          <div className="text-lg text-primary font-bold">
            {exercise.sets} sets × {exercise.reps} reps
          </div>
        </div>



        <div className="flex flex-col gap-5">
          {Array.from({ length: exercise.sets || 1 }).map((_, idx) => (
            <div key={idx} className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Set {idx + 1} - Gewicht (kg)</Label>
                <Input 
                  type="number" 
                  inputMode="decimal"
                  value={weights[idx] || ""} 
                  onChange={e => {
                    const newWeights = [...weights];
                    newWeights[idx] = e.target.value;
                    setWeights(newWeights);
                  }} 
                  className="h-14 text-xl font-bold px-4 bg-card"
                  placeholder={
                    exercise.previousWeekWeight?.toString().split(',')[idx]?.trim() || 
                    exercise.prescribedWeight?.toString().split(',')[idx]?.trim() || 
                    "0"
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Set {idx + 1} - Reps</Label>
                <Input 
                  type="number"
                  inputMode="decimal"
                  value={repsList[idx] || ""} 
                  onChange={e => {
                    const newReps = [...repsList];
                    newReps[idx] = e.target.value;
                    setRepsList(newReps);
                  }} 
                  className="h-14 text-xl font-bold px-4 bg-card"
                  placeholder={
                    exercise.previousWeekReps?.toString().split(',')[idx]?.trim() || 
                    exercise.reps?.toString().split(',')[idx]?.trim() || 
                    "0"
                  }
                />
              </div>
            </div>
          ))}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Notities (optioneel)</Label>
            <Textarea 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              className="resize-none bg-card"
              placeholder={exercise.notes || "Bijv: voelde zwaar, techniek verbeteren..."}
            />
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full p-4 bg-background border-t border-border z-20 flex justify-center">
        <div className="w-full max-w-md">
          <Button 
            onClick={handleNext} 
            className="w-full h-14 rounded-xl text-lg font-bold shadow-lg"
            disabled={createLog.isPending || updateLog.isPending}
          >
            {createLog.isPending || updateLog.isPending ? (
              <div className="w-6 h-6 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin mr-2"></div>
            ) : currentStep === exercises.length - 1 ? (
              <>Afronden <Check className="ml-2 w-5 h-5" /></>
            ) : (
              <>Volgende oefening <ArrowRight className="ml-2 w-5 h-5" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
