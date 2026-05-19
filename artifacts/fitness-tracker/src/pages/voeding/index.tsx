import { useState } from "react";
import { useWeek } from "@/components/week-context";
import { WeekSelector } from "@/components/week-selector";
import { 
  useGetNutritionEntries, 
  useCreateNutritionEntry, 
  useUpdateNutritionEntry,
  getGetNutritionEntriesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Utensils, Save } from "lucide-react";
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

export default function NutritionList() {
  const { selectedWeek } = useWeek();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [activeDay, setActiveDay] = useState(DAYS[0].id);

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
          <Utensils className="w-5 h-5 text-primary mr-2" />
          <h1 className="text-xl font-bold text-foreground">Voeding</h1>
        </div>
        <WeekSelector />
      </header>

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

function NutritionDayForm({ day, entry, onSave, isSaving }: { day: any, entry?: any, onSave: (data: any) => void, isSaving: boolean }) {
  const [formData, setFormData] = useState({
    kcal: entry?.kcal?.toString() || "",
    eiwittenG: entry?.eiwittenG?.toString() || "",
    koolhydratenG: entry?.koolhydratenG?.toString() || "",
    vetenG: entry?.vetenG?.toString() || "",
    waterMl: entry?.waterMl?.toString() || "",
    notes: entry?.notes || ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-6">
      <div className="space-y-2">
        <Label className="text-lg font-bold">Calorieën (kcal)</Label>
        <Input 
          type="number" inputMode="numeric"
          name="kcal" value={formData.kcal} onChange={handleChange}
          className="h-14 text-xl font-bold px-4" placeholder="Bijv. 2500"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-primary">Eiwit (g)</Label>
          <Input 
            type="number" inputMode="numeric"
            name="eiwittenG" value={formData.eiwittenG} onChange={handleChange}
            className="h-12 text-center font-bold" placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-orange-500">Koolh (g)</Label>
          <Input 
            type="number" inputMode="numeric"
            name="koolhydratenG" value={formData.koolhydratenG} onChange={handleChange}
            className="h-12 text-center font-bold" placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-amber-500">Vet (g)</Label>
          <Input 
            type="number" inputMode="numeric"
            name="vetenG" value={formData.vetenG} onChange={handleChange}
            className="h-12 text-center font-bold" placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Water (ml)</Label>
        <Input 
          type="number" inputMode="numeric"
          name="waterMl" value={formData.waterMl} onChange={handleChange}
          className="h-12 px-4" placeholder="Bijv. 3000"
        />
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
        onClick={() => onSave(formData)}
        disabled={isSaving}
      >
        <Save className="w-5 h-5 mr-2" /> Opslaan
      </Button>
    </div>
  );
}