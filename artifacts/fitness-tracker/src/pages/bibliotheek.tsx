import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ExternalLink, FileText, Pencil, Plus, Search, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

type ExerciseItem = {
  id: string;
  name: string;
  category: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  notes: string | null;
};

type TemplateExercise = {
  id: string;
  name: string;
  exerciseLibraryId: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  notes: string | null;
  sets: number;
  repRange: string | null;
  targetRpe: string | null;
  sortOrder: number;
};

type Template = {
  id: string;
  name: string;
  notes: string | null;
  exercises: TemplateExercise[];
};

const emptyExerciseForm = {
  name: "",
  category: "",
  videoUrl: "",
  imageUrl: "",
  notes: "",
};

const emptyTemplateForm = {
  name: "",
  notes: "",
};

export default function BibliotheekPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"exercises" | "templates">("exercises");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("alles");
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseItem | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [exerciseForm, setExerciseForm] = useState(emptyExerciseForm);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [templateExerciseSearch, setTemplateExerciseSearch] = useState("");
  const [error, setError] = useState("");

  const { data: exercises = [], isLoading } = useQuery<ExerciseItem[]>({
    queryKey: ["exercise-library"],
    queryFn: async () => {
      const res = await apiFetch("/api/library/exercises");
      if (!res.ok) throw new Error("Bibliotheek ophalen mislukt");
      return res.json();
    },
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["training-templates"],
    queryFn: async () => {
      const res = await apiFetch("/api/plans/templates");
      if (!res.ok) throw new Error("Templates ophalen mislukt");
      return res.json();
    },
  });

  useEffect(() => {
    if (!editingTemplate) return;
    const refreshed = templates.find((template) => template.id === editingTemplate.id);
    if (refreshed) setEditingTemplate(refreshed);
  }, [templates, editingTemplate?.id]);

  const categories = useMemo(() => {
    return Array.from(new Set(exercises.map((exercise) => exercise.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "nl"));
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter((exercise) => {
      const matchesSearch = !q || [exercise.name, exercise.category, exercise.notes].some((value) => String(value || "").toLowerCase().includes(q));
      const matchesCategory = category === "alles" || exercise.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [category, exercises, search]);

  const filteredTemplateExercises = useMemo(() => {
    const q = templateExerciseSearch.trim().toLowerCase();
    return exercises
      .filter((exercise) => !q || [exercise.name, exercise.category, exercise.notes].some((value) => String(value || "").toLowerCase().includes(q)))
      .slice(0, 80);
  }, [exercises, templateExerciseSearch]);

  const saveExercise = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(editingExercise ? `/api/library/exercises/${editingExercise.id}` : "/api/library/exercises", {
        method: editingExercise ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exerciseForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Opslaan mislukt");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercise-library"] });
      setExerciseDialogOpen(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Opslaan mislukt"),
  });

  const deleteExercise = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/library/exercises/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Verwijderen mislukt");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exercise-library"] }),
  });

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(editingTemplate ? `/api/plans/templates/${editingTemplate.id}` : "/api/plans/templates", {
        method: editingTemplate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Template opslaan mislukt");
      return data as Template;
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["training-templates"] });
      setEditingTemplate({ ...template, exercises: template.exercises || [] });
      setTemplateForm({ name: template.name, notes: template.notes || "" });
      setTab("templates");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Template opslaan mislukt"),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/plans/templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Template verwijderen mislukt");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["training-templates"] }),
  });

  const addExerciseToTemplate = useMutation({
    mutationFn: async (exercise: ExerciseItem) => {
      if (!editingTemplate) throw new Error("Sla eerst de template op");
      const res = await apiFetch(`/api/plans/templates/${editingTemplate.id}/exercises`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exerciseLibraryId: exercise.id,
          name: exercise.name,
          videoUrl: exercise.videoUrl,
          imageUrl: exercise.imageUrl,
          notes: exercise.notes,
          sets: 3,
          repRange: "8-12",
          targetRpe: "8",
          sortOrder: (editingTemplate.exercises?.length || 0) + 1,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Oefening toevoegen mislukt");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-templates"] });
      setTemplateExerciseSearch("");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Oefening toevoegen mislukt"),
  });

  const updateTemplateExercise = useMutation({
    mutationFn: async (input: { exercise: TemplateExercise; values: Partial<TemplateExercise> }) => {
      if (!editingTemplate) throw new Error("Geen template gekozen");
      const res = await apiFetch(`/api/plans/templates/${editingTemplate.id}/exercises/${input.exercise.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.values),
      });
      if (!res.ok) throw new Error("Oefening bijwerken mislukt");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["training-templates"] }),
    onError: (err) => setError(err instanceof Error ? err.message : "Oefening bijwerken mislukt"),
  });

  const deleteTemplateExercise = useMutation({
    mutationFn: async (exercise: TemplateExercise) => {
      if (!editingTemplate) throw new Error("Geen template gekozen");
      const res = await apiFetch(`/api/plans/templates/${editingTemplate.id}/exercises/${exercise.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Oefening verwijderen mislukt");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["training-templates"] }),
  });

  const openNewExercise = () => {
    setEditingExercise(null);
    setExerciseForm(emptyExerciseForm);
    setError("");
    setExerciseDialogOpen(true);
  };

  const openEditExercise = (exercise: ExerciseItem) => {
    setEditingExercise(exercise);
    setExerciseForm({
      name: exercise.name,
      category: exercise.category || "",
      videoUrl: exercise.videoUrl || "",
      imageUrl: exercise.imageUrl || "",
      notes: exercise.notes || "",
    });
    setError("");
    setExerciseDialogOpen(true);
  };

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm(emptyTemplateForm);
    setTemplateExerciseSearch("");
    setError("");
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setTemplateForm({ name: template.name, notes: template.notes || "" });
    setTemplateExerciseSearch("");
    setError("");
    setTemplateDialogOpen(true);
  };

  const sortedTemplateExercises = editingTemplate
    ? [...editingTemplate.exercises].sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  return (
    <div className="min-h-[100dvh] w-full bg-background">
      <header className="w-full border-b border-border bg-background/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/trainer")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Video className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-foreground">Bibliotheek</h1>
            <p className="text-xs text-muted-foreground">{exercises.length} oefeningen | {templates.length} templates</p>
          </div>
          <Button variant="outline" onClick={openNewTemplate} className="font-bold">
            <FileText className="h-4 w-4 mr-2" />
            Template
          </Button>
          <Button onClick={openNewExercise} className="font-bold">
            <Plus className="h-4 w-4 mr-2" />
            Oefening
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex gap-2">
          <Button variant={tab === "exercises" ? "default" : "outline"} onClick={() => setTab("exercises")} className="font-bold">
            Oefeningen
          </Button>
          <Button variant={tab === "templates" ? "default" : "outline"} onClick={() => setTab("templates")} className="font-bold">
            Templates
          </Button>
        </div>

        {tab === "exercises" ? (
          <>
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-11" placeholder="Zoek oefening" />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {["alles", ...categories].map((item) => (
                  <Button key={item} variant={category === item ? "default" : "outline"} onClick={() => setCategory(item)} className="h-11 shrink-0">
                    {item === "alles" ? "Alles" : item}
                  </Button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="text-sm text-muted-foreground">Laden...</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredExercises.map((exercise) => (
                  <ExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    onEdit={() => openEditExercise(exercise)}
                    onDelete={() => deleteExercise.mutate(exercise.id)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <div key={template.id} className="border border-border bg-card rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-black text-foreground truncate">{template.name}</h2>
                    <p className="text-xs text-muted-foreground">{template.exercises.length} oefeningen</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="icon" onClick={() => openEditTemplate(template)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Template "${template.name}" verwijderen?`)) deleteTemplate.mutate(template.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {template.notes && <p className="text-sm text-muted-foreground">{template.notes}</p>}
                <ul className="space-y-1.5">
                  {[...template.exercises].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 8).map((exercise) => (
                    <li key={exercise.id} className="text-sm flex justify-between gap-2 border-t border-border pt-1.5">
                      <span className="font-semibold truncate">{exercise.name}</span>
                      <span className="text-muted-foreground shrink-0">{exercise.sets} x {exercise.repRange || "-"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {templates.length === 0 && (
              <div className="border border-dashed border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
                Nog geen templates. Klik op <strong>Template</strong> rechtsboven om een trainingsdag-template te maken.
              </div>
            )}
          </div>
        )}
      </main>

      <Dialog open={exerciseDialogOpen} onOpenChange={setExerciseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingExercise ? "Oefening bewerken" : "Oefening toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Naam" value={exerciseForm.name} onChange={(name) => setExerciseForm((f) => ({ ...f, name }))} />
            <Field label="Categorie" value={exerciseForm.category} onChange={(category) => setExerciseForm((f) => ({ ...f, category }))} />
            <Field label="Video link" value={exerciseForm.videoUrl} onChange={(videoUrl) => setExerciseForm((f) => ({ ...f, videoUrl }))} />
            <Field label="Afbeelding link" value={exerciseForm.imageUrl} onChange={(imageUrl) => setExerciseForm((f) => ({ ...f, imageUrl }))} />
            <div className="space-y-1.5">
              <Label>Notities</Label>
              <Textarea value={exerciseForm.notes} onChange={(e) => setExerciseForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
            <Button className="w-full h-11 font-bold" onClick={() => saveExercise.mutate()} disabled={saveExercise.isPending || !exerciseForm.name.trim()}>
              {saveExercise.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Template bewerken" : "Template toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr]">
              <Field label="Template naam" value={templateForm.name} onChange={(name) => setTemplateForm((f) => ({ ...f, name }))} />
              <div className="space-y-1.5">
                <Label>Notities</Label>
                <Textarea value={templateForm.notes} onChange={(e) => setTemplateForm((f) => ({ ...f, notes: e.target.value }))} rows={1} />
              </div>
            </div>

            <Button className="h-11 font-bold" onClick={() => saveTemplate.mutate()} disabled={saveTemplate.isPending || !templateForm.name.trim()}>
              {saveTemplate.isPending ? "Opslaan..." : editingTemplate ? "Template opslaan" : "Template aanmaken"}
            </Button>

            {editingTemplate && (
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="space-y-3">
                  <div>
                    <h3 className="font-black text-sm">Oefeningen in template</h3>
                    <p className="text-xs text-muted-foreground">Pas sets, reprange, RPE en notities direct aan.</p>
                  </div>
                  <div className="space-y-2">
                    {sortedTemplateExercises.map((exercise) => (
                      <TemplateExerciseRow
                        key={exercise.id}
                        exercise={exercise}
                        onUpdate={(values) => updateTemplateExercise.mutate({ exercise, values })}
                        onDelete={() => deleteTemplateExercise.mutate(exercise)}
                      />
                    ))}
                    {sortedTemplateExercises.length === 0 && (
                      <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                        Nog geen oefeningen in deze template.
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="font-black text-sm">Oefening toevoegen</h3>
                    <p className="text-xs text-muted-foreground">Kies uit de bibliotheek.</p>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={templateExerciseSearch}
                      onChange={(e) => setTemplateExerciseSearch(e.target.value)}
                      className="pl-10 h-10"
                      placeholder="Zoek oefening"
                    />
                  </div>
                  <div className="max-h-80 overflow-y-auto border border-border rounded-md divide-y divide-border">
                    {filteredTemplateExercises.map((exercise) => (
                      <button
                        key={exercise.id}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent flex justify-between gap-3"
                        onClick={() => addExerciseToTemplate.mutate(exercise)}
                      >
                        <span className="font-semibold text-sm truncate">{exercise.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{exercise.category || "Geen categorie"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExerciseCard({ exercise, onEdit, onDelete }: { exercise: ExerciseItem; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="border border-border bg-card rounded-lg overflow-hidden">
      <div className="aspect-video bg-secondary">
        {exercise.imageUrl ? (
          <img src={exercise.imageUrl} alt={exercise.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Video className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div className="min-w-0">
          <h2 className="font-black text-foreground truncate">{exercise.name}</h2>
          <p className="text-xs text-muted-foreground">{exercise.category || "Geen categorie"}</p>
        </div>
        <div className="flex gap-2">
          {exercise.videoUrl && (
            <Button variant="outline" size="icon" asChild>
              <a href={exercise.videoUrl} target="_blank" rel="noopener noreferrer" aria-label="Open video">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplateExerciseRow({
  exercise,
  onUpdate,
  onDelete,
}: {
  exercise: TemplateExercise;
  onUpdate: (values: Partial<TemplateExercise>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{exercise.name}</p>
          <p className="text-xs text-muted-foreground">{exercise.notes || "Geen notities"}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <InlineField label="Sets" defaultValue={String(exercise.sets || "")} type="number" onCommit={(value) => onUpdate({ sets: Number(value) || 0 })} />
        <InlineField label="Reprange" defaultValue={exercise.repRange || ""} onCommit={(value) => onUpdate({ repRange: value })} />
        <InlineField label="RPE" defaultValue={exercise.targetRpe || ""} type="number" onCommit={(value) => onUpdate({ targetRpe: value })} />
        <InlineField label="Notities" defaultValue={exercise.notes || ""} onCommit={(value) => onUpdate({ notes: value })} />
      </div>
    </div>
  );
}

function InlineField({
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
        className="h-9 text-sm"
        onBlur={(e) => {
          if (e.currentTarget.value !== defaultValue) onCommit(e.currentTarget.value);
        }}
      />
    </label>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
