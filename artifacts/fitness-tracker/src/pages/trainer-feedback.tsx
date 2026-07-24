import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ExternalLink, MessageSquare, Pencil, Save, Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WeekSelector } from "@/components/week-selector";
import { useWeek } from "@/components/week-context";
import { useClient } from "@/components/client-context";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { getVideoHostLabel, VideoThumbnail } from "@/components/video-thumbnail";

type TrainerFeedback = {
  id: number;
  clientId: string;
  weekNumber: number;
  title: string;
  body: string;
  videoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

function videoHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export default function TrainerFeedbackPage() {
  const [, setLocation] = useLocation();
  const { selectedWeek, setSelectedWeek } = useWeek();
  const { activeClientId } = useClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [body, setBody] = useState("");

  const { data: feedback = [], isLoading } = useQuery<TrainerFeedback[]>({
    queryKey: ["trainer-feedback", activeClientId],
    enabled: !!activeClientId,
    queryFn: async () => {
      const res = await apiFetch("/api/feedback/trainer");
      if (!res.ok) throw new Error("Coach-feedback ophalen mislukt");
      return res.json();
    },
  });

  const currentFeedback = useMemo(
    () => feedback.find((item) => item.weekNumber === selectedWeek) ?? null,
    [feedback, selectedWeek],
  );

  useEffect(() => {
    setTitle(currentFeedback?.title ?? "");
    setVideoUrl(currentFeedback?.videoUrl ?? "");
    setBody(currentFeedback?.body ?? "");
  }, [currentFeedback?.id, selectedWeek]);

  const saveFeedback = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/feedback/trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekNumber: selectedWeek,
          title,
          videoUrl,
          body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Opslaan mislukt");
      return data as TrainerFeedback;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer-feedback"] });
      toast({ title: "Feedback opgeslagen", description: `Week ${selectedWeek} is bijgewerkt.` });
    },
    onError: (err) => {
      toast({ title: "Opslaan mislukt", description: err.message, variant: "destructive" });
    },
  });

  const deleteFeedback = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/feedback/trainer/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Verwijderen mislukt");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trainer-feedback"] });
      toast({ title: "Feedback verwijderd" });
    },
    onError: (err) => {
      toast({ title: "Verwijderen mislukt", description: err.message, variant: "destructive" });
    },
  });

  const canSave = !!selectedWeek && !!title.trim() && (!!body.trim() || !!videoUrl.trim());

  if (!activeClientId) {
    return (
      <div className="min-h-[100dvh] w-full bg-background trainer-page-end-space">
        <main className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center p-6 text-center">
          <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="text-2xl font-black text-foreground">Kies eerst een klant</h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Coach-feedback wordt altijd aan een specifieke klant en week gekoppeld.
          </p>
          <Button className="mt-5 font-bold" onClick={() => setLocation("/trainer")}>
            Naar klantenoverzicht
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 p-4 md:p-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/trainer")} className="lg:hidden">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black text-foreground">Coach-feedback</h1>
              <p className="text-sm text-muted-foreground">Plaats per week een bericht, video of beide voor de klant.</p>
            </div>
          </div>
          <WeekSelector />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_380px] trainer-page-end-space">
        <section className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-primary">Week {selectedWeek ?? "-"}</p>
                <h2 className="text-xl font-black text-foreground">
                  {currentFeedback ? "Feedback bijwerken" : "Feedback toevoegen"}
                </h2>
              </div>
              {currentFeedback && (
                <Button
                  variant="outline"
                  className="font-bold text-destructive hover:text-destructive"
                  disabled={deleteFeedback.isPending}
                  onClick={() => {
                    if (confirm(`Feedback voor week ${currentFeedback.weekNumber} verwijderen?`)) {
                      deleteFeedback.mutate(currentFeedback.id);
                    }
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Verwijderen
                </Button>
              )}
            </div>

            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label>Titel</Label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Bijvoorbeeld: Techniek squat en focus voor week 6"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Video link</Label>
                <Input
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  placeholder="YouTube of Loom link"
                />
              </div>

              {videoUrl.trim() && (
                <a href={videoHref(videoUrl.trim())} target="_blank" rel="noreferrer" className="block max-w-lg">
                  <VideoThumbnail videoUrl={videoUrl} title={title || "Video preview"} />
                </a>
              )}

              <div className="space-y-1.5">
                <Label>Feedback tekst</Label>
                <Textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Schrijf hier wat de klant deze week moet meenemen..."
                  className="min-h-48 resize-y"
                />
              </div>

              <Button
                className="h-12 w-full font-black md:w-auto"
                disabled={!canSave || saveFeedback.isPending}
                onClick={() => saveFeedback.mutate()}
              >
                <Save className="mr-2 h-4 w-4" />
                {saveFeedback.isPending ? "Opslaan..." : "Feedback opslaan"}
              </Button>
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wider text-foreground">Alle feedback</h2>
            <p className="mt-1 text-xs text-muted-foreground">De klant ziet deze lijst met titel en weeknummer.</p>
          </div>

          <div className="max-h-[calc(100dvh-13rem)] space-y-3 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="rounded-lg border border-border bg-card p-4 text-sm font-semibold text-muted-foreground">
                Feedback laden...
              </div>
            ) : feedback.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card p-5 text-center">
                <MessageSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-bold text-foreground">Nog geen coach-feedback</p>
              </div>
            ) : (
              feedback.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedWeek(item.weekNumber)}
                  className={`w-full rounded-lg border p-4 text-left transition-colors ${
                    item.weekNumber === selectedWeek
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      Week {item.weekNumber}
                    </span>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="font-black text-foreground">{item.title}</p>
                  {item.videoUrl && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-bold text-primary">
                      <Video className="h-3.5 w-3.5" />
                      {getVideoHostLabel(item.videoUrl)}
                    </p>
                  )}
                  {item.body && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{item.body}</p>}
                  {item.videoUrl && (
                    <a
                      href={item.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="mt-3 inline-flex items-center text-xs font-black text-primary"
                    >
                      Open video
                      <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </a>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
