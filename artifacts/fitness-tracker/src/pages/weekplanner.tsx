import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, Copy, Dumbbell, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useClient } from "@/components/client-context";
import { apiFetch } from "@/lib/api";

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

export default function WeekplannerPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { activeClientId } = useClient();
  const [plannerWeekNumber, setPlannerWeekNumber] = useState(1);
  const [weekWasChosen, setWeekWasChosen] = useState(false);
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState<PlannedWorkout | null>(null);
  const [editingExercise, setEditingExercise] = useState<PlannedExercise | null>(null);
  const [exerciseForm, setExerciseForm] = useState(emptyExerciseForm);
  const [librarySearch, setLibrarySearch] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [targets, setTargets] = useState<NutritionTarget[]>([]);
  const [error, setError] = useState("");

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

  useEffect(() => {
    setTargets(nutritionTargets.length > 0 ? nutritionTargets : [{
      id: "empty-daily",
      dayLabel: "Dagelijks",
      kcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      waterMl: null,
    }]);
  }, [nutritionTargets]);

  useEffect(() => {
    if (!plannedWeeks || weekWasChosen) return;
    setPlannerWeekNumber(plannedWeeks.nextWeekNumber || 1);
  }, [plannedWeeks, weekWasChosen]);

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return library
      .filter((exercise) => !q || [exercise.name, exercise.category].some((value) => String(value || "").toLowerCase().includes(q)))
      .slice(0, 80);
  }, [library, librarySearch]);

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
      const url = editingExercise ? `/api/plans/exercises/${editingExercise.id}` : `/api/plans/workouts/${activeWorkout.id}/exercises`;
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

  const selectLibraryExercise = (id: string) => {
    const exercise = library.find((item) => item.id === id);
    setExerciseForm((form) => ({
      ...form,
      exerciseLibraryId: id,
      name: exercise?.name || form.name,
      videoUrl: exercise?.videoUrl || form.videoUrl,
      imageUrl: exercise?.imageUrl || form.imageUrl,
      notes: exercise?.notes || form.notes,
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

  if (!activeClientId) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-4">
          <h1 className="text-2xl font-black">Kies eerst een klant</h1>
          <Button onClick={() => setLocation("/trainer")} className="font-bold">Terug naar trainer menu</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background">
      <header className="w-full border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/trainer")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Dumbbell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-foreground">Weekplanner</h1>
            <p className="text-xs text-muted-foreground">Je maakt of bewerkt week {plannerWeekNumber}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => chooseWeek(plannedWeeks?.nextWeekNumber || plannerWeekNumber + 1)}
            className="h-10 font-bold"
          >
            Nieuwe week
          </Button>
          <Input
            type="number"
            min={1}
            value={plannerWeekNumber}
            onChange={(e) => chooseWeek(Number(e.target.value) || 1)}
            className="h-10 w-20 font-bold"
          />
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
        <div className="flex flex-col xl:flex-row gap-3">
          <Button onClick={() => createWorkout.mutate()} disabled={createWorkout.isPending} className="h-11 font-bold">
            <Plus className="h-4 w-4 mr-2" />
            Training
          </Button>
          <Button variant="outline" onClick={() => copyWeek.mutate()} disabled={copyWeek.isPending || plannerWeekNumber <= 1} className="h-11 font-bold">
            <Copy className="h-4 w-4 mr-2" />
            Week {Math.max(1, plannerWeekNumber - 1)} kopieren naar week {plannerWeekNumber}
          </Button>
          <div className="flex gap-2 flex-1">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Template kiezen</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
            <Button variant="outline" onClick={() => applyTemplate.mutate()} disabled={!templateId || applyTemplate.isPending} className="h-11 font-bold">
              Toepassen
            </Button>
          </div>
        </div>

        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Laden...</div>
            ) : week?.workouts?.length ? (
              week.workouts.map((workout) => (
                <section key={workout.id} className="border border-border bg-card rounded-lg">
                  <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center gap-3">
                    <div className="grid sm:grid-cols-2 gap-3 flex-1">
                      <Input defaultValue={workout.name} onBlur={(e) => updateWorkout.mutate({ workout, values: { name: e.target.value } })} className="font-bold" />
                      <Input defaultValue={workout.dayLabel} onBlur={(e) => updateWorkout.mutate({ workout, values: { dayLabel: e.target.value } })} />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="icon" onClick={() => saveTemplate.mutate(workout)} title="Opslaan als template">
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => deleteWorkout.mutate(workout)} title="Training verwijderen">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button onClick={() => openAddExercise(workout)} className="font-bold">
                        <Plus className="h-4 w-4 mr-2" />
                        Oefening
                      </Button>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {workout.exercises.map((exercise) => (
                      <div key={exercise.id} className="p-4 grid gap-3 md:grid-cols-[64px_minmax(0,1fr)_220px] md:items-center">
                        <div className="h-16 w-16 rounded-md overflow-hidden bg-secondary">
                          {exercise.imageUrl ? <img src={exercise.imageUrl} alt={exercise.name} className="h-full w-full object-cover" /> : null}
                        </div>
                        <button type="button" onClick={() => openEditExercise(workout, exercise)} className="text-left min-w-0">
                          <h3 className="font-black truncate">{exercise.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {exercise.sets} sets x {exercise.repRange || "-"} reps{exercise.targetRpe ? ` @ RPE ${exercise.targetRpe}` : ""}
                          </p>
                          {exercise.notes && <p className="text-xs text-muted-foreground truncate">{exercise.notes}</p>}
                        </button>
                        <div className="flex gap-2 md:justify-end">
                          <Button variant="outline" size="icon" onClick={() => moveExercise(workout, exercise, -1)}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => moveExercise(workout, exercise, 1)}>
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => deleteExercise.mutate(exercise)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {workout.exercises.length === 0 && (
                      <div className="p-4 text-sm text-muted-foreground">Nog geen oefeningen.</div>
                    )}
                  </div>
                </section>
              ))
            ) : (
              <div className="border border-dashed border-border rounded-lg p-6 text-sm text-muted-foreground">Nog geen trainingen voor deze week.</div>
            )}
          </div>

          <aside className="border border-border bg-card rounded-lg p-4 h-fit">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-black text-lg">Voedingsdoel</h2>
                <p className="text-xs text-muted-foreground">Dit doel geldt elke dag opnieuw.</p>
              </div>
              <Button size="sm" onClick={() => saveTargets.mutate()} disabled={saveTargets.isPending} className="font-bold">
                <Save className="h-4 w-4 mr-2" />
                Opslaan
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TargetField label="Kcal" value={targets[0]?.kcal ?? null} onChange={(value) => updateTarget(0, "kcal", value)} />
              <TargetField label="Eiwit g" value={targets[0]?.proteinG ?? null} onChange={(value) => updateTarget(0, "proteinG", value)} />
              <TargetField label="Koolhydraten g" value={targets[0]?.carbsG ?? null} onChange={(value) => updateTarget(0, "carbsG", value)} />
              <TargetField label="Vet g" value={targets[0]?.fatG ?? null} onChange={(value) => updateTarget(0, "fatG", value)} />
              <div className="col-span-2">
                <TargetField label="Water ml" value={targets[0]?.waterMl ?? null} onChange={(value) => updateTarget(0, "waterMl", value)} />
              </div>
            </div>
          </aside>
        </div>
      </main>

      <Dialog open={exerciseDialogOpen} onOpenChange={setExerciseDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingExercise ? "Oefening aanpassen" : "Oefening toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editingExercise && (
              <>
                <Input value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} placeholder="Zoek in bibliotheek" />
                <select value={exerciseForm.exerciseLibraryId} onChange={(e) => selectLibraryExercise(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Losse oefening</option>
                  {filteredLibrary.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>{exercise.name}</option>
                  ))}
                </select>
              </>
            )}

            <Field label="Naam" value={exerciseForm.name} onChange={(name) => setExerciseForm((f) => ({ ...f, name }))} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Sets" value={exerciseForm.sets} onChange={(sets) => setExerciseForm((f) => ({ ...f, sets }))} type="number" />
              <Field label="Reprange" value={exerciseForm.repRange} onChange={(repRange) => setExerciseForm((f) => ({ ...f, repRange }))} />
              <Field label="RPE" value={exerciseForm.targetRpe} onChange={(targetRpe) => setExerciseForm((f) => ({ ...f, targetRpe }))} type="number" />
            </div>
            {!exerciseForm.exerciseLibraryId && !editingExercise && (
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={exerciseForm.addToLibrary}
                  onChange={(e) => setExerciseForm((f) => ({ ...f, addToLibrary: e.target.checked }))}
                />
                Toevoegen aan bibliotheek
              </label>
            )}
            {!exerciseForm.exerciseLibraryId && (
              <>
                <Field label="Categorie" value={exerciseForm.category} onChange={(category) => setExerciseForm((f) => ({ ...f, category }))} />
                <Field label="Video link" value={exerciseForm.videoUrl} onChange={(videoUrl) => setExerciseForm((f) => ({ ...f, videoUrl }))} />
                <Field label="Afbeelding link" value={exerciseForm.imageUrl} onChange={(imageUrl) => setExerciseForm((f) => ({ ...f, imageUrl }))} />
              </>
            )}
            <div className="space-y-1.5">
              <Label>Notities</Label>
              <Textarea value={exerciseForm.notes} onChange={(e) => setExerciseForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
            <Button onClick={() => saveExercise.mutate()} disabled={saveExercise.isPending} className="w-full h-11 font-bold">
              {saveExercise.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TargetField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: string) => void }) {
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
