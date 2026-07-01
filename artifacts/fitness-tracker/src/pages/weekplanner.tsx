import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Copy,
  Download,
  Dumbbell,
  FileText,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
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

  // Template picker in toolbar
  const [templateId, setTemplateId] = useState("");

  // Template edit dialog
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateEditOpen, setTemplateEditOpen] = useState(false);

  // Nutrition targets
  const [targets, setTargets] = useState<NutritionTarget[]>([]);

  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

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
    setPlannerWeekNumber(plannedWeeks.nextWeekNumber || 1);
  }, [plannedWeeks, weekWasChosen]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return library
      .filter((exercise) => !q || [exercise.name, exercise.category].some((v) => String(v || "").toLowerCase().includes(q)))
      .slice(0, 80);
  }, [library, librarySearch]);

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

  const applyTemplate = useMutation({
    mutationFn: async () => {
      const template = templates.find((item) => item.id === templateId);
      if (!template) throw new Error("Kies een template");
      const order = week?.workouts?.length || 0;
      const res = await apiFetch(`/api/plans/week/${plannerWeekNumber}/workouts/from-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          name: template.name,
          dayLabel: `Training ${String.fromCharCode(65 + order)}`,
          sortOrder: order,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Template toepassen mislukt");
      return data;
    },
    onSuccess: invalidateWeek,
    onError: (err) => setError(err instanceof Error ? err.message : "Template toepassen mislukt"),
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
            <p className="text-xs text-muted-foreground">Week {plannerWeekNumber}</p>
          </div>

          {/* Week controls */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">Week nr.</Label>
            <Input
              type="number"
              min={1}
              value={plannerWeekNumber}
              onChange={(e) => chooseWeek(Number(e.target.value) || 1)}
              className="h-9 w-20 font-bold text-center"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => chooseWeek(plannedWeeks?.nextWeekNumber || plannerWeekNumber + 1)}
              className="h-9 font-bold whitespace-nowrap"
            >
              Nieuwe week
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
              Training
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

            <div className="flex gap-2 ml-auto">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[160px]"
              >
                <option value="">Template kiezen...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applyTemplate.mutate()}
                disabled={!templateId || applyTemplate.isPending}
                className="h-9 font-bold"
              >
                Toepassen
              </Button>
            </div>
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
                  onDeleteWorkout={() => deleteWorkout.mutate(workout)}
                  onSaveTemplate={() => saveTemplate.mutate(workout)}
                />
              ))
            ) : (
              <div className="border border-dashed border-border rounded-lg p-10 text-center text-sm text-muted-foreground">
                Nog geen trainingen voor week {plannerWeekNumber}.
                <br />
                Klik op <strong>+ Training</strong> in de toolbar om te beginnen.
              </div>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <aside className="space-y-4">
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
  onDeleteWorkout,
  onSaveTemplate,
}: {
  workout: PlannedWorkout;
  onAddExercise: (workout: PlannedWorkout) => void;
  onEditExercise: (workout: PlannedWorkout, exercise: PlannedExercise) => void;
  onMoveExercise: (workout: PlannedWorkout, exercise: PlannedExercise, direction: -1 | 1) => void;
  onDeleteExercise: (exercise: PlannedExercise) => void;
  onUpdateWorkout: (values: Partial<PlannedWorkout>) => void;
  onDeleteWorkout: () => void;
  onSaveTemplate: () => void;
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
          <Button size="sm" className="h-9 font-bold" onClick={() => onAddExercise(workout)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Oefening
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
            onMoveUp={() => onMoveExercise(workout, exercise, -1)}
            onMoveDown={() => onMoveExercise(workout, exercise, 1)}
            onDelete={() => onDeleteExercise(exercise)}
          />
        ))}
        {sorted.length === 0 && (
          <div className="px-4 py-5 text-sm text-muted-foreground text-center">
            Nog geen oefeningen. Klik op <strong>+ Oefening</strong> om te beginnen.
          </div>
        )}
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
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  exercise: PlannedExercise;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      {/* Thumbnail */}
      {exercise.imageUrl ? (
        <img
          src={exercise.imageUrl}
          alt={exercise.name}
          className="h-14 w-14 rounded-md object-cover shrink-0 mt-0.5"
        />
      ) : (
        <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
          <Dumbbell className="h-5 w-5 text-muted-foreground/50" />
        </div>
      )}

      {/* Content — clickable to edit */}
      <button type="button" onClick={onEdit} className="flex-1 text-left min-w-0 group">
        <h3 className="font-bold text-sm group-hover:text-primary transition-colors">{exercise.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {exercise.sets} sets × {exercise.repRange || "—"} reps
          {exercise.targetRpe ? ` @ RPE ${exercise.targetRpe}` : ""}
        </p>
        {exercise.notes && (
          <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
            <FileText className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{exercise.notes}</span>
          </p>
        )}
      </button>

      {/* Actions */}
      <div className="flex gap-1 shrink-0 mt-0.5">
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
