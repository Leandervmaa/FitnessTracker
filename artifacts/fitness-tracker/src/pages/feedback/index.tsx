import { useState, useEffect } from "react";
import { useWeek } from "@/components/week-context";
import { WeekSelector } from "@/components/week-selector";
import { 
  useGetFeedbackQuestions, 
  useGetFeedbackAnswers,
  useSaveFeedbackAnswer,
  getGetFeedbackAnswersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, MessageSquare, ArrowRight, Check, Eye, PenLine, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

type FeedbackMode = "menu" | "view" | "answer";

const TRAINER_FEEDBACK_VIDEOS: { title: string; url: string; description?: string }[] = [];

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

  const saveAnswer = useSaveFeedbackAnswer();

  const currentQuestion = questions?.[currentStep];
  const existingAnswer = answers?.find(a => a.questionId === currentQuestion?.id);

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

        <main className="w-full p-6 flex flex-col gap-4 pb-24">
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

        <main className="w-full p-6 flex flex-col gap-3 pb-24">
          {TRAINER_FEEDBACK_VIDEOS.length > 0 ? (
            TRAINER_FEEDBACK_VIDEOS.map((video) => (
              <a
                key={video.url}
                href={video.url}
                target="_blank"
                rel="noreferrer"
                className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center gap-3"
              >
                <span className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <PlayCircle className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-foreground truncate">{video.title}</span>
                  {video.description && <span className="block text-sm text-muted-foreground">{video.description}</span>}
                </span>
              </a>
            ))
          ) : (
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm text-center">
              <PlayCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-bold text-foreground">Nog geen video's beschikbaar</p>
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
        <main className="w-full p-6 pb-24">
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
      <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center justify-center p-6 max-w-md mx-auto text-center">
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

      <main className="w-full p-6 flex flex-col flex-1 pb-24">
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

      <div className="fixed bottom-0 left-0 w-full p-4 bg-background border-t border-border z-20 flex justify-center">
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
