import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Dumbbell,
  FileText,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  Undo2,
  X,
} from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useClient } from "@/components/client-context";
import { apiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type LibraryExercise = {
  id: string;
  name: string;
  category: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  notes: string | null;
};

type PlannedExercise = {
  id: string;
  name: string;
  sets: number;
  repRange: string | null;
  targetRpe: string | null;
  sortOrder: number;
  videoUrl: string | null;
  imageUrl: string | null;
  notes: string | null;
};

type PlannedWorkout = {
  id: string;
  name: string;
  dayLabel: string;
  sortOrder: number;
  exerciseCount: number;
  completedCount: number;
  plannedSetCount: number;
  completedSetCount: number;
  exercises: PlannedExercise[];
};

type PlannedWeek = {
  weekNumber: number;
  workouts: PlannedWorkout[];
};

type PlannedWeeks = {
  weekNumbers: number[];
  nextWeekNumber: number;
};

type NutritionTarget = {
  id: string;
  dayLabel: string;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  waterMl: number | null;
};

type Template = {
  id: string;
  name: string;
  exercises: PlannedExercise[];
};

// ─── Form defaults ─────────────────────────────────────────────────────────────

const emptyExerciseForm = {
  exerciseLibraryId: "",
  name: "",
  category: "",
  videoUrl: "",
  imageUrl: "",
  sets: "3",
  repRange: "8-12",
  targetRpe: "8",
  notes: "",
  addToLibrary: false,
};

// ─── Helper sub-components ────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TargetField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 px-3 text-sm font-bold"
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WeekplannerPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { activeClientId } = useClient();

  // Week navigation
  const [plannerWeekNumber, setPlannerWeekNumber] = useState(1);
  const [weekWasChosen, setWeekWasChosen] = useState(false);

  // Exercise dialog
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState<PlannedWorkout | null>(null);
  const [editingExercise, setEditingExercise] = useState<PlannedExercise | null>(null);
  const [exerciseForm, setExerciseForm] = useState(emptyExerciseForm);
  const [librarySearch, setLibrarySearch] = useState("");

  // Template edit dialog
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateEditOpen, setTemplateEditOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [activeTemplateWorkout, setActiveTemplateWorkout] = useState<PlannedWorkout | null>(null);
  const [workoutTemplateId, setWorkoutTemplateId] = useState("");

  // Nutrition targets
  const [targets, setTargets] = useState<NutritionTarget[]>([]);

  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoToast, setUndoToast] = useState<{ message: string; timeoutId: ReturnType<typeof setTimeout> } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Previous week comparison
  const [compareWeekOffset, setCompareWeekOffset] = useState<number | null>(null);

  // ─── Queries ───────────────────────────────────────────────────────────────

  const { data: plannedWeeks } = useQuery<PlannedWeeks>({
    queryKey: ["planned-weeks", activeClientId],
    enabled: !!activeClientId,
    queryFn: async () => {
      const res = await apiFetch("/api/plans/weeks");
      if (!res.ok) throw new Error("Weken ophalen mislukt");
      return res.json();
    },
  });

  const { data: week, isLoading } = useQuery<PlannedWeek>({
    queryKey: ["planned-week", plannerWeekNumber, activeClientId],
    enabled: !!activeClientId,
    queryFn: async () => {
      const res = await apiFetch(`/api/plans/week/${plannerWeekNumber}`);
      if (!res.ok) throw new Error("Weekplanning ophalen mislukt");
      return res.json();
    },
  });

  const { data: library = [] } = useQuery<LibraryExercise[]>({
    queryKey: ["exercise-library"],
    queryFn: async () => {
      const res = await apiFetch("/api/library/exercises");
      if (!res.ok) throw new Error("Bibliotheek ophalen mislukt");
      return res.json();
    },
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["training-templates"],
    enabled: !!activeClientId,
    queryFn: async () => {
      const res = await apiFetch("/api/plans/templates");
      if (!res.ok) throw new Error("Templates ophalen mislukt");
      return res.json();
    },
  });

  const { data: nutritionTargets = [] } = useQuery<NutritionTarget[]>({
    queryKey: ["nutrition-targets", activeClientId],
    enabled: !!activeClientId,
    queryFn: async () => {
      const res = await apiFetch("/api/plans/nutrition-targets");
      if (!res.ok) throw new Error("Voedingsdoelen ophalen mislukt");
      return res.json();
    },
  });

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    setTargets(
      nutritionTargets.length > 0
        ? nutritionTargets
        : [{ id: "empty-daily", dayLabel: "Dagelijks", kcal: null, proteinG: null, carbsG: null, fatG: null, waterMl: null }]
    );
  }, [nutritionTargets]);

  useEffect(() => {
    if (!plannedWeeks || weekWasChosen) return;
    const existingWeeks = plannedWeeks.weekNumbers || [];
    setPlannerWeekNumber(existingWeeks.length > 0 ? Math.max(...existingWeeks) : 1);
  }, [plannedWeeks, weekWasChosen]);

  useEffect(() => {
    setWeekWasChosen(false);
    setPlannerWeekNumber(1);
  }, [activeClientId]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return library
      .filter((exercise) => !q || [exercise.name, exercise.category].some((v) => String(v || "").toLowerCase().includes(q)))
      .slice(0, 80);
  }, [library, librarySearch]);

  // ─── Compare week query ────────────────────────────────────────────────────

  const compareWeekNumber = compareWeekOffset !== null ? plannerWeekNumber + compareWeekOffset : null;

  const { data: compareWeek } = useQuery<PlannedWeek>({
    queryKey: ["planned-week", compareWeekNumber, activeClientId],
    enabled: !!activeClientId && compareWeekNumber !== null && compareWeekNumber >= 1,
    queryFn: async () => {
      const res = await apiFetch(`/api/plans/week/${compareWeekNumber}`);
      if (!res.ok) throw new Error("Vergelijkingsweek ophalen mislukt");
      return res.json();
    },
  });

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const invalidateWeek = () => {
    queryClient.invalidateQueries({ queryKey: ["planned-week"] });
    queryClient.invalidateQueries({ queryKey: ["planned-weeks"] });
    queryClient.invalidateQueries({ queryKey: ["training-templates"] });
    queryClient.invalidateQueries({ queryKey: ["nutrition-targets"] });
  };

  const createWorkout = useMutation({
    mutationFn: async () => {
      setError("");
      const order = week?.workouts?.length || 0;
      const name = `Training ${String.fromCharCode(65 + order)}`;
      const res = await apiFetch(`/api/plans/week/${plannerWeekNumber}/workouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, dayLabel: name, sortOrder: order }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Training aanmaken mislukt");
      return data;
    },
    onSuccess: invalidateWeek,
    onError: (err) => setError(err instanceof Error ? err.message : "Training aanmaken mislukt"),
  });

  const copyWeek = useMutation({
    mutationFn: async () => {
      setError("");
      const res = await apiFetch(`/api/plans/week/${plannerWeekNumber}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceWeek: Math.max(1, plannerWeekNumber - 1) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Week kopieren mislukt");
      return data;
    },
    onSuccess: invalidateWeek,
    onError: (err) => setError(err instanceof Error ? err.message : "Week kopieren mislukt"),
  });

  const addTemplateToWorkout = useMutation({
    mutationFn: async () => {
      if (!activeTemplateWorkout) throw new Error("Geen trainingsdag gekozen");
      const template = templates.find((item) => item.id === workoutTemplateId);
      if (!template) throw new Error("Kies een template");
      const res = await apiFetch(`/api/plans/workouts/${activeTemplateWorkout.id}/exercises/from-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Template toevoegen mislukt");
      return data;
    },
    onSuccess: () => {
      setTemplateDialogOpen(false);
      setWorkoutTemplateId("");
      invalidateWeek();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Template toevoegen mislukt"),
  });

  const saveExercise = useMutation({
    mutationFn: async () => {
      if (!activeWorkout) throw new Error("Geen training gekozen");
      const method = editingExercise ? "PUT" : "POST";
      const url = editingExercise
        ? `/api/plans/exercises/${editingExercise.id}`
        : `/api/plans/workouts/${activeWorkout.id}/exercises`;
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exerciseForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Oefening opslaan mislukt");
      return data;
    },
    onSuccess: () => {
      setExerciseDialogOpen(false);
      invalidateWeek();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Oefening opslaan mislukt"),
  });

  const updateWorkout = useMutation({
    mutationFn: async (input: { workout: PlannedWorkout; values: Partial<PlannedWorkout> }) => {
      const res = await apiFetch(`/api/plans/workouts/${input.workout.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.values),
      });
      if (!res.ok) throw new Error("Training bijwerken mislukt");
    },
    onSuccess: invalidateWeek,
  });

  const deleteWorkout = useMutation({
    mutationFn: async (workout: PlannedWorkout) => {
      const res = await apiFetch(`/api/plans/workouts/${workout.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Training verwijderen mislukt");
    },
    onSuccess: invalidateWeek,
  });

  const updateExercise = useMutation({
    mutationFn: async (input: { exercise: PlannedExercise; values: Partial<PlannedExercise> }) => {
      const res = await apiFetch(`/api/plans/exercises/${input.exercise.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.values),
      });
      if (!res.ok) throw new Error("Oefening bijwerken mislukt");
    },
    onSuccess: invalidateWeek,
  });

  const deleteExercise = useMutation({
    mutationFn: async (exercise: PlannedExercise) => {
      const res = await apiFetch(`/api/plans/exercises/${exercise.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Oefening verwijderen mislukt");
    },
    onSuccess: invalidateWeek,
  });

  const saveTemplate = useMutation({
    mutationFn: async (workout: PlannedWorkout) => {
      const res = await apiFetch(`/api/plans/templates/from-workout/${workout.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workout.name }),
      });
      if (!res.ok) throw new Error("Template opslaan mislukt");
    },
    onSuccess: invalidateWeek,
  });

  const deleteTemplate = useMutation({
    mutationFn: async (tplId: string) => {
      const res = await apiFetch(`/api/plans/templates/${tplId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Template verwijderen mislukt");
    },
    onSuccess: invalidateWeek,
  });

  const updateTemplateExercise = useMutation({
    mutationFn: async (input: { templateId: string; exercise: PlannedExercise; values: Partial<PlannedExercise> }) => {
      const res = await apiFetch(`/api/plans/templates/${input.templateId}/exercises/${input.exercise.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.values),
      });
      if (!res.ok) throw new Error("Template oefening bijwerken mislukt");
    },
    onSuccess: () => {
      invalidateWeek();
      // Refresh editingTemplate from updated templates after refetch
    },
  });

  const deleteTemplateExercise = useMutation({
    mutationFn: async (input: { templateId: string; exercise: PlannedExercise }) => {
      const res = await apiFetch(`/api/plans/templates/${input.templateId}/exercises/${input.exercise.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Template oefening verwijderen mislukt");
    },
    onSuccess: () => {
      invalidateWeek();
    },
  });

  const bulkAdjust = useMutation({
    mutationFn: async (action: string) => {
      const res = await apiFetch(`/api/plans/week/${plannerWeekNumber}/bulk-adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Aanpassing mislukt");
      return data;
    },
    onSuccess: invalidateWeek,
    onError: (err) => setError(err instanceof Error ? err.message : "Aanpassing mislukt"),
  });

  const saveTargets = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/plans/nutrition-targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: targets[0] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Voedingsdoelen opslaan mislukt");
      return data;
    },
    onSuccess: invalidateWeek,
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const downloadWeekplan = async () => {
    setDownloading(true);
    try {
      const res = await apiFetch("/api/export/weekplan", {
        headers: activeClientId ? { "x-client-id": activeClientId } : {},
      });
      if (!res.ok) throw new Error("Export mislukt");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Weekplanning_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Excel export mislukt. Probeer het opnieuw.");
    } finally {
      setDownloading(false);
    }
  };

  const showUndoToast = (message: string) => {
    if (undoToast) clearTimeout(undoToast.timeoutId);
    const timeoutId = setTimeout(() => setUndoToast(null), 12000);
    setUndoToast({ message, timeoutId });
    setUndoAvailable(true);
  };

  const uploadExcel = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch("/api/upload/excel", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload mislukt");
      // Refresh all week data
      queryClient.invalidateQueries({ queryKey: ["planned-week"] });
      queryClient.invalidateQueries({ queryKey: ["planned-weeks"] });
      queryClient.invalidateQueries({ queryKey: ["nutrition-targets"] });
      showUndoToast(`Excel geïmporteerd: ${data.wekenGeladen ?? "?"} weken, ${data.trainingenAangemaakt ?? "?"} trainingen aangemaakt.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const undoLastAction = async () => {
    try {
      const res = await apiFetch("/api/upload/excel/undo", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ongedaan maken mislukt");
      queryClient.invalidateQueries({ queryKey: ["planned-week"] });
      queryClient.invalidateQueries({ queryKey: ["planned-weeks"] });
      queryClient.invalidateQueries({ queryKey: ["nutrition-targets"] });
      setUndoToast(null);
      setUndoAvailable(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ongedaan maken mislukt");
    }
  };

  const openAddExercise = (workout: PlannedWorkout) => {
    setActiveWorkout(workout);
    setEditingExercise(null);
    setExerciseForm(emptyExerciseForm);
    setLibrarySearch("");
    setError("");
    setExerciseDialogOpen(true);
  };

  const openEditExercise = (workout: PlannedWorkout, exercise: PlannedExercise) => {
    setActiveWorkout(workout);
    setEditingExercise(exercise);
    setExerciseForm({
      exerciseLibraryId: "",
      name: exercise.name,
      category: "",
      videoUrl: exercise.videoUrl || "",
      imageUrl: exercise.imageUrl || "",
      sets: String(exercise.sets || 3),
      repRange: exercise.repRange || "",
      targetRpe: exercise.targetRpe || "",
      notes: exercise.notes || "",
      addToLibrary: false,
    });
    setLibrarySearch("");
    setError("");
    setExerciseDialogOpen(true);
  };

  const selectLibraryExercise = (item: LibraryExercise) => {
    setExerciseForm((form) => ({
      ...form,
      exerciseLibraryId: item.id,
      name: item.name,
      videoUrl: item.videoUrl || form.videoUrl,
      imageUrl: item.imageUrl || form.imageUrl,
      notes: item.notes || form.notes,
    }));
  };

  const moveExercise = (workout: PlannedWorkout, exercise: PlannedExercise, direction: -1 | 1) => {
    const ordered = [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((item) => item.id === exercise.id);
    const neighbor = ordered[index + direction];
    if (!neighbor) return;
    updateExercise.mutate({
      exercise,
      values: { sortOrder: direction < 0 ? neighbor.sortOrder - 1 : neighbor.sortOrder + 1 },
    });
  };

  const moveTemplateExercise = (exercise: PlannedExercise, direction: -1 | 1) => {
    if (!editingTemplate) return;
    const ordered = [...editingTemplate.exercises].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((item) => item.id === exercise.id);
    const neighbor = ordered[index + direction];
    if (!neighbor) return;
    updateTemplateExercise.mutate({
      templateId: editingTemplate.id,
      exercise,
      values: { sortOrder: direction < 0 ? neighbor.sortOrder - 1 : neighbor.sortOrder + 1 },
    });
  };

  const updateTarget = (index: number, key: keyof NutritionTarget, value: string) => {
    setTargets((items) => {
      const current = items[index] || {
        id: "empty-daily",
        dayLabel: "Dagelijks",
        kcal: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
        waterMl: null,
      };
      const next = { ...current, [key]: value === "" ? null : Number(value) };
      return index === 0 ? [next] : items.map((item, itemIndex) => (itemIndex === index ? next : item));
    });
  };

  const chooseWeek = (value: number) => {
    setWeekWasChosen(true);
    setPlannerWeekNumber(Math.max(1, value || 1));
  };

  const openTemplateEdit = (template: Template) => {
    setEditingTemplate(template);
    setTemplateEditOpen(true);
  };

  const openWorkoutTemplateDialog = (workout: PlannedWorkout) => {
    setActiveTemplateWorkout(workout);
    setWorkoutTemplateId("");
    setError("");
    setTemplateDialogOpen(true);
  };

  // Keep editingTemplate in sync with refreshed templates data
  useEffect(() => {
    if (!editingTemplate) return;
    const refreshed = templates.find((t) => t.id === editingTemplate.id);
    if (refreshed) setEditingTemplate(refreshed);
  }, [templates]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Guard ─────────────────────────────────────────────────────────────────

  if (!activeClientId) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-black">Kies eerst een klant</h1>
          <Button onClick={() => setLocation("/trainer")} className="font-bold">
            Terug naar trainer menu
          </Button>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const sortedTemplateExercises = editingTemplate
    ? [...editingTemplate.exercises].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const nextWeekNumber = plannedWeeks?.nextWeekNumber || plannerWeekNumber + 1;
  const weekOptions = Array.from(
    new Set([...(plannedWeeks?.weekNumbers || []), plannerWeekNumber]),
  ).sort((a, b) => a - b);

  return (
    <div className="min-h-[100dvh] w-full bg-background">
      {/* ── Header ── */}
      <header className="w-full border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/trainer")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Dumbbell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-foreground leading-tight">Weekplanner</h1>
            <p className="text-xs text-muted-foreground">Je bewerkt nu week {plannerWeekNumber}</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Week</Label>
              <select
                value={plannerWeekNumber}
                onChange={(e) => chooseWeek(Number(e.target.value))}
                className="h-8 min-w-28 rounded-md border border-input bg-background px-2 text-sm font-bold"
              >
                {weekOptions.map((weekNumber) => (
                  <option key={weekNumber} value={weekNumber}>
                    Week {weekNumber}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => chooseWeek(nextWeekNumber)}
              className="h-9 font-bold whitespace-nowrap"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Week toevoegen
            </Button>

            {/* Hidden file input for Excel upload */}
            <input
              ref={uploadInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadExcel(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploading}
              className="h-9 font-bold"
              title="Excel importeren"
            >
              <Upload className="h-4 w-4 mr-1.5" />
              {uploading ? "Laden..." : "Import"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={downloadWeekplan}
              disabled={downloading}
              className="h-9 font-bold"
            >
              <Download className="h-4 w-4 mr-1.5" />
              {downloading ? "..." : "Export"}
            </Button>
          </div>
        </div>

        {/* ─── Undo toast ─── */}
        {undoToast && (
          <div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-2">
            <div className="max-w-7xl mx-auto flex items-center gap-3">
              <p className="text-xs text-amber-800 dark:text-amber-300 flex-1">{undoToast.message}</p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs font-bold border-amber-500/50 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                onClick={undoLastAction}
              >
                <Undo2 className="h-3 w-3 mr-1" />
                Ongedaan maken
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-amber-600"
                onClick={() => { clearTimeout(undoToast.timeoutId); setUndoToast(null); }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Full-width toolbar ── */}
        <div className="border-t border-border bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => createWorkout.mutate()}
              disabled={createWorkout.isPending}
              className="h-9 font-bold"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Trainingsdag toevoegen
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => copyWeek.mutate()}
              disabled={copyWeek.isPending || plannerWeekNumber <= 1}
              className="h-9 font-bold"
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Week {Math.max(1, plannerWeekNumber - 1)} kopiëren
            </Button>

            <p className="ml-auto text-xs font-semibold text-muted-foreground">
              Actieve week: <span className="text-foreground">Week {plannerWeekNumber}</span>
            </p>
          </div>
        </div>

        {/* ── Bulk actions toolbar ── */}
        <div className="border-t border-border bg-amber-50/40 dark:bg-amber-950/20">
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
              Week aanpassen:
            </span>

            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Gewicht</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs font-bold"
                disabled={bulkAdjust.isPending}
                onClick={() => bulkAdjust.mutate("weight+10")}
              >
                +10%
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs font-bold"
                disabled={bulkAdjust.isPending}
                onClick={() => bulkAdjust.mutate("weight-10")}
              >
                −10%
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Herhalingen</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs font-bold"
                disabled={bulkAdjust.isPending}
                onClick={() => bulkAdjust.mutate("reps+1")}
              >
                Rep ↑
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs font-bold"
                disabled={bulkAdjust.isPending}
                onClick={() => bulkAdjust.mutate("reps-1")}
              >
                Rep ↓
              </Button>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground mr-1">Sets</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs font-bold"
                disabled={bulkAdjust.isPending}
                onClick={() => bulkAdjust.mutate("sets+1")}
              >
                +1 set
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs font-bold"
                disabled={bulkAdjust.isPending}
                onClick={() => bulkAdjust.mutate("sets-1")}
              >
                −1 set
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs font-bold border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
              disabled={bulkAdjust.isPending}
              onClick={() => {
                if (confirm(`Deload week ${plannerWeekNumber}? Dit verlaagt alle sets en rep-ranges.`)) {
                  bulkAdjust.mutate("deload");
                }
              }}
            >
              Deload week
            </Button>

            {bulkAdjust.isPending && (
              <span className="text-xs text-muted-foreground animate-pulse">Aanpassen...</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        {error && <p className="text-sm font-semibold text-destructive mb-4">{error}</p>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* ── Left: workouts ── */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Laden...</div>
            ) : week?.workouts?.length ? (
              week.workouts.map((workout) => (
                <WorkoutCard
                  key={workout.id}
                  workout={workout}
                  onAddExercise={openAddExercise}
                  onEditExercise={openEditExercise}
                  onMoveExercise={moveExercise}
                  onDeleteExercise={(ex) => deleteExercise.mutate(ex)}
                  onUpdateWorkout={(values) => updateWorkout.mutate({ workout, values })}
                  onUpdateExercise={(exercise, values) => updateExercise.mutate({ exercise, values })}
                  onDeleteWorkout={() => deleteWorkout.mutate(workout)}
                  onSaveTemplate={() => saveTemplate.mutate(workout)}
                  onAddTemplate={() => openWorkoutTemplateDialog(workout)}
                />
              ))
            ) : (
              <div className="border border-dashed border-border rounded-lg p-10 text-center text-sm text-muted-foreground">
                Nog geen trainingen voor week {plannerWeekNumber}.
                <br />
                Klik op <strong>Trainingsdag toevoegen</strong> om te beginnen.
              </div>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <aside className="space-y-4">
            {/* Compare previous week panel */}
            <div className="border border-border bg-card rounded-lg p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="font-black text-base">Vergelijk week</h2>
                  <p className="text-xs text-muted-foreground">Bekijk een vorige of volgende week.</p>
                </div>
                <Button
                  size="sm"
                  variant={compareWeekOffset !== null ? "default" : "outline"}
                  className="text-xs font-bold h-8"
                  onClick={() => setCompareWeekOffset(compareWeekOffset !== null ? null : -1)}
                >
                  {compareWeekOffset !== null ? "Sluiten" : "Vergelijk vorige week"}
                </Button>
              </div>

              {compareWeekOffset !== null && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={(compareWeekNumber ?? 0) <= 1}
                      onClick={() => setCompareWeekOffset((o) => (o ?? 0) - 1)}
                      title="Vorige week"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-bold">
                      Week {compareWeekNumber}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={(compareWeekNumber ?? 0) >= plannerWeekNumber - 1}
                      onClick={() => setCompareWeekOffset((o) => (o ?? 0) + 1)}
                      title="Volgende week"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {compareWeek?.workouts?.length ? (
                    <ul className="space-y-2">
                      {compareWeek.workouts.map((wo) => (
                        <li key={wo.id} className="border border-border rounded-md overflow-hidden">
                          <div className="bg-muted/30 px-3 py-1.5 flex items-center gap-2">
                            <Dumbbell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-bold text-sm truncate">{wo.name}</span>
                            <span className="ml-auto text-xs text-muted-foreground shrink-0">
                              {wo.exercises.length} oef.
                            </span>
                          </div>
                          {wo.exercises.length > 0 && (
                            <ul className="divide-y divide-border">
                              {[...wo.exercises]
                                .sort((a, b) => a.sortOrder - b.sortOrder)
                                .map((ex) => (
                                  <li key={ex.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold truncate">{ex.name}</span>
                                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                      {ex.sets}×{ex.repRange || "—"}
                                      {ex.targetRpe ? ` @${ex.targetRpe}` : ""}
                                    </span>
                                  </li>
                                ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      Geen trainingen voor week {compareWeekNumber}.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Voedingsdoel */}
            <div className="border border-border bg-card rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-black text-base">Voedingsdoel</h2>
                  <p className="text-xs text-muted-foreground">Dagelijks doel voor deze klant.</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => saveTargets.mutate()}
                  disabled={saveTargets.isPending}
                  className="font-bold"
                >
                  <Save className="h-4 w-4 mr-1.5" />
                  Opslaan
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TargetField label="Kcal" value={targets[0]?.kcal ?? null} onChange={(v) => updateTarget(0, "kcal", v)} />
                <TargetField label="Eiwit g" value={targets[0]?.proteinG ?? null} onChange={(v) => updateTarget(0, "proteinG", v)} />
                <TargetField label="Koolhydraten g" value={targets[0]?.carbsG ?? null} onChange={(v) => updateTarget(0, "carbsG", v)} />
                <TargetField label="Vet g" value={targets[0]?.fatG ?? null} onChange={(v) => updateTarget(0, "fatG", v)} />
                <div className="col-span-2">
                  <TargetField label="Water ml" value={targets[0]?.waterMl ?? null} onChange={(v) => updateTarget(0, "waterMl", v)} />
                </div>
              </div>
            </div>

            {/* Templates */}
            <div className="border border-border bg-card rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-black text-base">Templates</h2>
                  <p className="text-xs text-muted-foreground">Opgeslagen trainingsschema's.</p>
                </div>
              </div>

              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Nog geen templates. Sla een training op als template via het{" "}
                  <Save className="inline h-3.5 w-3.5" />-icoon.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {templates.map((template) => (
                    <li
                      key={template.id}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2 bg-background"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{template.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {template.exercises.length} oefening{template.exercises.length !== 1 ? "en" : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        title="Template bewerken"
                        onClick={() => openTemplateEdit(template)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                        title="Template verwijderen"
                        onClick={() => {
                          if (confirm(`Template "${template.name}" verwijderen?`)) {
                            deleteTemplate.mutate(template.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* ── Exercise dialog ── */}
      <Dialog open={exerciseDialogOpen} onOpenChange={setExerciseDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExercise ? "Oefening aanpassen" : "Oefening toevoegen"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Library picker — only when adding new */}
            {!editingExercise && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Oefening bibliotheek</Label>
                <Input
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Zoek op naam of categorie..."
                  className="h-9"
                />
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="max-h-52 overflow-y-auto divide-y divide-border">
                    {/* "Losse oefening" row */}
                    <button
                      type="button"
                      onClick={() =>
                        setExerciseForm((f) => ({ ...f, exerciseLibraryId: "", name: "", notes: "", videoUrl: "", imageUrl: "" }))
                      }
                      className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-accent ${
                        exerciseForm.exerciseLibraryId === "" ? "bg-primary/10 font-semibold" : ""
                      }`}
                    >
                      <span className="text-muted-foreground italic">Losse oefening (handmatig invoeren)</span>
                    </button>
                    {filteredLibrary.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectLibraryExercise(item)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-accent flex items-center justify-between gap-2 ${
                          exerciseForm.exerciseLibraryId === item.id ? "bg-primary/10 font-semibold" : ""
                        }`}
                      >
                        <span className="truncate">{item.name}</span>
                        {item.category && (
                          <span className="text-xs text-muted-foreground shrink-0 bg-muted rounded px-1.5 py-0.5">
                            {item.category}
                          </span>
                        )}
                      </button>
                    ))}
                    {filteredLibrary.length === 0 && (
                      <div className="px-3 py-3 text-sm text-muted-foreground text-center">Geen oefeningen gevonden.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Exercise name */}
            <Field
              label="Naam"
              value={exerciseForm.name}
              onChange={(name) => setExerciseForm((f) => ({ ...f, name }))}
            />

            {/* Sets / RepRange / RPE on one row */}
            <div className="grid grid-cols-3 gap-3">
              <Field
                label="Sets"
                value={exerciseForm.sets}
                onChange={(sets) => setExerciseForm((f) => ({ ...f, sets }))}
                type="number"
              />
              <Field
                label="Reprange"
                value={exerciseForm.repRange}
                onChange={(repRange) => setExerciseForm((f) => ({ ...f, repRange }))}
              />
              <Field
                label="RPE"
                value={exerciseForm.targetRpe}
                onChange={(targetRpe) => setExerciseForm((f) => ({ ...f, targetRpe }))}
                type="number"
              />
            </div>

            {/* Notes — always visible */}
            <div className="space-y-1.5">
              <Label>Notities</Label>
              <Textarea
                value={exerciseForm.notes}
                onChange={(e) => setExerciseForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Coach notities voor deze oefening..."
                rows={3}
              />
            </div>

            {/* Save to library — only for manual (no library item selected) when adding */}
            {!exerciseForm.exerciseLibraryId && !editingExercise && (
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={exerciseForm.addToLibrary}
                  onChange={(e) => setExerciseForm((f) => ({ ...f, addToLibrary: e.target.checked }))}
                  className="rounded"
                />
                Opslaan in bibliotheek
              </label>
            )}

            {/* Extra fields when manually entering */}
            {!exerciseForm.exerciseLibraryId && (
              <div className="space-y-3 pt-1 border-t border-border">
                <p className="text-xs text-muted-foreground">Optionele velden (handmatige invoer)</p>
                <Field
                  label="Categorie"
                  value={exerciseForm.category}
                  onChange={(category) => setExerciseForm((f) => ({ ...f, category }))}
                />
                <Field
                  label="Video link"
                  value={exerciseForm.videoUrl}
                  onChange={(videoUrl) => setExerciseForm((f) => ({ ...f, videoUrl }))}
                />
                <Field
                  label="Afbeelding link"
                  value={exerciseForm.imageUrl}
                  onChange={(imageUrl) => setExerciseForm((f) => ({ ...f, imageUrl }))}
                />
              </div>
            )}

            {error && <p className="text-sm font-semibold text-destructive">{error}</p>}

            <Button
              onClick={() => saveExercise.mutate()}
              disabled={saveExercise.isPending || !exerciseForm.name.trim()}
              className="w-full h-11 font-bold"
            >
              {saveExercise.isPending ? "Opslaan..." : "Oefening opslaan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add template to workout dialog ── */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Template toevoegen aan {activeTemplateWorkout?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {templates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm font-semibold text-foreground">Nog geen templates</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Maak templates aan via de bibliotheek.
                </p>
                <Button className="mt-4 font-bold" onClick={() => setLocation("/bibliotheek")}>
                  Naar bibliotheek
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Template</Label>
                  <select
                    value={workoutTemplateId}
                    onChange={(e) => setWorkoutTemplateId(e.target.value)}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Kies een template...</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.exercises.length} oefeningen)
                      </option>
                    ))}
                  </select>
                </div>
                {workoutTemplateId && (
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-2">
                      Oefeningen die worden toegevoegd
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      {[...(templates.find((template) => template.id === workoutTemplateId)?.exercises || [])]
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((exercise) => (
                          <li key={exercise.id} className="flex justify-between gap-3">
                            <span className="font-semibold">{exercise.name}</span>
                            <span className="text-muted-foreground shrink-0">
                              {exercise.sets} sets | {exercise.repRange || "-"} | RPE {exercise.targetRpe || "-"}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
                <Button
                  className="w-full h-11 font-bold"
                  onClick={() => addTemplateToWorkout.mutate()}
                  disabled={!workoutTemplateId || addTemplateToWorkout.isPending}
                >
                  {addTemplateToWorkout.isPending ? "Toevoegen..." : "Template toevoegen"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Template edit dialog ── */}
      <Dialog open={templateEditOpen} onOpenChange={setTemplateEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template bewerken — {editingTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {sortedTemplateExercises.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Geen oefeningen in dit template.</p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-md overflow-hidden">
                {sortedTemplateExercises.map((exercise, idx) => (
                  <li key={exercise.id} className="flex items-center gap-2 px-3 py-2.5 bg-background">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{exercise.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {exercise.sets} sets × {exercise.repRange || "—"} reps
                        {exercise.targetRpe ? ` @ RPE ${exercise.targetRpe}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === 0}
                        onClick={() => moveTemplateExercise(exercise, -1)}
                        title="Omhoog"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === sortedTemplateExercises.length - 1}
                        onClick={() => moveTemplateExercise(exercise, 1)}
                        title="Omlaag"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("Oefening uit template verwijderen?")) {
                            deleteTemplateExercise.mutate({ templateId: editingTemplate!.id, exercise });
                          }
                        }}
                        title="Verwijderen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setTemplateEditOpen(false)}>
                <X className="h-4 w-4 mr-1.5" />
                Sluiten
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── WorkoutCard ──────────────────────────────────────────────────────────────

function WorkoutCard({
  workout,
  onAddExercise,
  onEditExercise,
  onMoveExercise,
  onDeleteExercise,
  onUpdateWorkout,
  onUpdateExercise,
  onDeleteWorkout,
  onSaveTemplate,
  onAddTemplate,
}: {
  workout: PlannedWorkout;
  onAddExercise: (workout: PlannedWorkout) => void;
  onEditExercise: (workout: PlannedWorkout, exercise: PlannedExercise) => void;
  onMoveExercise: (workout: PlannedWorkout, exercise: PlannedExercise, direction: -1 | 1) => void;
  onDeleteExercise: (exercise: PlannedExercise) => void;
  onUpdateWorkout: (values: Partial<PlannedWorkout>) => void;
  onUpdateExercise: (exercise: PlannedExercise, values: Partial<PlannedExercise>) => void;
  onDeleteWorkout: () => void;
  onSaveTemplate: () => void;
  onAddTemplate: () => void;
}) {
  const sorted = [...workout.exercises].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section className="border border-border bg-card rounded-lg overflow-hidden">
      {/* Workout header */}
      <div className="p-4 border-b border-border bg-muted/20 flex flex-col md:flex-row md:items-center gap-3">
        <div className="grid sm:grid-cols-2 gap-2 flex-1">
          <Input
            defaultValue={workout.name}
            onBlur={(e) => onUpdateWorkout({ name: e.target.value })}
            className="font-bold h-9"
            placeholder="Training naam"
          />
          <Input
            defaultValue={workout.dayLabel}
            onBlur={(e) => onUpdateWorkout({ dayLabel: e.target.value })}
            className="h-9"
            placeholder="Dag label"
          />
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={onSaveTemplate}
            title="Opslaan als template"
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 text-destructive hover:text-destructive"
            onClick={onDeleteWorkout}
            title="Training verwijderen"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Exercise list */}
      <div className="divide-y divide-border">
        {sorted.map((exercise, idx) => (
          <ExerciseRow
            key={exercise.id}
            exercise={exercise}
            isFirst={idx === 0}
            isLast={idx === sorted.length - 1}
            onEdit={() => onEditExercise(workout, exercise)}
            onUpdate={(values) => onUpdateExercise(exercise, values)}
            onMoveUp={() => onMoveExercise(workout, exercise, -1)}
            onMoveDown={() => onMoveExercise(workout, exercise, 1)}
            onDelete={() => onDeleteExercise(exercise)}
          />
        ))}
        {sorted.length === 0 && (
          <div className="px-4 py-5 text-sm text-muted-foreground text-center">
            Nog geen oefeningen in deze trainingsdag.
          </div>
        )}
      </div>

      <div className="border-t border-border bg-muted/20 p-3 flex flex-col sm:flex-row gap-2 justify-end">
        <Button variant="outline" className="h-10 font-bold" onClick={() => onAddExercise(workout)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Oefening toevoegen
        </Button>
        <Button variant="outline" className="h-10 font-bold" onClick={onAddTemplate}>
          <FileText className="h-4 w-4 mr-1.5" />
          Template toevoegen
        </Button>
      </div>
    </section>
  );
}

// ─── ExerciseRow ──────────────────────────────────────────────────────────────

function ExerciseRow({
  exercise,
  isFirst,
  isLast,
  onEdit,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  exercise: PlannedExercise;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onUpdate: (values: Partial<PlannedExercise>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="px-4 py-3 grid gap-3 lg:grid-cols-[minmax(210px,1.2fr)_72px_120px_92px_minmax(180px,1fr)_auto] lg:items-center">
      {/* Thumbnail */}
      <div className="flex items-center gap-3 min-w-0">
        {exercise.imageUrl ? (
          <img
            src={exercise.imageUrl}
            alt={exercise.name}
            className="h-12 w-12 rounded-md object-cover shrink-0"
          />
        ) : (
          <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Dumbbell className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
        <button type="button" onClick={onEdit} className="min-w-0 text-left group">
          <h3 className="font-bold text-sm group-hover:text-primary transition-colors truncate">{exercise.name}</h3>
          <p className="text-xs text-muted-foreground">Klik om details te wijzigen</p>
        </button>
      </div>

      <InlineExerciseField
        label="Sets"
        defaultValue={String(exercise.sets || "")}
        type="number"
        onCommit={(value) => onUpdate({ sets: Number(value) || 0 })}
      />
      <InlineExerciseField
        label="Reprange"
        defaultValue={exercise.repRange || ""}
        onCommit={(value) => onUpdate({ repRange: value })}
      />
      <InlineExerciseField
        label="RPE"
        defaultValue={exercise.targetRpe || ""}
        type="number"
        onCommit={(value) => onUpdate({ targetRpe: value })}
      />
      <InlineExerciseField
        label="Notities"
        defaultValue={exercise.notes || ""}
        onCommit={(value) => onUpdate({ notes: value })}
      />

      {/* Actions */}
      <div className="flex gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onMoveUp}
          disabled={isFirst}
          title="Omhoog"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onMoveDown}
          disabled={isLast}
          title="Omlaag"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Verwijderen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function InlineExerciseField({
  label,
  defaultValue,
  onCommit,
  type = "text",
}: {
  label: string;
  defaultValue: string;
  onCommit: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
      <Input
        type={type}
        defaultValue={defaultValue}
        onBlur={(e) => {
          if (e.currentTarget.value !== defaultValue) onCommit(e.currentTarget.value);
        }}
        className="h-9 text-sm"
      />
    </label>
  );
}
