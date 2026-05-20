import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Trash2, X, ChevronDown, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_description: string;
}

interface Serving {
  serving_id: string;
  serving_description: string;
  calories: string;
  protein: string;
  carbohydrate: string;
  fat: string;
  fiber?: string;
}

interface FoodDetail {
  food_id: string;
  food_name: string;
  brand_name?: string;
  servings: Serving[];
}

export interface FoodLog {
  id: number;
  weekNumber: number;
  day: string;
  fatSecretFoodId: string;
  fatSecretServingId: string;
  foodName: string;
  servingDescription: string;
  amountServings: string;
  kcal: string | null;
  eiwittenG: string | null;
  koolhydratenG: string | null;
  vetenG: string | null;
  vezelG: string | null;
  loggedAt: string;
}

export interface FoodTotals {
  kcal: number;
  eiwit: number;
  koolh: number;
  vet: number;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useFoodLogs(weekNumber: number | undefined, day: string) {
  return useQuery<FoodLog[]>({
    queryKey: ["food-logs", weekNumber, day],
    queryFn: async () => {
      if (!weekNumber) return [];
      const res = await fetch(`/api/food/logs?weekNumber=${weekNumber}&day=${day}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!weekNumber && !!day,
    staleTime: 10_000,
  });
}

function useDeleteFoodLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/food/logs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Verwijderen mislukt");
    },
    onSuccess: (_d, _v, ctx: any) => {
      qc.invalidateQueries({ queryKey: ["food-logs"] });
    },
  });
}

function useAddFoodLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/food/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Opslaan mislukt");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["food-logs"] }),
  });
}

// ─── Food search ──────────────────────────────────────────────────────────────

function useSearch(query: string) {
  return useQuery<{ results: SearchResult[] }>({
    queryKey: ["food-search", query],
    queryFn: async () => {
      const res = await fetch(`/api/food/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
}

function useFoodDetail(foodId: string | null) {
  return useQuery<FoodDetail>({
    queryKey: ["food-detail", foodId],
    queryFn: async () => {
      const res = await fetch(`/api/food/${foodId}`);
      if (!res.ok) throw new Error("Ophalen mislukt");
      return res.json();
    },
    enabled: !!foodId,
    staleTime: 300_000,
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  weekNumber: number;
  day: string;
  dayLabel: string;
}

export default function FoodTracker({ weekNumber, day, dayLabel }: Props) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [selectedServingId, setSelectedServingId] = useState<string>("");
  const [amount, setAmount] = useState("1");
  const [showSearch, setShowSearch] = useState(false);

  const { data: foodLogs = [], isLoading: logsLoading } = useFoodLogs(weekNumber, day);
  const { data: searchData, isFetching: searching, error: searchError } = useSearch(debouncedQuery);
  const { data: foodDetail, isFetching: loadingDetail } = useFoodDetail(selectedFoodId);
  const addMutation = useAddFoodLog();
  const deleteMutation = useDeleteFoodLog();

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  // Auto-select first serving when food detail loads
  useEffect(() => {
    if (foodDetail?.servings?.length) {
      setSelectedServingId(foodDetail.servings[0].serving_id);
    }
  }, [foodDetail]);

  const selectedServing = foodDetail?.servings.find(s => s.serving_id === selectedServingId);

  const calcNutrients = (serving: Serving | undefined, amt: number) => {
    if (!serving) return { kcal: 0, eiwit: 0, koolh: 0, vet: 0 };
    return {
      kcal: Math.round(parseFloat(serving.calories || "0") * amt),
      eiwit: Math.round(parseFloat(serving.protein || "0") * amt * 10) / 10,
      koolh: Math.round(parseFloat(serving.carbohydrate || "0") * amt * 10) / 10,
      vet: Math.round(parseFloat(serving.fat || "0") * amt * 10) / 10,
    };
  };

  const preview = calcNutrients(selectedServing, parseFloat(amount) || 1);

  const handleAdd = async () => {
    if (!foodDetail || !selectedServing) return;
    const amt = parseFloat(amount) || 1;
    const n = calcNutrients(selectedServing, amt);
    try {
      await addMutation.mutateAsync({
        weekNumber,
        day,
        fatSecretFoodId: foodDetail.food_id,
        fatSecretServingId: selectedServing.serving_id,
        foodName: foodDetail.food_name,
        servingDescription: selectedServing.serving_description,
        amountServings: String(amt),
        kcal: n.kcal,
        eiwittenG: n.eiwit,
        koolhydratenG: n.koolh,
        vetenG: n.vet,
        vezelG: selectedServing.fiber ? Math.round(parseFloat(selectedServing.fiber) * amt * 10) / 10 : null,
      });
      toast({ title: `${foodDetail.food_name} toegevoegd ✓` });
      setSelectedFoodId(null);
      setQuery("");
      setDebouncedQuery("");
      setAmount("1");
      setShowSearch(false);
    } catch (err: any) {
      toast({ title: "Toevoegen mislukt", description: err.message, variant: "destructive" });
    }
  };

  // Totals
  const totals: FoodTotals = foodLogs.reduce((acc, log) => ({
    kcal: acc.kcal + (parseFloat(log.kcal || "0")),
    eiwit: acc.eiwit + (parseFloat(log.eiwittenG || "0")),
    koolh: acc.koolh + (parseFloat(log.koolhydratenG || "0")),
    vet: acc.vet + (parseFloat(log.vetenG || "0")),
  }), { kcal: 0, eiwit: 0, koolh: 0, vet: 0 });

  const isIpError = (searchError as any)?.message?.includes("IP") || 
    (searchData as any)?.code === 21;

  return (
    <div className="space-y-4">

      {/* Totals bar */}
      {foodLogs.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Getrackt vandaag</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-base font-black text-primary">{Math.round(totals.kcal)}</div>
              <div className="text-[9px] text-muted-foreground font-semibold">kcal</div>
            </div>
            <div>
              <div className="text-base font-black">{totals.eiwit.toFixed(1)}g</div>
              <div className="text-[9px] text-muted-foreground font-semibold">eiwit</div>
            </div>
            <div>
              <div className="text-base font-black">{totals.koolh.toFixed(1)}g</div>
              <div className="text-[9px] text-muted-foreground font-semibold">koolh</div>
            </div>
            <div>
              <div className="text-base font-black">{totals.vet.toFixed(1)}g</div>
              <div className="text-[9px] text-muted-foreground font-semibold">vet</div>
            </div>
          </div>
        </div>
      )}

      {/* Search toggle */}
      <Button
        variant="outline"
        className="w-full h-11 font-bold border-dashed"
        onClick={() => setShowSearch(s => !s)}
      >
        <Plus className="h-4 w-4 mr-2" /> Eten toevoegen
      </Button>

      {showSearch && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedFoodId(null); }}
              placeholder="Zoek voeding (bijv. kip, brood, appel...)"
              className="pl-10 h-11"
              autoFocus
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {/* IP restriction warning */}
          {isIpError && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Voedingsdatabase vereist IP-whitelisting. Voeg het server-IP toe via platform.fatsecret.com → My Applications.</span>
            </div>
          )}

          {/* Search results */}
          {searchData?.results && !selectedFoodId && (
            <div className="max-h-52 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {searchData.results.map(r => (
                <button
                  key={r.food_id}
                  onClick={() => setSelectedFoodId(r.food_id)}
                  className="w-full text-left px-3 py-2.5 hover:bg-secondary/60 transition-colors"
                >
                  <div className="text-sm font-semibold text-foreground truncate">{r.food_name}</div>
                  {r.brand_name && <div className="text-[10px] text-muted-foreground">{r.brand_name}</div>}
                  <div className="text-[10px] text-muted-foreground truncate">{r.food_description}</div>
                </button>
              ))}
              {searchData.results.length === 0 && debouncedQuery.length >= 2 && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">Geen resultaten gevonden</div>
              )}
            </div>
          )}

          {/* Serving selector */}
          {selectedFoodId && (
            <div className="space-y-3">
              {loadingDetail ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : foodDetail && (
                <>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground truncate">{foodDetail.food_name}</p>
                      {foodDetail.brand_name && <p className="text-[10px] text-muted-foreground">{foodDetail.brand_name}</p>}
                    </div>
                    <button onClick={() => setSelectedFoodId(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Serving select */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Portie</label>
                    <select
                      value={selectedServingId}
                      onChange={e => setSelectedServingId(e.target.value)}
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm font-medium"
                    >
                      {foodDetail.servings.map(s => (
                        <option key={s.serving_id} value={s.serving_id}>{s.serving_description}</option>
                      ))}
                    </select>
                  </div>

                  {/* Amount */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Aantal porties</label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      min="0.1"
                      step="0.5"
                      className="h-10"
                    />
                  </div>

                  {/* Preview */}
                  {selectedServing && (
                    <div className="grid grid-cols-4 gap-2 bg-secondary/30 rounded-lg p-2 text-center">
                      <div>
                        <div className="text-sm font-black text-primary">{preview.kcal}</div>
                        <div className="text-[9px] text-muted-foreground">kcal</div>
                      </div>
                      <div>
                        <div className="text-sm font-black">{preview.eiwit}g</div>
                        <div className="text-[9px] text-muted-foreground">eiwit</div>
                      </div>
                      <div>
                        <div className="text-sm font-black">{preview.koolh}g</div>
                        <div className="text-[9px] text-muted-foreground">koolh</div>
                      </div>
                      <div>
                        <div className="text-sm font-black">{preview.vet}g</div>
                        <div className="text-[9px] text-muted-foreground">vet</div>
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full h-11 font-bold"
                    onClick={handleAdd}
                    disabled={addMutation.isPending || !selectedServing}
                  >
                    {addMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Toevoegen aan {dayLabel}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Logged foods list */}
      {foodLogs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gegeten vandaag</p>
          <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {foodLogs.map(log => (
              <div key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{log.foodName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {parseFloat(log.amountServings) !== 1 ? `${log.amountServings}× ` : ""}
                    {log.servingDescription}
                    {log.kcal ? ` · ${Math.round(parseFloat(log.kcal))} kcal` : ""}
                  </p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(log.id)}
                  disabled={deleteMutation.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export totals calc for dagboek page
export function calcFoodTotals(logs: FoodLog[]): FoodTotals {
  return logs.reduce((acc, log) => ({
    kcal: acc.kcal + parseFloat(log.kcal || "0"),
    eiwit: acc.eiwit + parseFloat(log.eiwittenG || "0"),
    koolh: acc.koolh + parseFloat(log.koolhydratenG || "0"),
    vet: acc.vet + parseFloat(log.vetenG || "0"),
  }), { kcal: 0, eiwit: 0, koolh: 0, vet: 0 });
}
