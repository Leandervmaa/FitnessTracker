import { useState, useEffect } from "react";
import { useWeek } from "@/components/week-context";
import { WeekSelector } from "@/components/week-selector";
import { 
  useGetNutritionEntries, 
  useGetNutritionTarget,
  useCreateNutritionEntry, 
  useUpdateNutritionEntry,
  getGetNutritionEntriesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, BookOpen, Save, TrendingUp, Info, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import FoodTracker, { useFoodLogs } from "@/components/food-tracker";
import { apiFetch } from "@/lib/api";

const DAYS = [
  { id: "mon", label: "Ma", nl: "Maandag" },
  { id: "tue", label: "Di", nl: "Dinsdag" },
  { id: "wed", label: "Wo", nl: "Woensdag" },
  { id: "thu", label: "Do", nl: "Donderdag" },
  { id: "fri", label: "Vr", nl: "Vrijdag" },
  { id: "sat", label: "Za", nl: "Zaterdag" },
  { id: "sun", label: "Zo", nl: "Zondag" },
];

interface ProgressieDay {
  dagNl: string;
  dayId: string;
  gewicht: number | null;
  kcal: number | null;
  buikomvang: number | null;
  heupomvang: number | null;
  krachtniveau: number | null;
  energieniveau: number | null;
  slaap: number | null;
  stress: number | null;
  stappen: number | null;
  schouders?: number | null;
  borstLats?: number | null;
  armLinks?: number | null;
  armRechts?: number | null;
  beenLinks?: number | null;
  beenRechts?: number | null;
  kuitLinks?: number | null;
  kuitRechts?: number | null;
  heupBil?: number | null;
}

interface ProgressieWeek {
  weekNumber: number;
  days: ProgressieDay[];
  requestedFields?: string[];
}

interface AppNutritionTarget {
  dayLabel: string;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  waterMl: number | null;
}

function useProgressieWeek(weekNumber: number | undefined) {
  return useQuery<ProgressieWeek | null>({
    queryKey: ["progressie-week", weekNumber],
    queryFn: async () => {
      if (!weekNumber) return null;
      try {
        const res = await apiFetch(`/api/nutrition/progressie/${weekNumber}`);
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    enabled: !!weekNumber,
    staleTime: 60_000,
  });
}

export default function DagboekPage() {
  const { selectedWeek } = useWeek();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [activeDay, setActiveDay] = useState(DAYS[0].id);
  const [showDagboek, setShowDagboek] = useState(false);

  const { data: progressieWeek } = useProgressieWeek(selectedWeek ?? undefined);
  const { data: nutritionTarget } = useGetNutritionTarget();
  const { data: appNutritionTargets = [] } = useQuery<AppNutritionTarget[]>({
    queryKey: ["nutrition-targets"],
    queryFn: async () => {
      const res = await apiFetch("/api/plans/nutrition-targets");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: entries } = useGetNutritionEntries(
    { weekNumber: selectedWeek || 0 },
    { query: { queryKey: getGetNutritionEntriesQueryKey({ weekNumber: selectedWeek || 0 }), enabled: !!selectedWeek } }
  );

  const createEntry = useCreateNutritionEntry();
  const updateEntry = useUpdateNutritionEntry();

  const handleSave = (dayId: string, data: any) => {
    if (!selectedWeek) return;
    
    const dayInfo = DAYS.find(d => d.id === dayId);
    const entry = entries?.find(e => e.day === dayId);

    // totalKcal is computed directly in DagForm from useFoodLogs + manualKcal
    // No callback timing issues — value is reliable at click time
    const totalKcal = data.totalKcal as number;
    
    const metrics = {
      slaapUren:       data.slaapUren,
      stressNiveau:    data.stressNiveau,
      energieNiveau:   data.energieNiveau,
      krachtniveau:    data.krachtniveau,
      lichaamsgewicht: data.lichaamsgewicht,
      buikomvang:      data.buikomvang,
      heupomvang:      data.heupomvang,
      stappen:         data.stappen,
      manualKcal:      data.manualKcal > 0 ? String(data.manualKcal) : "",
      schouders:       data.schouders,
      borstLats:       data.borstLats,
      armLinks:        data.armLinks,
      armRechts:       data.armRechts,
      beenLinks:       data.beenLinks,
      beenRechts:      data.beenRechts,
      kuitLinks:       data.kuitLinks,
      kuitRechts:      data.kuitRechts,
      heupBil:         data.heupBil,
    };

    const payload = {
      weekNumber: selectedWeek,
      day: dayId,
      dayLabel: dayInfo?.nl || dayId,
      kcal:          totalKcal > 0 ? totalKcal : null,
      eiwittenG:     data.totalProteinG ?? null,
      koolhydratenG: data.totalCarbsG ?? null,
      vetenG:        data.totalFatG ?? null,
      waterMl:       null as number | null,
      notes: JSON.stringify({ metrics, text: data.notes || "" }),
    };

    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getGetNutritionEntriesQueryKey({ weekNumber: selectedWeek }) });
      queryClient.invalidateQueries({ queryKey: ["weeks"] });
      queryClient.invalidateQueries({ queryKey: ["current-week"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/weeks/current"] });
      toast({
        title: "Opgeslagen ✓",
        description: `${dayInfo?.nl} week ${selectedWeek} is opgeslagen.`,
      });
    };

    if (entry) {
      updateEntry.mutate({ id: entry.id, data: payload }, { onSuccess });
    } else {
      createEntry.mutate({ data: payload }, { onSuccess });
    }
  };

  // Weekly summary from sheet data
  const sheetDays = progressieWeek?.days || [];
  const hasSheetData = sheetDays.length > 0;

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center">
      <header className="w-full border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="w-full max-w-4xl mx-auto p-4 flex items-center">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="mr-2">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <div className="flex-1 flex items-center min-w-0">
            <UtensilsCrossed className="w-5 h-5 text-primary mr-2 shrink-0" />
            <h1 className="text-xl font-bold text-foreground truncate">Eten</h1>
          </div>
          <WeekSelector />
        </div>
      </header>

      {/* Week overview strip from sheet */}
      {hasSheetData && (
        <div className="w-full max-w-4xl px-4 pt-4">
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              Week {selectedWeek} — Gemiddelden uit spreadsheet
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(() => {
                const filled = sheetDays.filter(d => d.gewicht !== null);
                const avgGewicht = filled.length > 0 ? (filled.reduce((s, d) => s + (d.gewicht ?? 0), 0) / filled.length).toFixed(1) : "—";
                const filledKcal = sheetDays.filter(d => d.kcal !== null);
                const avgKcal = filledKcal.length > 0 ? Math.round(filledKcal.reduce((s, d) => s + (d.kcal ?? 0), 0) / filledKcal.length) : null;
                const lastBuik = [...sheetDays].reverse().find(d => d.buikomvang !== null)?.buikomvang;
                const lastHeup = [...sheetDays].reverse().find(d => d.heupomvang !== null)?.heupomvang;
                return (
                  <>
                    <div className="bg-secondary/40 border border-border/60 rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted-foreground font-bold uppercase">Gewicht</div>
                      <div className="text-sm font-black mt-0.5">{avgGewicht} kg</div>
                    </div>
                    <div className="bg-secondary/40 border border-border/60 rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted-foreground font-bold uppercase">Kcal</div>
                      <div className="text-sm font-black mt-0.5">{avgKcal ?? "—"}</div>
                    </div>
                    <div className="bg-secondary/40 border border-border/60 rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted-foreground font-bold uppercase">Buik</div>
                      <div className="text-sm font-black mt-0.5">{lastBuik ?? "—"} cm</div>
                    </div>
                    <div className="bg-secondary/40 border border-border/60 rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted-foreground font-bold uppercase">Heup</div>
                      <div className="text-sm font-black mt-0.5">{lastHeup ?? "—"} cm</div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-4xl p-4 flex flex-col client-page-end-space">
        <Tabs value={activeDay} onValueChange={setActiveDay} className="w-full">
          <TabsList className="w-full h-12 p-1 mb-6 grid grid-cols-7 bg-secondary">
            {DAYS.map(day => {
              const sheetDay = sheetDays.find(d => d.dayId === day.id);
              const dbEntry = entries?.find(e => e.day === day.id);
              return (
                <TabsTrigger 
                  key={day.id} 
                  value={day.id}
                  className="min-w-0 h-full rounded-md font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all relative"
                >
                  {day.label}
                  {dbEntry && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                  {!dbEntry && sheetDay && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {DAYS.map(day => {
            const entry = entries?.find(e => e.day === day.id);
            const sheetDay = sheetDays.find(d => d.dayId === day.id);
            const dailyTarget = appNutritionTargets[0];
            return (
              <TabsContent key={day.id} value={day.id} className="mt-0">
                <DagForm
                  day={day}
                  weekNumber={selectedWeek!}
                  entry={entry}
                  sheetDay={sheetDay ?? null}
                  targetKcal={dailyTarget?.kcal ?? nutritionTarget?.kcal ?? null}
                  targetProteinG={dailyTarget?.proteinG ?? null}
                  targetCarbsG={dailyTarget?.carbsG ?? null}
                  targetFatG={dailyTarget?.fatG ?? null}
                  onSave={(data) => handleSave(day.id, data)}
                  isSaving={createEntry.isPending || updateEntry.isPending}
                  requestedFields={progressieWeek?.requestedFields || []}
                  showDagboek={showDagboek}
                  onToggleDagboek={() => setShowDagboek((value) => !value)}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}

function parseEntry(entry: any) {
  let metrics: Record<string, string> = {};
  let notes = entry?.notes || "";
  try {
    if (notes.startsWith("{")) {
      const parsed = JSON.parse(notes);
      metrics = parsed.metrics || {};
      notes = parsed.text || "";
    }
  } catch { /* ignore */ }
  return { metrics, notes };
}

function DagForm({ day, weekNumber, entry, sheetDay, targetKcal, targetProteinG, targetCarbsG, targetFatG, onSave, isSaving, requestedFields, showDagboek, onToggleDagboek }: {
  day: { id: string; label: string; nl: string };
  weekNumber: number;
  entry?: any;
  sheetDay: any | null;
  targetKcal: number | null;
  targetProteinG: number | null;
  targetCarbsG: number | null;
  targetFatG: number | null;
  onSave: (data: any) => void;
  isSaving: boolean;
  requestedFields: string[];
  showDagboek: boolean;
  onToggleDagboek: () => void;
}) {
  const buildForm = () => {
    const { metrics, notes } = parseEntry(entry);
    return {
      lichaamsgewicht: metrics.lichaamsgewicht            || "",
      buikomvang:      metrics.buikomvang                 || "",
      heupomvang:      metrics.heupomvang                 || "",
      krachtniveau:    metrics.krachtniveau               || "",
      energieNiveau:   metrics.energieNiveau              || "",
      slaapUren:       metrics.slaapUren                  || "",
      stressNiveau:    metrics.stressNiveau               || "",
      stappen:         metrics.stappen                    || "",
      schouders:       metrics.schouders                  || "",
      borstLats:       metrics.borstLats                  || "",
      armLinks:        metrics.armLinks                   || "",
      armRechts:       metrics.armRechts                  || "",
      beenLinks:       metrics.beenLinks                  || "",
      beenRechts:      metrics.beenRechts                 || "",
      kuitLinks:       metrics.kuitLinks                  || "",
      kuitRechts:      metrics.kuitRechts                 || "",
      heupBil:         metrics.heupBil                    || "",
      notes,
    };
  };

  const [formData, setFormData] = useState(buildForm);

  useEffect(() => {
    setFormData(buildForm());
  }, [entry, sheetDay]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const hasDbEntry = !!entry;

  // ── Restore saved manual kcal from DB notes ───────────────────────────────
  const [currentManualKcal, setCurrentManualKcal] = useState<number>(() => {
    const { metrics } = parseEntry(entry);
    return parseFloat(metrics.manualKcal || "0") || 0;
  });

  useEffect(() => {
    const { metrics } = parseEntry(entry);
    setCurrentManualKcal(parseFloat(metrics.manualKcal || "0") || 0);
  }, [entry?.id]);

  // ── Load food_logs for this day directly — reliable at save time ──────────
  const { data: foodLogs = [] } = useFoodLogs(weekNumber, day.id);
  const loggedKcal = Math.round(
    foodLogs.reduce((sum, l) => sum + parseFloat(l.kcal || "0"), 0)
  );
  const loggedProteinG = Math.round(foodLogs.reduce((sum, l) => sum + parseFloat(l.eiwittenG || "0"), 0) * 10) / 10;
  const loggedCarbsG = Math.round(foodLogs.reduce((sum, l) => sum + parseFloat(l.koolhydratenG || "0"), 0) * 10) / 10;
  const loggedFatG = Math.round(foodLogs.reduce((sum, l) => sum + parseFloat(l.vetenG || "0"), 0) * 10) / 10;

  // This is the authoritative total — computed from live data, not callbacks
  const totalKcal = currentManualKcal + loggedKcal;

  // Helper: show sheet value as placeholder hint
  const ph = (val: number | null | undefined, suffix = "") =>
    val !== null && val !== undefined ? `${val}${suffix} (sheet)` : "";

  const fields = requestedFields.length > 0 ? requestedFields : [
    "gewicht", "kcal", "buikomvang", "heupomvang",
    "krachtniveau", "energieniveau", "slaap", "stress", "stappen"
  ];

  const isShown = (fieldName: string) => fields.includes(fieldName);
  const fieldCardClass = "min-w-0 space-y-1.5 rounded-lg border border-border/70 bg-background p-3";
  const inputClass = "h-12 w-full text-center font-bold";
  const inputLargeClass = "h-12 w-full text-center font-bold text-lg";
  const responsiveGridClass = "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 items-start";

  const shownLichaamsmaten = [
    isShown("gewicht") && (
      <div key="gewicht" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Gewicht (kg)</Label>
        <Input
          type="number" inputMode="decimal" name="lichaamsgewicht"
          value={formData.lichaamsgewicht} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.gewicht, " kg") || "0.0"}
        />
      </div>
    ),
    isShown("buikomvang") && (
      <div key="buik" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Buikomvang (cm)</Label>
        <Input
          type="number" inputMode="decimal" name="buikomvang"
          value={formData.buikomvang} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.buikomvang, " cm") || "0"}
        />
      </div>
    ),
    isShown("heupomvang") && (
      <div key="heup" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Heupomvang (cm)</Label>
        <Input
          type="number" inputMode="decimal" name="heupomvang"
          value={formData.heupomvang} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.heupomvang, " cm") || "0"}
        />
      </div>
    )
  ].filter(Boolean);

  const shownWellness1 = [
    isShown("energieniveau") && (
      <div key="energie" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Energieniveau (0-10)</Label>
        <Input
          type="number" inputMode="numeric" name="energieNiveau" min="0" max="10"
          value={formData.energieNiveau} onChange={handleChange}
          className={inputLargeClass}
          placeholder={ph(sheetDay?.energieniveau) || "0-10"}
        />
      </div>
    ),
    isShown("krachtniveau") && (
      <div key="kracht" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Krachtniveau (0-10)</Label>
        <Input
          type="number" inputMode="numeric" name="krachtniveau" min="0" max="10"
          value={formData.krachtniveau} onChange={handleChange}
          className={inputLargeClass}
          placeholder={ph(sheetDay?.krachtniveau) || "0-10"}
        />
      </div>
    )
  ].filter(Boolean);

  const shownWellness2 = [
    isShown("slaap") && (
      <div key="slaap" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Slaap (uren)</Label>
        <Input
          type="number" inputMode="decimal" name="slaapUren"
          value={formData.slaapUren} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.slaap, "u") || "8"}
        />
      </div>
    ),
    isShown("stress") && (
      <div key="stress" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Stress (0-10)</Label>
        <Input
          type="number" inputMode="numeric" name="stressNiveau" min="0" max="10"
          value={formData.stressNiveau} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.stress) || "0-10"}
        />
      </div>
    ),
    isShown("stappen") && (
      <div key="stappen" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Stappen</Label>
        <Input
          type="number" inputMode="numeric" name="stappen"
          value={formData.stappen} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.stappen) || "0"}
        />
      </div>
    )
  ].filter(Boolean);

  const showWellnessSection = shownWellness1.length > 0 || shownWellness2.length > 0;

  const shownCircumference = [
    isShown("schouders") && (
      <div key="schouders" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Schouders (cm)</Label>
        <Input
          type="number" inputMode="decimal" name="schouders"
          value={formData.schouders} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.schouders, " cm") || "0"}
        />
      </div>
    ),
    isShown("borstLats") && (
      <div key="borstLats" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Borst/Lats (cm)</Label>
        <Input
          type="number" inputMode="decimal" name="borstLats"
          value={formData.borstLats} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.borstLats, " cm") || "0"}
        />
      </div>
    ),
    isShown("armLinks") && (
      <div key="armLinks" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Arm links (cm)</Label>
        <Input
          type="number" inputMode="decimal" name="armLinks"
          value={formData.armLinks} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.armLinks, " cm") || "0"}
        />
      </div>
    ),
    isShown("armRechts") && (
      <div key="armRechts" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Arm rechts (cm)</Label>
        <Input
          type="number" inputMode="decimal" name="armRechts"
          value={formData.armRechts} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.armRechts, " cm") || "0"}
        />
      </div>
    ),
    isShown("beenLinks") && (
      <div key="beenLinks" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Been links (cm)</Label>
        <Input
          type="number" inputMode="decimal" name="beenLinks"
          value={formData.beenLinks} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.beenLinks, " cm") || "0"}
        />
      </div>
    ),
    isShown("beenRechts") && (
      <div key="beenRechts" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Been rechts (cm)</Label>
        <Input
          type="number" inputMode="decimal" name="beenRechts"
          value={formData.beenRechts} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.beenRechts, " cm") || "0"}
        />
      </div>
    ),
    isShown("kuitLinks") && (
      <div key="kuitLinks" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Kuit links (cm)</Label>
        <Input
          type="number" inputMode="decimal" name="kuitLinks"
          value={formData.kuitLinks} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.kuitLinks, " cm") || "0"}
        />
      </div>
    ),
    isShown("kuitRechts") && (
      <div key="kuitRechts" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Kuit rechts (cm)</Label>
        <Input
          type="number" inputMode="decimal" name="kuitRechts"
          value={formData.kuitRechts} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.kuitRechts, " cm") || "0"}
        />
      </div>
    ),
    isShown("heupBil") && (
      <div key="heupBil" className={fieldCardClass}>
        <Label className="text-xs font-semibold">Heup/Bil (cm)</Label>
        <Input
          type="number" inputMode="decimal" name="heupBil"
          value={formData.heupBil} onChange={handleChange}
          className={inputClass}
          placeholder={ph(sheetDay?.heupBil, " cm") || "0"}
        />
      </div>
    )
  ].filter(Boolean);

  const showCircumferenceSection = shownCircumference.length > 0;

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-5">

      {/* Status banner */}
      {hasDbEntry ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
          <span>Eerder ingevuld via de app — bewerk en sla opnieuw op</span>
        </div>
      ) : sheetDay ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          <Info className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span>Spreadsheet-data zichtbaar als placeholder — vul in om te bevestigen</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/40 border border-border/50 rounded-lg px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
          <span>Nog geen data voor {day.nl}</span>
        </div>
      )}

      {/* Sectie: Voeding */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Voeding</p>
        <FoodTracker
          key={`food-${day.id}-${entry?.id ?? 'new'}`}
          weekNumber={weekNumber}
          day={day.id}
          dayLabel={day.nl}
          sheetKcal={sheetDay?.kcal ?? null}
          targetKcal={targetKcal}
          targetProteinG={targetProteinG}
          targetCarbsG={targetCarbsG}
          targetFatG={targetFatG}
          savedManualKcal={currentManualKcal}
          onManualKcalChange={setCurrentManualKcal}
        />
      </div>

      <div className="flex justify-center">
        <Button
          type="button"
          variant={showDagboek ? "secondary" : "outline"}
          onClick={onToggleDagboek}
          className="w-4/5 h-11 rounded-lg font-bold"
        >
          <BookOpen className="w-4 h-4 mr-2" />
          {showDagboek ? "Dagboek verbergen" : "Dagboek"}
        </Button>
      </div>

      {showDagboek && (
        <>
          {/* Sectie: Lichaamsmaten */}
          {shownLichaamsmaten.length > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Lichaamsmaten</p>
              <div className={responsiveGridClass}>
                {shownLichaamsmaten}
              </div>
            </div>
          )}

          {/* Sectie: Welzijn */}
          {showWellnessSection && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Welzijn &amp; Prestatie</p>
              <div className={responsiveGridClass}>
                {shownWellness1}
                {shownWellness2}
              </div>
            </div>
          )}

          {/* Sectie: Omvangsmaten */}
          {showCircumferenceSection && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Omvangsmaten</p>
              <div className={responsiveGridClass}>
                {shownCircumference}
              </div>
            </div>
          )}

          {/* Notities */}
          <div className={fieldCardClass}>
            <Label className="text-xs font-semibold">Notities</Label>
            <Textarea
              name="notes" value={formData.notes} onChange={handleChange}
              className="min-h-24 resize-none" placeholder="Bijv. voelde me moe, spierpijn..."
            />
          </div>
        </>
      )}

      <Button
        className="w-full h-12 font-bold rounded-lg"
        onClick={() => onSave({ ...formData, totalKcal, totalProteinG: loggedProteinG, totalCarbsG: loggedCarbsG, totalFatG: loggedFatG, manualKcal: currentManualKcal })}
        disabled={isSaving}
      >
        <Save className="w-5 h-5 mr-2" /> {showDagboek ? "Opslaan" : "Eten opslaan"}
      </Button>
    </div>
  );
}
