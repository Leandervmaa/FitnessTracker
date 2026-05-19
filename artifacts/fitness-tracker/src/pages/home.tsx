import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useWeek } from "@/components/week-context";
import { useListWeeks } from "@workspace/api-client-react";
import { Dumbbell, Utensils, MessageSquare, ChevronDown, Settings, AlertCircle, CheckCircle2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface DataStatus {
  source: "excel" | "demo";
  excelFilePresent: boolean;
  weeksLoaded?: number;
}

function useDataStatus() {
  const [status, setStatus] = useState<DataStatus | null>(null);

  useEffect(() => {
    fetch("/api/data-status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  return status;
}

export default function Home() {
  const { selectedWeek, setSelectedWeek } = useWeek();
  const { data: weeks } = useListWeeks();
  const dataStatus = useDataStatus();

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center p-6 pb-24 max-w-md mx-auto relative">

      {/* Header rij met settings knop */}
      <div className="w-full flex justify-end mb-2 -mt-1">
        <Link href="/instellen">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Settings className="h-5 w-5" />
          </Button>
        </Link>
      </div>

      {/* Databron banner */}
      {dataStatus && (
        <Link href="/instellen" className="w-full mb-4">
          <div className={`w-full rounded-lg px-4 py-2.5 flex items-center gap-2.5 text-sm cursor-pointer transition-opacity hover:opacity-80 ${
            dataStatus.source === "excel"
              ? "bg-green-50 border border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
              : "bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
          }`}>
            {dataStatus.source === "excel" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="font-medium">
              {dataStatus.source === "excel"
                ? `Excel geladen — ${dataStatus.weeksLoaded} weken`
                : "Demodata actief — upload Excel voor echte data"}
            </span>
          </div>
        </Link>
      )}

      <div className="mt-4 mb-10 flex flex-col items-center">
        <img src="/images/logo.png" alt="Bodyrebuild Logo" className="h-20 w-20 object-contain mb-4 drop-shadow-md" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Mijn Fitness Tracker</h1>
      </div>

      <div className="w-full flex flex-col gap-4">
        <Link href="/trainingen" className="w-full">
          <div className="w-full bg-card border border-border rounded-xl p-6 flex items-center shadow-sm hover-elevate transition-all cursor-pointer">
            <div className="h-12 w-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mr-4">
              <Dumbbell size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-card-foreground">Trainingen</h2>
              <p className="text-sm text-muted-foreground">Bekijk en log je workouts</p>
            </div>
          </div>
        </Link>

        <Link href="/voeding" className="w-full">
          <div className="w-full bg-card border border-border rounded-xl p-6 flex items-center shadow-sm hover-elevate transition-all cursor-pointer">
            <div className="h-12 w-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mr-4">
              <Utensils size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-card-foreground">Voeding</h2>
              <p className="text-sm text-muted-foreground">Houd je macro's bij</p>
            </div>
          </div>
        </Link>

        <Link href="/feedback" className="w-full">
          <div className="w-full bg-card border border-border rounded-xl p-6 flex items-center shadow-sm hover-elevate transition-all cursor-pointer">
            <div className="h-12 w-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mr-4">
              <MessageSquare size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-card-foreground">Feedback</h2>
              <p className="text-sm text-muted-foreground">Wekelijkse reflectie</p>
            </div>
          </div>
        </Link>
      </div>

      {weeks && selectedWeek && (
        <div className="fixed bottom-6 right-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-full shadow-md bg-card border-border h-12 px-4 font-semibold">
                Week {selectedWeek}
                <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {weeks.map(week => (
                <DropdownMenuItem
                  key={week.weekNumber}
                  onClick={() => setSelectedWeek(week.weekNumber)}
                  className="font-medium flex justify-between"
                >
                  <span>Week {week.weekNumber}</span>
                  {week.isComplete && <span className="text-primary text-xs">Klaar</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
