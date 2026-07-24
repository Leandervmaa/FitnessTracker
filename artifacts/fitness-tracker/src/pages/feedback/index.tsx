import { useState, useEffect } from "react";
import { useWeek } from "@/components/week-context";
import { WeekSelector } from "@/components/week-selector";
import { 
  useGetFeedbackQuestions, 
  useGetFeedbackAnswers,
  useSaveFeedbackAnswer,
  getGetFeedbackAnswersQueryKey
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, MessageSquare, ArrowRight, Check, Eye, PenLine, PlayCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { getVideoHostLabel, VideoThumbnail } from "@/components/video-thumbnail";

type FeedbackMode = "menu" | "view" | "answer";

type TrainerFeedback = {
  id: number;
  weekNumber: number;
  title: string;
  body: string;
  videoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function FeedbackList() {
  const { selectedWeek } = useWeek();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<FeedbackMode>("menu");
  const [currentStep, setCurrentStep] = useState(0);
  const [answer, setAnswer] = useState("");
  const [isFinished, setIsFinished] = useState(false);

  const { data: questions, isLoading: qLoading } = useGetFeedbackQuestions();
  const { data: answers, isLoading: aLoading } = useGetFeedbackAnswers(
    { weekNumber: selectedWeek || 0 },
    { query: { queryKey: getGetFeedbackAnswersQueryKey({ weekNumber: selectedWeek || 0 }), enabled: !!selectedWeek && mode === "answer" } }
  );
  const { data: trainerFeedback = [], isLoading: trainerFeedbackLoading } = useQuery<TrainerFeedback[]>({
    queryKey: ["trainer-feedback"],
    enabled: mode === "view",
    queryFn: async () => {
      const res = await apiFetch("/api/feedback/trainer");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const saveAnswer = useSaveFeedbackAnswer();

  const currentQuestion = questions?.[currentStep];
  const existingAnswer = answers?.find(a => a.questionId === currentQuestion?.id);
  const selectedWeekFeedback = trainerFeedback.filter((item) => item.weekNumber === selectedWeek);
  const otherTrainerFeedback = trainerFeedback.filter((item) => item.weekNumber !== selectedWeek);

  useEffect(() => {
    if (existingAnswer) {
      setAnswer(existingAnswer.answer);
    } else {
      setAnswer("");
    }
  }, [currentStep, existingAnswer, currentQuestion]);

  if (mode === "menu") {
    return (
      <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center max-w-md mx-auto">
        <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="mr-2">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">Feedback</h1>
          </div>
          <WeekSelector />
        </header>

        <main className="w-full p-6 flex flex-col gap-4 client-page-end-space">
          <Button
            variant="outline"
            onClick={() => setMode("view")}
            className="h-auto min-h-20 rounded-xl justify-start gap-4 p-5 text-left"
          >
            <span className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Eye className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-black text-foreground">Feedback bekijken</span>
              <span className="block text-sm text-muted-foreground whitespace-normal">Video's van je trainer</span>
            </span>
          </Button>

          <Button
            onClick={() => {
              setCurrentStep(0);
              setIsFinished(false);
              setMode("answer");
            }}
            className="h-auto min-h-20 rounded-xl justify-start gap-4 p-5 text-left"
          >
            <span className="h-11 w-11 rounded-lg bg-primary-foreground/15 text-primary-foreground flex items-center justify-center shrink-0">
              <PenLine className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-black">Feedback achterlaten</span>
              <span className="block text-sm opacity-85 whitespace-normal">Vragenlijst van week {selectedWeek}</span>
            </span>
          </Button>
        </main>
      </div>
    );
  }

  if (mode === "view") {
    return (
      <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center max-w-md mx-auto">
        <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
          <Button variant="ghost" size="icon" onClick={() => setMode("menu")} className="mr-2">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">Feedback bekijken</h1>
          </div>
          <WeekSelector />
        </header>

        <main className="w-full p-6 flex flex-col gap-3 client-page-end-space">
          {trainerFeedbackLoading ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : trainerFeedback.length > 0 ? (
            <>
              {selectedWeekFeedback.length > 0 && (
                <section className="space-y-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-primary">Deze week</p>
                    <h2 className="text-lg font-black text-foreground">Feedback voor week {selectedWeek}</h2>
                  </div>
                  {selectedWeekFeedback.map((item) => <TrainerFeedbackCard key={item.id} item={item} />)}
                </section>
              )}

              {(selectedWeekFeedback.length === 0 || otherTrainerFeedback.length > 0) && (
                <section className="space-y-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Alle feedback</p>
                    <h2 className="text-lg font-black text-foreground">Berichten van je trainer</h2>
                  </div>
                  {(selectedWeekFeedback.length > 0 ? otherTrainerFeedback : trainerFeedback).map((item) => (
                    <TrainerFeedbackCard key={item.id} item={item} />
                  ))}
                </section>
              )}
            </>
          ) : (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm text-center">
              <PlayCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-bold text-foreground">Nog geen feedback van je trainer</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  if (qLoading || aLoading) {
    return <div className="min-h-[100dvh] flex p-6"><Skeleton className="w-full h-48 rounded-xl" /></div>;
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center max-w-md mx-auto">
        <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
          <Button variant="ghost" size="icon" onClick={() => setMode("menu")} className="mr-2">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-xl font-bold text-foreground flex-1">Feedback achterlaten</h1>
          <WeekSelector />
        </header>
        <main className="w-full p-6 client-page-end-space">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-bold text-foreground">Geen vragen beschikbaar</p>
          </div>
        </main>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center client-page-end-space">
        <div className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <MessageSquare className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Feedback Opgeslagen</h1>
        <p className="text-muted-foreground mb-8">Dankjewel voor je wekelijkse reflectie. Goed gedaan!</p>
        <Button onClick={() => setMode("menu")} className="w-full py-6 text-lg rounded-xl font-bold">
          Terug naar feedback
        </Button>
      </div>
    );
  }

  const handleNext = () => {
    if (!selectedWeek || !currentQuestion || !answer.trim()) return;

    saveAnswer.mutate({
      data: {
        weekNumber: selectedWeek,
        questionId: currentQuestion.id,
        answer: answer.trim()
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetFeedbackAnswersQueryKey({ weekNumber: selectedWeek }) });
        queryClient.invalidateQueries({ queryKey: ["weeks"] });
        queryClient.invalidateQueries({ queryKey: ["current-week"] });
        queryClient.invalidateQueries({ queryKey: ["/api/weeks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/weeks/current"] });
        
        if (currentStep < questions.length - 1) {
          setCurrentStep(prev => prev + 1);
        } else {
          setIsFinished(true);
        }
      }
    });
  };

  const progress = ((currentStep) / questions.length) * 100;

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center max-w-md mx-auto">
      <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" onClick={() => setMode("menu")} className="mr-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Feedback achterlaten</h1>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Vraag {currentStep + 1} van {questions.length}</p>
        </div>
        <WeekSelector />
      </header>

      <Progress value={progress} className="h-1 w-full rounded-none bg-secondary" />

      <main className="w-full p-6 flex flex-col flex-1 client-deep-end-space">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex-1 flex flex-col">
          <h2 className="text-2xl font-bold text-foreground mb-6 leading-tight">
            {currentQuestion?.question}
          </h2>

          <Textarea 
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            className="flex-1 min-h-[200px] text-lg p-4 resize-none bg-background focus-visible:ring-1"
            placeholder="Typ je antwoord hier..."
            autoFocus
          />
        </div>
      </main>

      <div className="fixed client-fixed-action left-0 w-full p-4 bg-background border-t border-border z-20 flex justify-center">
        <div className="w-full max-w-md">
          <Button 
            onClick={handleNext} 
            className="w-full h-14 rounded-xl text-lg font-bold shadow-lg"
            disabled={saveAnswer.isPending || !answer.trim()}
          >
            {saveAnswer.isPending ? (
              <div className="w-6 h-6 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin mr-2"></div>
            ) : currentStep === questions.length - 1 ? (
              <>Opslaan <Check className="ml-2 w-5 h-5" /></>
            ) : (
              <>Volgende <ArrowRight className="ml-2 w-5 h-5" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TrainerFeedbackCard({ item }: { item: TrainerFeedback }) {
  const hasVideo = !!item.videoUrl;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {hasVideo && (
        <a href={item.videoUrl!} target="_blank" rel="noreferrer" className="block">
          <VideoThumbnail videoUrl={item.videoUrl} title={item.title} className="rounded-none border-0 border-b" />
        </a>
      )}
      <div className="space-y-3 p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-primary">Week {item.weekNumber}</p>
          <h3 className="mt-1 text-base font-black text-foreground">{item.title}</h3>
        </div>
        {item.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{item.body}</p>}
        {hasVideo && (
          <a
            href={item.videoUrl!}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center text-sm font-black text-primary"
          >
            Bekijk op {getVideoHostLabel(item.videoUrl)}
            <ExternalLink className="ml-1.5 h-4 w-4" />
          </a>
        )}
      </div>
    </article>
  );
}
