import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Camera, Trash2, SplitSquareHorizontal,
  Plus, X, CheckCircle2, ArrowLeftRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// Weeks where progress photos are taken
const PHOTO_WEEKS = [1, 4, 7, 10, 13, 16, 20, 23, 26];
const ANGLES = [
  { id: "front", label: "Voorkant", emoji: "⬆" },
  { id: "side",  label: "Zijkant",  emoji: "➡" },
  { id: "back",  label: "Achterkant", emoji: "⬇" },
] as const;
type Angle = "front" | "side" | "back";

interface Photo {
  id: number;
  weekNumber: number;
  angle: Angle;
  filename: string;
  mimeType: string;
  uploadedAt: string;
}

function photoUrl(filename: string) {
  return `/api/progress-photos/file/${encodeURIComponent(filename)}`;
}

function useAllPhotos() {
  return useQuery<Photo[]>({
    queryKey: ["progress-photos"],
    queryFn: async () => {
      const res = await fetch("/api/progress-photos");
      if (!res.ok) throw new Error("Failed to fetch photos");
      return res.json();
    },
    staleTime: 30_000,
  });
}

function useUploadPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weekNumber, angle, file }: { weekNumber: number; angle: Angle; file: File }) => {
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("weekNumber", String(weekNumber));
      fd.append("angle", angle);
      const res = await fetch("/api/progress-photos", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error || "Upload mislukt");
      return res.json() as Promise<Photo>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["progress-photos"] }),
  });
}

function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/progress-photos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Verwijderen mislukt");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["progress-photos"] }),
  });
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type View = "list" | "compare";

export default function ProgressieFotosPage() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState<View>("list");
  const [compareA, setCompareA] = useState<number>(1);
  const [compareB, setCompareB] = useState<number>(4);

  const { data: photos = [] } = useAllPhotos();

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center max-w-md mx-auto">
      <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="mr-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1 flex items-center gap-2">
          <Camera className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Progressie foto's</h1>
        </div>
        {/* View toggle */}
        <div className="flex bg-secondary rounded-lg p-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("list")}
            className={`h-8 px-3 rounded-md text-xs font-bold transition-all ${view === "list" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"}`}
          >
            Lijst
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("compare")}
            className={`h-8 px-3 rounded-md text-xs font-bold transition-all ${view === "compare" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground"}`}
          >
            <ArrowLeftRight className="h-3.5 w-3.5 mr-1" />
            Vergelijk
          </Button>
        </div>
      </header>

      {view === "list" ? (
        <ListView photos={photos} />
      ) : (
        <CompareView
          photos={photos}
          weekA={compareA}
          weekB={compareB}
          onChangeA={setCompareA}
          onChangeB={setCompareB}
        />
      )}
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ photos }: { photos: Photo[] }) {
  const photoMap = new Map<string, Photo>();
  for (const p of photos) photoMap.set(`${p.weekNumber}-${p.angle}`, p);

  return (
    <div className="w-full p-4 space-y-4">
      {PHOTO_WEEKS.map(week => (
        <WeekCard key={week} weekNumber={week} photoMap={photoMap} />
      ))}
    </div>
  );
}

function WeekCard({ weekNumber, photoMap }: { weekNumber: number; photoMap: Map<string, Photo> }) {
  const allFilled = ANGLES.every(a => photoMap.has(`${weekNumber}-${a.id}`));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center px-4 py-3 border-b border-border/60">
        <div className="flex-1">
          <h2 className="font-bold text-foreground">Week {weekNumber}</h2>
        </div>
        {allFilled && (
          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Compleet
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 divide-x divide-border">
        {ANGLES.map(angle => (
          <PhotoSlot
            key={angle.id}
            weekNumber={weekNumber}
            angle={angle.id}
            label={angle.label}
            photo={photoMap.get(`${weekNumber}-${angle.id}`) ?? null}
          />
        ))}
      </div>
    </div>
  );
}

function PhotoSlot({ weekNumber, angle, label, photo }: {
  weekNumber: number;
  angle: Angle;
  label: string;
  photo: Photo | null;
}) {
  const { toast } = useToast();
  const uploadMutation = useUploadPhoto();
  const deleteMutation = useDeletePhoto();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadMutation.mutateAsync({ weekNumber, angle, file });
      toast({ title: "Foto toegevoegd ✓" });
    } catch (err: any) {
      toast({ title: "Upload mislukt", description: err.message, variant: "destructive" });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!photo) return;
    try {
      await deleteMutation.mutateAsync(photo.id);
      toast({ title: "Foto verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  };

  const isLoading = uploadMutation.isPending || deleteMutation.isPending;

  return (
    <div className="flex flex-col items-center">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />

      {photo ? (
        <div className="relative w-full group">
          <img
            src={photoUrl(photo.filename)}
            alt={`Week ${weekNumber} ${label}`}
            className="w-full aspect-[3/4] object-cover"
          />
          {/* Overlay on hover/tap */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="bg-white/20 hover:bg-white/30 rounded-lg px-2 py-1 text-white text-xs font-bold flex items-center gap-1"
              disabled={isLoading}
            >
              <Camera className="h-3 w-3" /> Vervangen
            </button>
            <button
              onClick={handleDelete}
              className="bg-red-500/80 hover:bg-red-500 rounded-lg px-2 py-1 text-white text-xs font-bold flex items-center gap-1"
              disabled={isLoading}
            >
              <Trash2 className="h-3 w-3" /> Verwijderen
            </button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-1">
            <span className="text-white text-[9px] font-bold">{label}</span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={isLoading}
          className="w-full aspect-[3/4] flex flex-col items-center justify-center gap-1 bg-secondary/40 hover:bg-secondary/70 active:bg-secondary transition-colors cursor-pointer"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Plus className="h-5 w-5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-semibold text-center px-1">{label}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Compare View ─────────────────────────────────────────────────────────────

function CompareView({ photos, weekA, weekB, onChangeA, onChangeB }: {
  photos: Photo[];
  weekA: number;
  weekB: number;
  onChangeA: (w: number) => void;
  onChangeB: (w: number) => void;
}) {
  const photoMap = new Map<string, Photo>();
  for (const p of photos) photoMap.set(`${p.weekNumber}-${p.angle}`, p);

  // Ensure weekA is always the lower number
  const low = Math.min(weekA, weekB);
  const high = Math.max(weekA, weekB);

  return (
    <div className="w-full flex flex-col p-4 gap-4">
      {/* Week selectors */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Week A (links)</label>
          <select
            value={weekA}
            onChange={e => onChangeA(parseInt(e.target.value))}
            className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground"
          >
            {PHOTO_WEEKS.map(w => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Week B (rechts)</label>
          <select
            value={weekB}
            onChange={e => onChangeB(parseInt(e.target.value))}
            className="w-full h-10 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground"
          >
            {PHOTO_WEEKS.map(w => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </div>
      </div>

      {low === high && (
        <div className="text-center text-sm text-muted-foreground py-4">
          Selecteer twee verschillende weken om te vergelijken.
        </div>
      )}

      {low !== high && (
        <>
          {/* Header row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-primary/10 border border-primary/20 rounded-lg py-2 text-center">
              <span className="text-sm font-black text-primary">Week {low}</span>
            </div>
            <div className="bg-secondary border border-border rounded-lg py-2 text-center">
              <span className="text-sm font-black text-foreground">Week {high}</span>
            </div>
          </div>

          {/* 2×3 photo grid */}
          {ANGLES.map(angle => (
            <div key={angle.id} className="space-y-1">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
                {angle.label}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[low, high].map(week => {
                  const photo = photoMap.get(`${week}-${angle.id}`);
                  return (
                    <div key={week} className="relative rounded-xl overflow-hidden border border-border bg-secondary/30 aspect-[3/4]">
                      {photo ? (
                        <img
                          src={photoUrl(photo.filename)}
                          alt={`Week ${week} ${angle.label}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="text-center">
                            <Camera className="h-6 w-6 text-muted-foreground/40 mx-auto mb-1" />
                            <span className="text-[10px] text-muted-foreground/60">Geen foto</span>
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5">
                        <span className="text-white text-[10px] font-bold">Week {week}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
