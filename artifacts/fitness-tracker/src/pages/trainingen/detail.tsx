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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, PlayCircle, ExternalLink, Check, ArrowRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

type PlannedSetLog = {
  id: number;
  setNumber: number;
  reps: number | null;
  weight: string | null;
  rpe: string | null;
  notes: string | null;
};

type ExerciseLike = {
  id: string;
  name: string;
  sets?: number | null;
  reps?: string | null;
  repRange?: string | null;
  targetRpe?: string | null;
  prescribedWeight?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  previousWeekReps?: string | null;
  previousWeekWeight?: string | null;
  currentSetLogs?: PlannedSetLog[];
  previousSetLogs?: PlannedSetLog[];
};

type WorkoutLike = {
  id: string;
  weekNumber: number;
  name: string;
  dayLabel: string;
  exercises: ExerciseLike[];
};

export default function TrainingDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const workoutId = params.workoutId || "";
  const isPlannedWorkout = workoutId.startsWith("pw_");
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  const { data: oldWorkout, isLoading: oldWorkoutLoading } = useGetWorkout(workoutId, {
    query: { queryKey: getGetWorkoutQueryKey(workoutId), enabled: !!workoutId && !isPlannedWorkout }
  });

  const { data: plannedWorkout, isLoading: plannedWorkoutLoading } = useQuery<WorkoutLike>({
    queryKey: ["planned-workout", workoutId],
    enabled: !!workoutId && isPlannedWorkout,
    queryFn: async () => {
      const res = await apiFetch(`/api/plans/workouts/${workoutId}`);
      if (!res.ok) throw new Error("Training ophalen mislukt");
      return res.json();
    },
  });

  const workout = (isPlannedWorkout ? plannedWorkout : oldWorkout) as WorkoutLike | undefined;
  const isLoading = isPlannedWorkout ? plannedWorkoutLoading : oldWorkoutLoading;
  const exercises = workout?.exercises || [];
  const exercise = exercises[currentStep];

  const { data: logs } = useGetExerciseLogs(
    { workoutId, weekNumber: workout?.weekNumber },
    { query: { queryKey: getGetExerciseLogsQueryKey({ workoutId, weekNumber: workout?.weekNumber }), enabled: !!workoutId && !!workout?.weekNumber && !isPlannedWorkout } }
  );

  const createLog = useCreateExerciseLog();
  const updateLog = useUpdateExerciseLog();

  const [weights, setWeights] = useState<string[]>([]);
  const [repsList, setRepsList] = useState<string[]>([]);
  const [rpeList, setRpeList] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const currentLog = logs?.find(l => l.exerciseId === exercise?.id);

  const savePlannedSets = useMutation({
    mutationFn: async (input: { exercise: ExerciseLike; weights: string[]; repsList: string[]; rpeList: string[]; notes: string }) => {
      const setCount = input.exercise.sets || 1;
      for (let index = 0; index < setCount; index += 1) {
        const res = await apiFetch("/api/plans/set-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plannedExerciseId: input.exercise.id,
            setNumber: index + 1,
            weight: input.weights[index] || null,
            reps: input.repsList[index] || null,
            rpe: input.rpeList[index] || null,
            notes: input.notes || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Set opslaan mislukt");
        }
      }
    },
  });

  useEffect(() => {
    const numSets = exercise?.sets || 1;
    if (isPlannedWorkout && exercise) {
      const currentLogs = exercise.currentSetLogs || [];
      setWeights(Array(numSets).fill("").map((_, i) => currentLogs.find((log) => log.setNumber === i + 1)?.weight?.toString() || ""));
      setRepsList(Array(numSets).fill("").map((_, i) => currentLogs.find((log) => log.setNumber === i + 1)?.reps?.toString() || ""));
      setRpeList(Array(numSets).fill("").map((_, i) => currentLogs.find((log) => log.setNumber === i + 1)?.rpe?.toString() || ""));
      setNotes(currentLogs.find((log) => log.notes)?.notes || "");
    } else if (currentLog) {
      setWeights(currentLog.weight ? currentLog.weight.toString().split(',').map(s => s.trim()) : Array(numSets).fill(""));
      setRepsList(currentLog.reps ? currentLog.reps.split(',').map(s => s.trim()) : Array(numSets).fill(""));
      setRpeList(Array(numSets).fill(""));
      setNotes(currentLog.notes || "");
    } else {
      const prevWeights = exercise?.previousWeekWeight ? exercise.previousWeekWeight.toString().split(',').map(s => s.trim()) : [];
      const prevReps = exercise?.previousWeekReps ? exercise.previousWeekReps.toString().split(',').map(s => s.trim()) : [];
      setWeights(Array(numSets).fill("").map((_, i) => prevWeights[i] || exercise?.prescribedWeight?.toString().split(',')[i]?.trim() || ""));
      setRepsList(Array(numSets).fill("").map((_, i) => prevReps[i] || ""));
      setRpeList(Array(numSets).fill(""));
      setNotes("");
    }
  }, [currentLog, exercise, isPlannedWorkout]);

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
    if (isPlannedWorkout) {
      savePlannedSets.mutate(
        { exercise, weights, repsList, rpeList, notes },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["planned-workout", workoutId] });
            queryClient.invalidateQueries({ queryKey: ["planned-week", workout.weekNumber] });

            if (currentStep < exercises.length - 1) {
              setCurrentStep(prev => prev + 1);
            } else {
              setIsFinished(true);
            }
          },
        },
      );
      return;
    }

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
  const repLabel = exercise.repRange || exercise.reps;
  
  // Client-side exercise → image mapper (mirrors server-side getExerciseImageUrl in excelParser)
  const getExerciseImage = (name: string) => {
    const n = name.toLowerCase();

    // Specific high-res uploaded images
    if (n.includes("biceps cable curl") || (n.includes("biceps") && n.includes("cable") && n.includes("curl"))) return "/images/biceps_cable_curl.jpg";
    if (n.includes("anterior delt") || (n.includes("incline") && n.includes("db") && n.includes("press"))) return "/images/anterior_delt_incline_db_press.jpg";
    if (n.includes("chest supported pulldown") || n.includes("chest-supported pulldown") || (n.includes("chest") && n.includes("pulldown"))) return "/images/chest_supported_pulldown.jpg";
    if (n.includes("costal pec fly") || (n.includes("pec") && n.includes("fly")) || (n.includes("cable") && n.includes("fly"))) return "/images/costal_pec_fly.jpg";
    if (n.includes("cable row") || (n.includes("cable") && n.includes("row"))) return "/images/cable_row.jpg";

    // Benen & Billen
    if (n.includes("front squat")) return "/images/frontsquat_muscles.png";
    if (n.includes("squat")) return "/images/squat_muscles.png";
    if (n.includes("roemeense") || n.includes("rdl") || n.includes("romanian")) return "/images/rdl_muscles.png";
    if (n.includes("sumo deadlift") || n.includes("deadlift")) return "/images/rdl_muscles.png";
    if (n.includes("leg press")) return "/images/legpress_muscles.png";
    if (n.includes("leg curl")) return "/images/legcurl_muscles.png";
    if (n.includes("hip thrust")) return "/images/hipthrust_muscles.png";

    // Borst & Schouders & Triceps
    if (n.includes("incline") && n.includes("press")) return "/images/inclinepress_muscles.png";
    if (n.includes("bench press") || n.includes("druk")) return "/images/benchpress_muscles.png";
    if (n.includes("push press")) return "/images/pushpress_muscles.png";
    if (n.includes("schouderpers") || n.includes("shoulder press") || n.includes("overhead press") || n.includes("ohp")) return "/images/schouderpers_muscles.png";
    if (n.includes("lateral raise") || n.includes("zijwaartse hef")) return "/images/lateralraise_muscles.png";
    if (n.includes("dip")) return "/images/tricepdip_muscles.png";

    // Rug & Biceps
    if (n.includes("pull-up") || n.includes("pullup") || n.includes("chin-up") || (n.includes("pulldown") && !n.includes("chest"))) return "/images/pullup_muscles.png";
    if (n.includes("barbell row") || n.includes("bent-over") || (n.includes("row") && !n.includes("cable"))) return "/images/barbellrow_muscles.png";
    if (n.includes("face pull")) return "/images/facepull_muscles.png";
    if (n.includes("bicep curl") || n.includes("biceps curl") || (n.includes("curl") && !n.includes("leg"))) return "/images/bicepcurl_muscles.png";

    // Generic fallback
    return "/images/generic-muscles.png";
  };

  // API imageUrl (server-side mapped) has priority; client-side is safety fallback
  const imageUrl = exercise.imageUrl || getExerciseImage(exercise.name);

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col max-w-md mx-auto">
      <header className="w-full p-4 flex items-center border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/trainingen")} className="mr-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Oefening {currentStep + 1} van {exercises.length}
          </div>
          <h2 className="text-2xl font-black text-foreground">
            {exercise.name} {repLabel ? <span className="text-muted-foreground text-lg font-bold">({repLabel})</span> : ""}
          </h2>
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
            {exercise.sets} sets × {repLabel || "-"} reps{exercise.targetRpe ? ` @ RPE ${exercise.targetRpe}` : ""}
          </div>
        </div>



        <div className="flex flex-col gap-5">
          {Array.from({ length: exercise.sets || 1 }).map((_, idx) => (
            <div key={idx} className={`grid gap-3 ${isPlannedWorkout ? "grid-cols-3" : "grid-cols-2"}`}>
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
                    exercise.previousSetLogs?.find((log) => log.setNumber === idx + 1)?.weight?.toString() ||
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
                    exercise.previousSetLogs?.find((log) => log.setNumber === idx + 1)?.reps?.toString() ||
                    exercise.previousWeekReps?.toString().split(',')[idx]?.trim() || 
                    "0"
                  }
                />
              </div>
              {isPlannedWorkout && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Set {idx + 1} - RPE</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={rpeList[idx] || ""}
                    onChange={e => {
                      const newRpe = [...rpeList];
                      newRpe[idx] = e.target.value;
                      setRpeList(newRpe);
                    }}
                    className="h-14 text-xl font-bold px-4 bg-card"
                    placeholder={exercise.previousSetLogs?.find((log) => log.setNumber === idx + 1)?.rpe?.toString() || exercise.targetRpe?.toString() || "0"}
                  />
                </div>
              )}
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
            disabled={createLog.isPending || updateLog.isPending || savePlannedSets.isPending}
          >
            {createLog.isPending || updateLog.isPending || savePlannedSets.isPending ? (
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
