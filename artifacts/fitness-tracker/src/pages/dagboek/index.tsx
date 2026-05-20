import { useState, useEffect } from "react";
import { useWeek } from "@/components/week-context";
import { WeekSelector } from "@/components/week-selector";
import { 
  useGetNutritionEntries, 
  useCreateNutritionEntry, 
  useUpdateNutritionEntry,
  getGetNutritionEntriesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, BookOpen, Save, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const DAYS = [
  { id: "mon", label: "Ma" },
  { id: "tue", label: "Di" },
  { id: "wed", label: "Wo" },
  { id: "thu", label: "Do" },
  { id: "fri", label: "Vr" },
  { id: "sat", label: "Za" },
  { id: "sun", label: "Zo" }
];

interface WeekTarget {
  weekNumber: number;
  kcal: number | null;
  eiwittenG: number | null;
  koolhydratenG: number | null;
  vetenG: number | null;
  waterMl: number | null;
  lichaamsgewicht: number | null;
}

function useWeekTarget(weekNumber: number | undefined) {
  return useQuery<WeekTarget | null>({
    queryKey: ["nutrition-week-target", weekNumber],
    queryFn: async () => {
      if (!weekNumber) return null;
      try {
        const res = await fetch(`/api/nutrition/target/${weekNumber}`);
        if (!res.ok) {
          // Try global target as fallback
          const fallback = await fetch(`/api/nutrition/target`);
          if (!fallback.ok) return null;
          const data = await fallback.json();
          return { ...data, weekNumber, lichaamsgewicht: null };
        }
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

  const { data: weekTarget } = useWeekTarget(selectedWeek ?? undefined);

  const { data: entries } = useGetNutritionEntries(
    { weekNumber: selectedWeek || 0 },
    { query: { queryKey: getGetNutritionEntriesQueryKey({ weekNumber: selectedWeek || 0 }), enabled: !!selectedWeek } }
  );

  const createEntry = useCreateNutritionEntry();
  const updateEntry = useUpdateNutritionEntry();

  const handleSave = (dayId: string, data: any) => {
    if (!selectedWeek) return;
    
    const dayLabel = DAYS.find(d => d.id === dayId)?.label || "";
    const entry = entries?.find(e => e.day === dayId);
    
    const payload = {
      weekNumber: selectedWeek,
      day: dayId,
      dayLabel,
      kcal: data.kcal ? parseInt(data.kcal) : null,
      eiwittenG: data.eiwittenG ? parseInt(data.eiwittenG) : null,
      koolhydratenG: data.koolhydratenG ? parseInt(data.koolhydratenG) : null,
      vetenG: data.vetenG ? parseInt(data.vetenG) : null,
      waterMl: data.waterMl ? parseInt(data.waterMl) : null,
      notes: data.notes || null
    };

    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getGetNutritionEntriesQueryKey({ weekNumber: selectedWeek }) });
      toast({
        title: "Opgeslagen",
        description: `Voeding voor ${dayLabel} is succesvol opgeslagen.`,
      });
    };

    if (entry) {
      updateEntry.mutate({ id: entry.id, data: payload }, { onSuccess });
    } else {
      createEntry.mutate({ data: payload }, { onSuccess });
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center max-w-md mx-auto">
      <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="mr-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1 flex items-center">
          <BookOpen className="w-5 h-5 text-primary mr-2" />
          <h1 className="text-xl font-bold text-foreground">Dagboek</h1>
        </div>
        <WeekSelector />
      </header>

      {weekTarget && (
        <div className="w-full px-4 pt-4">
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              Week {selectedWeek} — Doelstellingen
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-secondary/40 border border-border/60 rounded-lg p-2.5 flex flex-col">
                <span className="text-[10px] text-muted-foreground font-bold uppercase">Energie</span>
                <span className="text-base font-black text-foreground mt-0.5">
                  {weekTarget.kcal ? `${weekTarget.kcal} kcal` : "—"}
                </span>
              </div>
              <div className="bg-secondary/40 border border-border/60 rounded-lg p-2.5 flex flex-col">
                <span className="text-[10px] text-muted-foreground font-bold uppercase">Water</span>
                <span className="text-base font-black text-foreground mt-0.5">
                  {weekTarget.waterMl ? `${weekTarget.waterMl / 1000} L` : "—"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-secondary/20 border border-border/40 rounded-lg p-2 text-center">
                <div className="text-[9px] text-primary font-bold uppercase">Eiwit</div>
                <div className="text-xs font-extrabold mt-0.5">{weekTarget.eiwittenG ? `${weekTarget.eiwittenG}g` : "—"}</div>
              </div>
              <div className="bg-secondary/20 border border-border/40 rounded-lg p-2 text-center">
                <div className="text-[9px] text-orange-500 font-bold uppercase">Koolhydraten</div>
                <div className="text-xs font-extrabold mt-0.5">{weekTarget.koolhydratenG ? `${weekTarget.koolhydratenG}g` : "—"}</div>
              </div>
              <div className="bg-secondary/20 border border-border/40 rounded-lg p-2 text-center">
                <div className="text-[9px] text-amber-500 font-bold uppercase">Vetten</div>
                <div className="text-xs font-extrabold mt-0.5">{weekTarget.vetenG ? `${weekTarget.vetenG}g` : "—"}</div>
              </div>
            </div>
            {weekTarget.lichaamsgewicht && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 flex items-center justify-between">
                <span className="text-[10px] text-primary font-bold uppercase">Gewicht doel (sheet)</span>
                <span className="text-sm font-black text-primary">{weekTarget.lichaamsgewicht} kg</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-full p-4 flex flex-col">
        <Tabs value={activeDay} onValueChange={setActiveDay} className="w-full">
          <TabsList className="w-full h-12 p-1 mb-6 flex bg-secondary">
            {DAYS.map(day => (
              <TabsTrigger 
                key={day.id} 
                value={day.id}
                className="flex-1 h-full rounded-md font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
              >
                {day.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {DAYS.map(day => {
            const entry = entries?.find(e => e.day === day.id);
            return (
              <TabsContent key={day.id} value={day.id} className="mt-0">
                <NutritionDayForm 
                  day={day} 
                  entry={entry} 
                  weekTarget={weekTarget}
                  onSave={(data) => handleSave(day.id, data)} 
                  isSaving={createEntry.isPending || updateEntry.isPending}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}

function NutritionDayForm({ day, entry, weekTarget, onSave, isSaving }: { 
  day: any, 
  entry?: any, 
  weekTarget?: WeekTarget | null,
  onSave: (data: any) => void, 
  isSaving: boolean 
}) {
  const [formData, setFormData] = useState(() => buildFormData(entry, weekTarget));

  useEffect(() => {
    setFormData(buildFormData(entry, weekTarget));
  }, [entry, weekTarget]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSaveWrapper = () => {
    const payload = { ...formData };
    const metrics = {
      slaapUren: payload.slaapUren,
      stressNiveau: payload.stressNiveau,
      energieNiveau: payload.energieNiveau,
      lichaamsgewicht: payload.lichaamsgewicht
    };
    payload.notes = JSON.stringify({ metrics, text: payload.notes });
    onSave(payload);
  };

  // Determine if each field has real entered data or is just a placeholder suggestion
  const hasEntry = !!entry;

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-6">

      {/* Indication whether data is filled or placeholder */}
      {!hasEntry && weekTarget?.kcal && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/30 border border-border/50 rounded-lg px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          Doelen uit sheet als startpunt — vul jouw werkelijke waarden in
        </div>
      )}
      {hasEntry && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Eerder ingevuld — bewerken of opnieuw opslaan
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-lg font-bold">Calorieën (kcal)</Label>
        <Input 
          type="number" inputMode="numeric"
          name="kcal" value={formData.kcal} onChange={handleChange}
          className="h-14 text-xl font-bold px-4" 
          placeholder={weekTarget?.kcal ? `Doel: ${weekTarget.kcal} kcal` : "Bijv. 2500"}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-primary">Eiwit (g)</Label>
          <Input 
            type="number" inputMode="numeric"
            name="eiwittenG" value={formData.eiwittenG} onChange={handleChange}
            className="h-12 text-center font-bold" 
            placeholder={weekTarget?.eiwittenG ? `${weekTarget.eiwittenG}g` : "0"}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-orange-500">Koolh (g)</Label>
          <Input 
            type="number" inputMode="numeric"
            name="koolhydratenG" value={formData.koolhydratenG} onChange={handleChange}
            className="h-12 text-center font-bold" 
            placeholder={weekTarget?.koolhydratenG ? `${weekTarget.koolhydratenG}g` : "0"}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-amber-500">Vet (g)</Label>
          <Input 
            type="number" inputMode="numeric"
            name="vetenG" value={formData.vetenG} onChange={handleChange}
            className="h-12 text-center font-bold" 
            placeholder={weekTarget?.vetenG ? `${weekTarget.vetenG}g` : "0"}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Water (ml)</Label>
          <Input 
            type="number" inputMode="numeric"
            name="waterMl" value={formData.waterMl} onChange={handleChange}
            className="h-12 px-4" 
            placeholder={weekTarget?.waterMl ? `Doel: ${weekTarget.waterMl} ml` : "Bijv. 3000"}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Lichaamsgewicht (kg)</Label>
          <Input 
            type="number" inputMode="decimal"
            name="lichaamsgewicht" value={formData.lichaamsgewicht} onChange={handleChange}
            className="h-12 px-4" 
            placeholder={weekTarget?.lichaamsgewicht ? `Doel: ${weekTarget.lichaamsgewicht} kg` : "Bijv. 80.5"}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Slaap (uren)</Label>
          <Input 
            type="number" inputMode="decimal"
            name="slaapUren" value={formData.slaapUren} onChange={handleChange}
            className="h-12 text-center" 
            placeholder="Bijv. 8"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Stress (1-10)</Label>
          <Input 
            type="number" inputMode="numeric"
            name="stressNiveau" value={formData.stressNiveau} onChange={handleChange}
            className="h-12 text-center" 
            placeholder="1-10"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Energie (1-10)</Label>
          <Input 
            type="number" inputMode="numeric"
            name="energieNiveau" value={formData.energieNiveau} onChange={handleChange}
            className="h-12 text-center" 
            placeholder="1-10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Notities</Label>
        <Textarea 
          name="notes" value={formData.notes} onChange={handleChange}
          className="resize-none" placeholder="Bijv. voelde me moe, veel honger..."
        />
      </div>

      <Button 
        className="w-full h-12 font-bold rounded-lg" 
        onClick={handleSaveWrapper}
        disabled={isSaving}
      >
        <Save className="w-5 h-5 mr-2" /> Opslaan
      </Button>
    </div>
  );
}

function buildFormData(entry: any, weekTarget: WeekTarget | null | undefined) {
  let parsedNotes: any = {};
  let pureNotes = entry?.notes || "";
  try {
    if (pureNotes.startsWith("{")) {
      const parsed = JSON.parse(pureNotes);
      parsedNotes = parsed.metrics || {};
      pureNotes = parsed.text || "";
    }
  } catch(e) {}

  // If we have actual entry data, show that; otherwise show empty fields with targets as placeholders
  return {
    kcal: entry?.kcal?.toString() || "",
    eiwittenG: entry?.eiwittenG?.toString() || "",
    koolhydratenG: entry?.koolhydratenG?.toString() || "",
    vetenG: entry?.vetenG?.toString() || "",
    waterMl: entry?.waterMl?.toString() || "",
    slaapUren: parsedNotes.slaapUren || "",
    stressNiveau: parsedNotes.stressNiveau || "",
    energieNiveau: parsedNotes.energieNiveau || "",
    lichaamsgewicht: parsedNotes.lichaamsgewicht || "",
    notes: pureNotes
  };
}