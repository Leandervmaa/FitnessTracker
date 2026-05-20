import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useWeek } from "@/components/week-context";
import { useListWeeks } from "@workspace/api-client-react";
import {
  Dumbbell, Book, MessageSquare, ChevronDown, Settings,
  AlertCircle, CheckCircle2, FileSpreadsheet, Download, Camera,
  Clock
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const PHOTO_WEEKS = new Set([1, 4, 7, 10, 13, 16, 20, 23, 26]);

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

// ─── Status badge component ───────────────────────────────────────────────────

function StatusBadge({
  done,
  notRequired,
  notRequiredLabel,
  pendingLabel,
}: {
  done: boolean;
  notRequired?: boolean;
  notRequiredLabel?: string;
  pendingLabel?: string;
}) {
  if (notRequired) {
    return (
      <span className="text-[10px] font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
        {notRequiredLabel ?? "Niet vereist"}
      </span>
    );
  }
  if (done) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="h-3 w-3" /> Klaar
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
      <Clock className="h-3 w-3" /> {pendingLabel ?? "Bezig"}
    </span>
  );
}

// ─── Nav card ────────────────────────────────────────────────────────────────

function NavCard({
  href,
  icon,
  iconBg,
  title,
  subtitle,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <Link href={href} className="w-full">
      <div className="w-full bg-card border border-border rounded-xl p-5 flex items-center shadow-sm hover-elevate transition-all cursor-pointer gap-4">
        <div className={`h-12 w-12 ${iconBg} rounded-lg flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-card-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
    </Link>
  );
}

// ─── Home page ────────────────────────────────────────────────────────────────

export default function Home() {
  const { selectedWeek, setSelectedWeek } = useWeek();
  const { data: weeks } = useListWeeks();
  const dataStatus = useDataStatus();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/export/excel");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] || "FitnessTracker_Export.xlsx";
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  // Current week data
  const currentWeekData = weeks?.find(w => w.weekNumber === selectedWeek) as any | undefined;

  const isPhotoWeek = selectedWeek ? PHOTO_WEEKS.has(selectedWeek) : false;

  // Per-section status for current week
  const trainingDone  = currentWeekData?.trainingComplete  ?? false;
  const dagboekDone   = currentWeekData?.dagboekComplete   ?? false;
  const feedbackDone  = currentWeekData?.feedbackCompleted ?? false;
  const photosDone    = currentWeekData?.photosComplete    ?? false;

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center p-6 pb-24 max-w-md mx-auto relative">

      {/* Settings */}
      <div className="w-full flex justify-end mb-2 -mt-1">
        <Link href="/instellen">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Settings className="h-5 w-5" />
          </Button>
        </Link>
      </div>

      {/* Data source banner */}
      {dataStatus && (
        <Link href="/instellen" className="w-full mb-4">
          <div className={`w-full rounded-lg px-4 py-2.5 flex items-center gap-2.5 text-sm cursor-pointer transition-opacity hover:opacity-80 ${
            dataStatus.source === "excel"
              ? "bg-green-50 border border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
              : "bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
          }`}>
            {dataStatus.source === "excel"
              ? <CheckCircle2 className="h-4 w-4 shrink-0" />
              : <AlertCircle  className="h-4 w-4 shrink-0" />}
            <span className="font-medium">
              {dataStatus.source === "excel"
                ? `Excel geladen — ${dataStatus.weeksLoaded} weken`
                : "Demodata actief — upload Excel voor echte data"}
            </span>
          </div>
        </Link>
      )}

      {/* Logo + title */}
      <div className="mt-4 mb-8 flex flex-col items-center">
        <img src="/images/logo.png" alt="Bodyrebuild Logo" className="h-20 w-20 object-contain mb-4 drop-shadow-md" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Mijn Fitness Tracker</h1>
        {selectedWeek && currentWeekData && (
          <span className={`mt-2 text-xs font-semibold px-3 py-1 rounded-full border ${
            currentWeekData.isComplete
              ? "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
              : "bg-secondary border-border text-muted-foreground"
          }`}>
            {currentWeekData.isComplete ? "✓ Week compleet" : `Week ${selectedWeek} — bezig`}
          </span>
        )}
      </div>

      {/* Nav cards with per-section badges */}
      <div className="w-full flex flex-col gap-3">
        <NavCard
          href="/trainingen"
          icon={<Dumbbell size={22} className="text-primary" />}
          iconBg="bg-primary/10"
          title="Trainingen"
          subtitle={trainingDone
            ? `${currentWeekData?.workoutsCompleted ?? 4} van 4 workouts voltooid`
            : `${currentWeekData?.workoutsCompleted ?? 0} van 4 workouts voltooid`}
          badge={<StatusBadge done={trainingDone} pendingLabel={`${currentWeekData?.workoutsCompleted ?? 0}/4`} />}
        />

        <NavCard
          href="/dagboek"
          icon={<Book size={22} className="text-primary" />}
          iconBg="bg-primary/10"
          title="Dagboek"
          subtitle={dagboekDone
            ? "Alle 7 dagen ingevuld"
            : `${currentWeekData?.nutritionDaysCompleted ?? 0} van 7 dagen ingevuld`}
          badge={<StatusBadge done={dagboekDone} pendingLabel={`${currentWeekData?.nutritionDaysCompleted ?? 0}/7`} />}
        />

        <NavCard
          href="/progressie-fotos"
          icon={<Camera size={22} className="text-purple-600 dark:text-purple-400" />}
          iconBg="bg-purple-500/10"
          title="Progressie foto's"
          subtitle={!isPhotoWeek
            ? "Geen foto nodig deze week"
            : photosDone
              ? "Alle 3 foto's geüpload"
              : "Voor-, zij- en achterkantfoto vereist"}
          badge={
            <StatusBadge
              done={photosDone}
              notRequired={!isPhotoWeek}
              notRequiredLabel="Geen foto nodig"
              pendingLabel="Upload foto's"
            />
          }
        />

        <NavCard
          href="/feedback"
          icon={<MessageSquare size={22} className="text-primary" />}
          iconBg="bg-primary/10"
          title="Feedback"
          subtitle={feedbackDone ? "Wekelijkse reflectie ingevuld" : "Wekelijkse reflectie invullen"}
          badge={<StatusBadge done={feedbackDone} pendingLabel="Invullen" />}
        />
      </div>

      {/* Bottom bar: week picker + download */}
      {weeks && selectedWeek && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2">
          <Button
            variant="outline" size="icon"
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-full shadow-md bg-card border-border h-12 w-12 flex-shrink-0"
            title="Download bijgewerkt Excel"
          >
            <Download className={`h-5 w-5 text-green-600 dark:text-green-400 ${downloading ? "animate-pulse" : ""}`} />
          </Button>
          <Link href="/excel-viewer">
            <Button variant="outline" size="icon" className="rounded-full shadow-md bg-card border-border h-12 w-12 flex-shrink-0" title="Bekijk Excel schema">
              <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />
            </Button>
          </Link>
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
                  {(week as any).isComplete && <span className="text-primary text-xs">✓ Klaar</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
