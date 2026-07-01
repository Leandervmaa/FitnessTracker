import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ExternalLink, Pencil, Plus, Search, Trash2, Video } from "lucide-react";
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

const emptyForm = {
  name: "",
  category: "",
  videoUrl: "",
  imageUrl: "",
  notes: "",
};

export default function BibliotheekPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("alles");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExerciseItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  const { data: exercises = [], isLoading } = useQuery<ExerciseItem[]>({
    queryKey: ["exercise-library"],
    queryFn: async () => {
      const res = await apiFetch("/api/library/exercises");
      if (!res.ok) throw new Error("Bibliotheek ophalen mislukt");
      return res.json();
    },
  });

  const categories = useMemo(() => {
    return Array.from(new Set(exercises.map((exercise) => exercise.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "nl"));
  }, [exercises]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter((exercise) => {
      const matchesSearch = !q || [exercise.name, exercise.category, exercise.notes].some((value) => String(value || "").toLowerCase().includes(q));
      const matchesCategory = category === "alles" || exercise.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [category, exercises, search]);

  const saveExercise = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(editing ? `/api/library/exercises/${editing.id}` : "/api/library/exercises", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Opslaan mislukt");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercise-library"] });
      setDialogOpen(false);
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

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setDialogOpen(true);
  };

  const openEdit = (exercise: ExerciseItem) => {
    setEditing(exercise);
    setForm({
      name: exercise.name,
      category: exercise.category || "",
      videoUrl: exercise.videoUrl || "",
      imageUrl: exercise.imageUrl || "",
      notes: exercise.notes || "",
    });
    setError("");
    setDialogOpen(true);
  };

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
            <p className="text-xs text-muted-foreground">{exercises.length} oefeningen</p>
          </div>
          <Button onClick={openNew} className="font-bold">
            <Plus className="h-4 w-4 mr-2" />
            Oefening
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
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
            {filtered.map((exercise) => (
              <div key={exercise.id} className="border border-border bg-card rounded-lg overflow-hidden">
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
                    <Button variant="outline" size="icon" onClick={() => openEdit(exercise)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => deleteExercise.mutate(exercise.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Oefening bewerken" : "Oefening toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Naam" value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} />
            <Field label="Categorie" value={form.category} onChange={(category) => setForm((f) => ({ ...f, category }))} />
            <Field label="Video link" value={form.videoUrl} onChange={(videoUrl) => setForm((f) => ({ ...f, videoUrl }))} />
            <Field label="Afbeelding link" value={form.imageUrl} onChange={(imageUrl) => setForm((f) => ({ ...f, imageUrl }))} />
            <div className="space-y-1.5">
              <Label>Notities</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
            <Button className="w-full h-11 font-bold" onClick={() => saveExercise.mutate()} disabled={saveExercise.isPending}>
              {saveExercise.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
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
