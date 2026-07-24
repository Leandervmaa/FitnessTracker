import { Link } from "wouter";
import { useState } from "react";
import { useWeek } from "@/components/week-context";
import { useAuth } from "@/components/auth-context";
import { useListWeeks } from "@workspace/api-client-react";
import {
  Dumbbell, Book, MessageSquare, ChevronDown, Settings,
  CheckCircle2, FileSpreadsheet, Download, Camera,
  Clock, ArrowRight, Sparkles
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

const PHOTO_WEEKS = new Set([1, 4, 7, 10, 13, 16, 20, 23, 26]);

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
  const { user } = useAuth();
  const { data: weeks } = useListWeeks();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await apiFetch("/api/export/excel");
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
  const workoutsTotal = currentWeekData?.workoutsTotal ?? 0;
  const workoutsCompleted = currentWeekData?.workoutsCompleted ?? 0;
  const requiredSteps = [
    ...(workoutsTotal > 0 ? [trainingDone] : []),
    dagboekDone,
    feedbackDone,
    ...(isPhotoWeek ? [photosDone] : []),
  ];
  const completedSteps = requiredSteps.filter(Boolean).length;
  const totalSteps = Math.max(1, requiredSteps.length);
  const weekProgress = Math.round((completedSteps / totalSteps) * 100);
  const firstName = user?.displayName?.split(" ")[0] || "topper";
  const primaryAction =
    workoutsTotal > 0 && !trainingDone
      ? { href: "/trainingen", label: "Training starten", icon: <Dumbbell className="h-4 w-4" /> }
      : !dagboekDone
        ? { href: "/dagboek", label: "Eten invullen", icon: <Book className="h-4 w-4" /> }
        : !feedbackDone
          ? { href: "/feedback", label: "Feedback invullen", icon: <MessageSquare className="h-4 w-4" /> }
          : isPhotoWeek && !photosDone
            ? { href: "/progressie-fotos", label: "Foto's uploaden", icon: <Camera className="h-4 w-4" /> }
            : { href: "/trainingen", label: "Bekijk je schema", icon: <Dumbbell className="h-4 w-4" /> };
  const progressText =
    weekProgress === 100
      ? "Week compleet. Sterk werk."
      : completedSteps === 0
        ? "Vandaag is een goed moment om te beginnen."
        : "Je bent lekker bezig. Houd dit ritme vast.";

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center gap-4 p-4 pb-32 max-w-md mx-auto relative">

      <header className="w-full flex items-center gap-3 pt-1">
        <img src="/images/logo.png" alt="Bodyrebuild Logo" className="h-11 w-11 object-contain drop-shadow-sm" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Welkom {firstName}</p>
          <h1 className="text-xl font-black text-foreground truncate">Week {selectedWeek || "—"}</h1>
        </div>
        <Link href="/instellen">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Settings className="h-5 w-5" />
          </Button>
        </Link>
      </header>

      <section className="w-full rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-black text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {progressText}
            </div>
            <h2 className="mt-3 text-2xl font-black text-foreground leading-tight">
              {completedSteps} van {totalSteps} stappen klaar
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Elke check-in brengt je dichter bij je doel.</p>
          </div>
          <div className="h-16 w-16 rounded-full border-4 border-primary/20 flex items-center justify-center shrink-0">
            <span className="text-lg font-black text-primary">{weekProgress}%</span>
          </div>
        </div>
        <Link href={primaryAction.href}>
          <Button className="mt-4 h-12 w-full rounded-lg font-black">
            {primaryAction.icon}
            <span className="mx-2">{primaryAction.label}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>

      <div className="w-full flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wider text-foreground">Vandaag</h2>
        <span className="text-xs font-bold text-muted-foreground">{completedSteps}/{totalSteps} klaar</span>
      </div>

      {/* Nav cards with per-section badges */}
      <div className="w-full flex flex-col gap-3">
        <NavCard
          href="/trainingen"
          icon={<Dumbbell size={22} className="text-primary" />}
          iconBg="bg-primary/10"
          title="Trainingen"
          subtitle={workoutsTotal === 0
            ? "Geen training beschikbaar"
            : `${workoutsCompleted} van ${workoutsTotal} trainingen voltooid`}
          badge={
            <StatusBadge
              done={trainingDone}
              notRequired={workoutsTotal === 0}
              notRequiredLabel="Geen training"
              pendingLabel={`${workoutsCompleted}/${workoutsTotal}`}
            />
          }
        />

        <NavCard
          href="/dagboek"
          icon={<Book size={22} className="text-primary" />}
          iconBg="bg-primary/10"
          title="Eten"
          subtitle={dagboekDone
            ? "Deze week netjes bijgehouden"
            : `${currentWeekData?.nutritionDaysCompleted ?? 0} van 7 dagen bijgehouden`}
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


      {/* Week picker + download – compact strip above the bottom nav */}
      {weeks && selectedWeek && (
        <div className="fixed bottom-24 right-4 flex items-center gap-2 z-40">
          <Button
            variant="outline" size="icon"
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-full shadow-md bg-card border-border h-10 w-10 flex-shrink-0"
            title="Download bijgewerkt Excel"
          >
            <Download className={`h-4 w-4 text-green-600 dark:text-green-400 ${downloading ? "animate-pulse" : ""}`} />
          </Button>
          <Link href="/excel-viewer">
            <Button variant="outline" size="icon" className="rounded-full shadow-md bg-card border-border h-10 w-10 flex-shrink-0" title="Bekijk Excel schema">
              <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400" />
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="rounded-full shadow-md bg-card border-border h-10 px-3 font-semibold text-sm">
                Week {selectedWeek}
                <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
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
