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
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  PlayCircle,
  ExternalLink,
  Check,
  ArrowRight,
  Trophy,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type LibraryExercise = {
  id: number;
  name: string;
  category?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNewExercise(exercise: ExerciseLike): boolean {
  // Mark as NEW if there are no previous set logs and the exercise has prescribed data
  const hasPrevLogs =
    exercise.previousSetLogs && exercise.previousSetLogs.length > 0;
  const hasPrescription =
    !!exercise.sets || !!exercise.repRange || !!exercise.reps;
  return !hasPrevLogs && hasPrescription;
}

// Client-side exercise → image mapper (mirrors server-side getExerciseImageUrl in excelParser)
function getExerciseImage(name: string): string {
  const n = name.toLowerCase();

  if (
    n.includes("biceps cable curl") ||
    (n.includes("biceps") && n.includes("cable") && n.includes("curl"))
  )
    return "/images/biceps_cable_curl.jpg";
  if (
    n.includes("anterior delt") ||
    (n.includes("incline") && n.includes("db") && n.includes("press"))
  )
    return "/images/anterior_delt_incline_db_press.jpg";
  if (
    n.includes("chest supported pulldown") ||
    n.includes("chest-supported pulldown") ||
    (n.includes("chest") && n.includes("pulldown"))
  )
    return "/images/chest_supported_pulldown.jpg";
  if (
    n.includes("costal pec fly") ||
    (n.includes("pec") && n.includes("fly")) ||
    (n.includes("cable") && n.includes("fly"))
  )
    return "/images/costal_pec_fly.jpg";
  if (n.includes("cable row") || (n.includes("cable") && n.includes("row")))
    return "/images/cable_row.jpg";

  // Legs & Glutes
  if (n.includes("front squat")) return "/images/frontsquat_muscles.png";
  if (n.includes("squat")) return "/images/squat_muscles.png";
  if (
    n.includes("roemeense") ||
    n.includes("rdl") ||
    n.includes("romanian")
  )
    return "/images/rdl_muscles.png";
  if (n.includes("sumo deadlift") || n.includes("deadlift"))
    return "/images/rdl_muscles.png";
  if (n.includes("leg press")) return "/images/legpress_muscles.png";
  if (n.includes("leg curl")) return "/images/legcurl_muscles.png";
  if (n.includes("hip thrust")) return "/images/hipthrust_muscles.png";

  // Chest, Shoulders, Triceps
  if (n.includes("incline") && n.includes("press"))
    return "/images/inclinepress_muscles.png";
  if (n.includes("bench press") || n.includes("druk"))
    return "/images/benchpress_muscles.png";
  if (n.includes("push press")) return "/images/pushpress_muscles.png";
  if (
    n.includes("schouderpers") ||
    n.includes("shoulder press") ||
    n.includes("overhead press") ||
    n.includes("ohp")
  )
    return "/images/schouderpers_muscles.png";
  if (n.includes("lateral raise") || n.includes("zijwaartse hef"))
    return "/images/lateralraise_muscles.png";
  if (n.includes("dip")) return "/images/tricepdip_muscles.png";

  // Back & Biceps
  if (
    n.includes("pull-up") ||
    n.includes("pullup") ||
    n.includes("chin-up") ||
    (n.includes("pulldown") && !n.includes("chest"))
  )
    return "/images/pullup_muscles.png";
  if (
    n.includes("barbell row") ||
    n.includes("bent-over") ||
    (n.includes("row") && !n.includes("cable"))
  )
    return "/images/barbellrow_muscles.png";
  if (n.includes("face pull")) return "/images/facepull_muscles.png";
  if (
    n.includes("bicep curl") ||
    n.includes("biceps curl") ||
    (n.includes("curl") && !n.includes("leg"))
  )
    return "/images/bicepcurl_muscles.png";

  return "/images/generic-muscles.png";
}

// ─── Stopwatch Modal ──────────────────────────────────────────────────────────

function StopwatchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [elapsed, setElapsed] = useState(0); // seconds
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xs mx-auto text-center">
        <DialogHeader>
          <DialogTitle className="text-center">Stopwatch</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="text-6xl font-mono font-bold text-foreground">
            {minutes}:{seconds}
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setRunning((r) => !r)}
              className="w-28"
            >
              {running ? "Pauzeer" : "Start"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setRunning(false);
                setElapsed(0);
              }}
              className="w-28"
            >
              Reset
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── "Deze oefening niet gedaan" Dialog ───────────────────────────────────────

function SkipExerciseDialog({
  open,
  onClose,
  exerciseId,
  onSkip,
  onReplaced,
}: {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  onSkip: () => void;
  onReplaced: () => void;
}) {
  const [mode, setMode] = useState<"menu" | "replace">("menu");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<LibraryExercise | null>(null);
  const [replacing, setReplacing] = useState(false);

  const { data: libraryExercises, isLoading: libraryLoading } = useQuery<
    LibraryExercise[]
  >({
    queryKey: ["library-exercises"],
    enabled: open && mode === "replace",
    queryFn: async () => {
      const res = await apiFetch("/api/library/exercises");
      if (!res.ok) throw new Error("Ophalen mislukt");
      return res.json();
    },
  });

  const filtered = (libraryExercises || []).filter((ex) =>
    ex.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleReplace = async () => {
    if (!selected) return;
    setReplacing(true);
    try {
      const res = await apiFetch(
        `/api/plans/exercises/${exerciseId}/replace`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ replacementLibraryId: selected.id }),
        }
      );
      if (!res.ok) throw new Error("Vervangen mislukt");
      onReplaced();
      onClose();
    } catch {
      // silently ignore, stay open
    } finally {
      setReplacing(false);
    }
  };

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setMode("menu");
      setSearch("");
      setSelected(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle>Oefening niet gedaan</DialogTitle>
        </DialogHeader>

        {mode === "menu" && (
          <div className="flex flex-col gap-3 py-2">
            <Button
              variant="outline"
              className="h-14 text-base justify-start px-4"
              onClick={() => setMode("replace")}
            >
              Andere oefening gedaan
            </Button>
            <Button
              variant="ghost"
              className="h-14 text-base justify-start px-4 text-muted-foreground"
              onClick={() => {
                onSkip();
                onClose();
              }}
            >
              Oefening overgeslagen
            </Button>
          </div>
        )}

        {mode === "replace" && (
          <div className="flex flex-col gap-3 py-2">
            <Input
              placeholder="Zoek oefening..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="overflow-y-auto max-h-60 flex flex-col gap-1 border border-border rounded-lg p-1">
              {libraryLoading && (
                <div className="text-sm text-muted-foreground px-3 py-4 text-center">
                  Laden...
                </div>
              )}
              {!libraryLoading && filtered.length === 0 && (
                <div className="text-sm text-muted-foreground px-3 py-4 text-center">
                  Geen oefeningen gevonden
                </div>
              )}
              {filtered.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selected?.id === ex.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => setSelected(ex)}
                >
                  {ex.name}
                  {ex.category && (
                    <span className="ml-2 text-xs opacity-60">
                      {ex.category}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setMode("menu")}
              >
                Terug
              </Button>
              <Button
                className="flex-1"
                disabled={!selected || replacing}
                onClick={handleReplace}
              >
                {replacing ? "Bezig..." : "Bevestigen"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Overview Screen ──────────────────────────────────────────────────────────

function WorkoutOverview({
  workout,
  onStart,
  onSelectExercise,
  onBack,
}: {
  workout: WorkoutLike;
  onStart: () => void;
  onSelectExercise: (index: number) => void;
  onBack: () => void;
}) {
  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col max-w-md mx-auto">
      <header className="w-full p-4 flex items-center border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="mr-2 -ml-1 shrink-0"
          aria-label="Terug"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
            {workout.dayLabel}
          </div>
          <h1 className="text-xl font-black text-foreground truncate">{workout.name}</h1>
        </div>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-2.5 overflow-y-auto pb-36">
        <p className="text-sm text-muted-foreground mb-1">
          {workout.exercises.length} oefeningen — tik om direct te beginnen
        </p>
        {workout.exercises.map((ex, idx) => {
          const repLabel = ex.repRange || ex.reps;
          const newEx = isNewExercise(ex);
          const hasLogs = ex.currentSetLogs && ex.currentSetLogs.length > 0;
          return (
            <button
              key={ex.id}
              type="button"
              onClick={() => onSelectExercise(idx)}
              className="w-full text-left bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98] transition-all"
            >
              <span
                className={`
                  h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                  ${hasLogs
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                    : "bg-muted text-muted-foreground"
                  }
                `}
              >
                {hasLogs ? <Check className="h-4 w-4" /> : idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground truncate">{ex.name}</span>
                  {newEx && (
                    <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0.5 shrink-0">Nieuw</Badge>
                  )}
                </div>
                <div className="text-sm text-primary font-semibold">
                  {ex.sets} sets × {repLabel || "–"} reps
                  {ex.targetRpe ? ` @ RPE ${ex.targetRpe}` : ""}
                </div>
                {ex.notes && (
                  <div className="text-xs text-muted-foreground italic truncate">{ex.notes}</div>
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </main>

      <div className="fixed bottom-16 left-0 w-full p-4 bg-background border-t border-border z-20 flex justify-center">
        <div className="w-full max-w-md">
          <Button
            onClick={onStart}
            className="w-full h-14 rounded-xl text-lg font-bold shadow-lg"
          >
            Start Workout <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TrainingDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const workoutId = params.workoutId || "";
  const isPlannedWorkout = workoutId.startsWith("pw_");

  // Screen state
  const [overview, setOverview] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  // When true, "Next" goes back to the overview instead of auto-advancing
  const returnToOverviewAfterSave = true;

  // Modal/dialog state
  const [stopwatchOpen, setStopwatchOpen] = useState(false);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);

  const { data: oldWorkout, isLoading: oldWorkoutLoading } = useGetWorkout(
    workoutId,
    {
      query: {
        queryKey: getGetWorkoutQueryKey(workoutId),
        enabled: !!workoutId && !isPlannedWorkout,
      },
    }
  );

  const { data: plannedWorkout, isLoading: plannedWorkoutLoading } =
    useQuery<WorkoutLike>({
      queryKey: ["planned-workout", workoutId],
      enabled: !!workoutId && isPlannedWorkout,
      queryFn: async () => {
        const res = await apiFetch(`/api/plans/workouts/${workoutId}`);
        if (!res.ok) throw new Error("Training ophalen mislukt");
        return res.json();
      },
    });

  const workout = (
    isPlannedWorkout ? plannedWorkout : oldWorkout
  ) as WorkoutLike | undefined;
  const isLoading = isPlannedWorkout ? plannedWorkoutLoading : oldWorkoutLoading;
  const exercises = workout?.exercises || [];
  const exercise = exercises[currentStep];

  const { data: logs } = useGetExerciseLogs(
    { workoutId, weekNumber: workout?.weekNumber },
    {
      query: {
        queryKey: getGetExerciseLogsQueryKey({
          workoutId,
          weekNumber: workout?.weekNumber,
        }),
        enabled: !!workoutId && !!workout?.weekNumber && !isPlannedWorkout,
      },
    }
  );

  const createLog = useCreateExerciseLog();
  const updateLog = useUpdateExerciseLog();

  const [weights, setWeights] = useState<string[]>([]);
  const [repsList, setRepsList] = useState<string[]>([]);
  const [rpeList, setRpeList] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const currentLog = logs?.find((l) => l.exerciseId === exercise?.id);

  const savePlannedSets = useMutation({
    mutationFn: async (input: {
      exercise: ExerciseLike;
      weights: string[];
      repsList: string[];
      rpeList: string[];
      notes: string;
    }) => {
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
            rpe: input.exercise.targetRpe || null,
            notes: input.notes || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || "Set opslaan mislukt");
        }
      }
    },
  });

  useEffect(() => {
    const numSets = exercise?.sets || 1;
    if (isPlannedWorkout && exercise) {
      const currentLogs = exercise.currentSetLogs || [];
      setWeights(
        Array(numSets)
          .fill("")
          .map(
            (_, i) =>
              currentLogs.find((log) => log.setNumber === i + 1)?.weight?.toString() || ""
          )
      );
      setRepsList(
        Array(numSets)
          .fill("")
          .map(
            (_, i) =>
              currentLogs.find((log) => log.setNumber === i + 1)?.reps?.toString() || ""
          )
      );
      setRpeList(
        Array(numSets)
          .fill("")
          .map(
            (_, i) =>
              currentLogs.find((log) => log.setNumber === i + 1)?.rpe?.toString() || ""
          )
      );
      setNotes(currentLogs.find((log) => log.notes)?.notes || "");
    } else if (currentLog) {
      setWeights(
        currentLog.weight
          ? currentLog.weight.toString().split(",").map((s) => s.trim())
          : Array(numSets).fill("")
      );
      setRepsList(
        currentLog.reps
          ? currentLog.reps.split(",").map((s) => s.trim())
          : Array(numSets).fill("")
      );
      setRpeList(Array(numSets).fill(""));
      setNotes(currentLog.notes || "");
    } else {
      setWeights(Array(numSets).fill(""));
      setRepsList(Array(numSets).fill(""));
      setRpeList(Array(numSets).fill(""));
      setNotes("");
    }
  }, [currentLog, exercise, isPlannedWorkout]);

  if (isLoading || !workout) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Overview screen ────────────────────────────────────────────────────────
  if (overview) {
    return (
      <WorkoutOverview
        workout={workout}
        onStart={() => { setCurrentStep(0); setOverview(false); }}
        onSelectExercise={(idx) => { setCurrentStep(idx); setOverview(false); }}
        onBack={() => setLocation("/trainingen")}
      />
    );
  }

  // ── Finished screen ────────────────────────────────────────────────────────
  if (isFinished) {
    return (
      <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center">
        <div className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <Trophy className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Lekker bezig!
        </h1>
        <p className="text-muted-foreground mb-8">
          Je hebt de {workout.name} workout succesvol afgerond.
        </p>
        <Button
          onClick={() => setLocation("/trainingen")}
          className="w-full py-6 text-lg rounded-xl font-bold"
        >
          Terug naar overzicht
        </Button>
      </div>
    );
  }

  if (!exercise) return null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const advanceStep = () => {
    // Always return to the overview so the user can pick the next exercise
    setOverview(true);
  };

  const handleNext = () => {
    if (isPlannedWorkout) {
      savePlannedSets.mutate(
        { exercise, weights, repsList, rpeList, notes },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: ["planned-workout", workoutId],
            });
            queryClient.invalidateQueries({
              queryKey: ["planned-week", workout.weekNumber],
            });
            advanceStep();
          },
        }
      );
      return;
    }

    const finalWeights = weights
      .map((w) => (w.trim() === "" ? "0" : w))
      .join(", ");
    const finalReps = repsList
      .map((r) => (r.trim() === "" ? "0" : r))
      .join(", ");

    const data = {
      exerciseId: exercise.id,
      workoutId: workout.id,
      weekNumber: workout.weekNumber,
      sets: exercise.sets,
      reps: finalReps,
      weight: finalWeights,
      notes: notes || null,
    };

    const onSuccess = () => {
      queryClient.invalidateQueries({
        queryKey: getGetWorkoutQueryKey(workoutId),
      });
      queryClient.invalidateQueries({
        queryKey: getGetWeekWorkoutStatusQueryKey(workout.weekNumber),
      });
      queryClient.invalidateQueries({
        queryKey: getGetWorkoutsForWeekQueryKey(workout.weekNumber),
      });
      advanceStep();
    };

    if (currentLog) {
      updateLog.mutate({ id: currentLog.id, data }, { onSuccess });
    } else {
      createLog.mutate({ data }, { onSuccess });
    }
  };

  // ── Placeholder helpers (priority: prescribed → previous log) ──────────────

  const getWeightPlaceholder = (idx: number): string => {
    // 1. Trainer-prescribed weight
    const prescribed = exercise.prescribedWeight
      ?.toString()
      .split(",")
      [idx]?.trim();
    if (prescribed) return prescribed;
    // 2. Previous week logged weight
    const prevLog = exercise.previousSetLogs?.find(
      (log) => log.setNumber === idx + 1
    );
    if (prevLog?.weight) return prevLog.weight.toString();
    const prevWeekWeight = exercise.previousWeekWeight
      ?.toString()
      .split(",")
      [idx]?.trim();
    if (prevWeekWeight) return prevWeekWeight;
    return "";
  };

  const getRepsPlaceholder = (idx: number): string => {
    // 1. Trainer-prescribed rep range
    const prescribed = exercise.repRange || exercise.reps;
    if (prescribed) return prescribed.toString().split(",")[idx]?.trim() || prescribed.toString();
    // 2. Previous week logged reps
    const prevLog = exercise.previousSetLogs?.find(
      (log) => log.setNumber === idx + 1
    );
    if (prevLog?.reps != null) return prevLog.reps.toString();
    const prevWeekReps = exercise.previousWeekReps
      ?.toString()
      .split(",")
      [idx]?.trim();
    if (prevWeekReps) return prevWeekReps;
    return "";
  };

  const progress = (currentStep / exercises.length) * 100;
  const repLabel = exercise.repRange || exercise.reps;
  const imageUrl = exercise.imageUrl || getExerciseImage(exercise.name);
  const isPending =
    createLog.isPending || updateLog.isPending || savePlannedSets.isPending;

  return (
    <>
      {/* ── Stopwatch Modal ── */}
      <StopwatchModal
        open={stopwatchOpen}
        onClose={() => setStopwatchOpen(false)}
      />

      {/* ── Skip Exercise Dialog ── */}
      <SkipExerciseDialog
        open={skipDialogOpen}
        onClose={() => setSkipDialogOpen(false)}
        exerciseId={exercise.id}
        onSkip={advanceStep}
        onReplaced={advanceStep}
      />

      <div className="min-h-[100dvh] w-full bg-background flex flex-col max-w-md mx-auto">
        {/* ── Header ── */}
        <header className="w-full p-4 flex items-center border-b border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOverview(true)}
            className="mr-2"
            aria-label="Terug naar overzicht"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Oefening {currentStep + 1} van {exercises.length}
            </div>
            <h2 className="text-2xl font-black text-foreground">
              {exercise.name}{" "}
              {repLabel ? (
                <span className="text-muted-foreground text-lg font-bold">
                  ({repLabel})
                </span>
              ) : (
                ""
              )}
            </h2>
          </div>
          {/* Timer button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setStopwatchOpen(true)}
            className="ml-2"
            aria-label="Stopwatch openen"
          >
            <Timer className="h-6 w-6" />
          </Button>
        </header>

        <Progress value={progress} className="h-1 rounded-none bg-secondary" />

        <main className="flex-1 p-6 flex flex-col overflow-y-auto pb-44">
          {/* Exercise image */}
          {imageUrl ? (
            <div className="w-full aspect-video bg-muted rounded-xl mb-6 overflow-hidden border border-border relative">
              <img
                src={imageUrl}
                alt={exercise.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-full aspect-video bg-secondary rounded-xl mb-6 flex items-center justify-center border border-border">
              <PlayCircle className="w-12 h-12 text-muted-foreground opacity-50" />
            </div>
          )}

          {/* Exercise header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-1 flex items-start justify-between">
              {exercise.name}
              {exercise.videoUrl && (
                <a
                  href={exercise.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 transition-colors"
                >
                  <ExternalLink className="w-5 h-5 mt-1" />
                </a>
              )}
            </h2>
            <div className="text-lg text-primary font-bold">
              {exercise.sets} sets × {repLabel || "–"} reps
            </div>
            {exercise.targetRpe && (
              <div className="mt-3 inline-flex items-center rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-black text-primary">
                Richtlijn: RPE {exercise.targetRpe}
              </div>
            )}
          </div>

          {/* Set inputs */}
          <div className="flex flex-col gap-5">
            {Array.from({ length: exercise.sets || 1 }).map((_, idx) => (
              <div
                key={idx}
                className="grid grid-cols-2 gap-3"
              >
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    Set {idx + 1} - Gewicht (kg)
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={weights[idx] || ""}
                    onChange={(e) => {
                      const newWeights = [...weights];
                      newWeights[idx] = e.target.value;
                      setWeights(newWeights);
                    }}
                    className="h-14 text-xl font-bold px-4 bg-card"
                    placeholder={getWeightPlaceholder(idx)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    Set {idx + 1} - Reps
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={repsList[idx] || ""}
                    onChange={(e) => {
                      const newReps = [...repsList];
                      newReps[idx] = e.target.value;
                      setRepsList(newReps);
                    }}
                    className="h-14 text-xl font-bold px-4 bg-card"
                    placeholder={getRepsPlaceholder(idx)}
                  />
                </div>
              </div>
            ))}

            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Notities (optioneel)
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none bg-card"
                placeholder={
                  exercise.notes || "Bijv: voelde zwaar, techniek verbeteren..."
                }
              />
            </div>
          </div>
        </main>

        {/* ── Bottom bar ── */}
        <div className="fixed bottom-20 left-0 w-full p-4 bg-background border-t border-border z-20">
          <div className="w-full max-w-md mx-auto flex flex-col gap-2">
            <Button
              onClick={handleNext}
              className="w-full h-14 rounded-xl text-lg font-bold shadow-lg"
              disabled={isPending}
            >
              {isPending ? (
                <div className="w-6 h-6 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin mr-2" />
              ) : (
                <>
                  Opslaan & terug naar overzicht <Check className="ml-2 w-5 h-5" />
                </>
              )}
            </Button>
            {/* Skip button */}
            <button
              type="button"
              className="text-sm text-muted-foreground text-center py-1 hover:text-foreground transition-colors"
              onClick={() => setSkipDialogOpen(true)}
            >
              Deze oefening niet gedaan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
