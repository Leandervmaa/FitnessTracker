import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Plus, Trash2, X, Loader2, AlertCircle,
  ScanBarcode, Calculator, Pencil, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// Lazy-load scanner to avoid SSR issues
const BarcodeScanner = lazy(() => import("./barcode-scanner"));

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FoodSearchResult {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_description: string;
}

export interface Serving {
  serving_id: string;
  serving_description: string;
  calories: string;
  protein: string;
  carbohydrate: string;
  fat: string;
  fiber?: string;
}

export interface FoodDetail {
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["food-logs"] }),
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

// ─── Add food panel (search + serving selection) ──────────────────────────────

interface AddFoodPanelProps {
  weekNumber: number;
  day: string;
  dayLabel: string;
  initialFoodId?: string | null;
  onClose: () => void;
}

function AddFoodPanel({ weekNumber, day, dayLabel, initialFoodId, onClose }: AddFoodPanelProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(initialFoodId ?? null);
  const [selectedServingId, setSelectedServingId] = useState("");
  const [amount, setAmount] = useState("1");
  const addMutation = useAddFoodLog();

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 450);
    return () => clearTimeout(t);
  }, [query]);

  // Search
  const { data: searchData, isFetching: searching } = useQuery<{ results: FoodSearchResult[] } | { error: string }>({
    queryKey: ["food-search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(`/api/food/search?q=${encodeURIComponent(debouncedQuery)}&max=25`);
      return res.json();
    },
    enabled: debouncedQuery.length >= 2 && !selectedFoodId,
    staleTime: 60_000,
    retry: 1,
  });

  // Food detail
  const { data: foodDetail, isFetching: loadingDetail } = useQuery<FoodDetail>({
    queryKey: ["food-detail", selectedFoodId],
    queryFn: async () => {
      const res = await fetch(`/api/food/${selectedFoodId}`);
      if (!res.ok) throw new Error("Ophalen mislukt");
      return res.json();
    },
    enabled: !!selectedFoodId,
    staleTime: 300_000,
  });

  // Auto-select first serving when detail loads
  useEffect(() => {
    if (foodDetail?.servings?.length) setSelectedServingId(foodDetail.servings[0].serving_id);
  }, [foodDetail]);

  const selectedServing = foodDetail?.servings.find(s => s.serving_id === selectedServingId);
  const amt = parseFloat(amount) || 1;

  const calcNutrients = (s: Serving, a: number) => ({
    kcal: Math.round(parseFloat(s.calories || "0") * a),
    eiwit: Math.round(parseFloat(s.protein || "0") * a * 10) / 10,
    koolh: Math.round(parseFloat(s.carbohydrate || "0") * a * 10) / 10,
    vet: Math.round(parseFloat(s.fat || "0") * a * 10) / 10,
    vezel: s.fiber ? Math.round(parseFloat(s.fiber) * a * 10) / 10 : null,
  });

  const preview = selectedServing ? calcNutrients(selectedServing, amt) : null;

  const handleAdd = async () => {
    if (!foodDetail || !selectedServing) return;
    const n = calcNutrients(selectedServing, amt);
    try {
      await addMutation.mutateAsync({
        weekNumber, day,
        fatSecretFoodId:    foodDetail.food_id,
        fatSecretServingId: selectedServing.serving_id,
        foodName:           foodDetail.food_name,
        servingDescription: selectedServing.serving_description,
        amountServings:     String(amt),
        kcal: n.kcal, eiwittenG: n.eiwit, koolhydratenG: n.koolh,
        vetenG: n.vet, vezelG: n.vezel,
      });
      toast({ title: `✓ ${foodDetail.food_name} toegevoegd aan ${dayLabel}` });
      onClose();
    } catch (err: any) {
      toast({ title: "Toevoegen mislukt", description: err.message, variant: "destructive" });
    }
  };

  const searchResults = (searchData as any)?.results as FoodSearchResult[] | undefined;
  const searchError   = (searchData as any)?.error as string | undefined;

  // ── Serving selection screen ────────────────────────────────────────────────
  if (selectedFoodId) {
    return (
      <div className="flex flex-col h-full">
        {/* Back header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <button onClick={() => { setSelectedFoodId(null); setQuery(""); }} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
          {loadingDetail ? (
            <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm font-semibold">Laden…</span></div>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{foodDetail?.food_name}</p>
              {foodDetail?.brand_name && <p className="text-[10px] text-muted-foreground">{foodDetail.brand_name}</p>}
            </div>
          )}
        </div>

        {foodDetail && !loadingDetail && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Serving selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Portiegrootte</Label>
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {foodDetail.servings.map(s => (
                  <button
                    key={s.serving_id}
                    onClick={() => setSelectedServingId(s.serving_id)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                      selectedServingId === s.serving_id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-secondary/50"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold">{s.serving_description}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {Math.round(parseFloat(s.calories))} kcal · {s.protein}g eiwit
                      </p>
                    </div>
                    {selectedServingId === s.serving_id && (
                      <div className="h-4 w-4 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Aantal porties</Label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setAmount(a => String(Math.max(0.5, (parseFloat(a) || 1) - 0.5)))}
                  className="h-10 w-10 rounded-lg border border-border font-bold text-xl flex items-center justify-center hover:bg-secondary"
                >−</button>
                <Input
                  type="number" inputMode="decimal" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  min="0.1" step="0.5"
                  className="h-10 text-center font-bold text-lg flex-1"
                />
                <button
                  onClick={() => setAmount(a => String((parseFloat(a) || 1) + 0.5))}
                  className="h-10 w-10 rounded-lg border border-border font-bold text-xl flex items-center justify-center hover:bg-secondary"
                >+</button>
              </div>
            </div>

            {/* Preview */}
            {preview && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Voedingswaarden</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {([["kcal", preview.kcal, "text-primary"], ["eiwit", `${preview.eiwit}g`, ""], ["koolh", `${preview.koolh}g`, ""], ["vet", `${preview.vet}g`, ""]] as const).map(([lbl, val, cls]) => (
                    <div key={lbl}>
                      <div className={`text-base font-black ${cls}`}>{val}</div>
                      <div className="text-[9px] text-muted-foreground">{lbl}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              className="w-full h-12 font-bold text-base"
              onClick={handleAdd}
              disabled={addMutation.isPending || !selectedServing}
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Toevoegen aan {dayLabel}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Search screen ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="px-4 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Zoek voeding (bijv. kipfilet, brood, yoghurt...)"
            className="pl-10 h-11"
            autoFocus
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searchError && (
          <div className="flex items-start gap-2 m-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{searchError}</span>
          </div>
        )}

        {searchResults?.map(r => (
          <button
            key={r.food_id}
            onClick={() => setSelectedFoodId(r.food_id)}
            className="w-full text-left px-4 py-3 hover:bg-secondary/60 transition-colors border-b border-border/50 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{r.food_name}</p>
              {r.brand_name && <p className="text-[10px] font-medium text-muted-foreground">{r.brand_name}</p>}
              <p className="text-[10px] text-muted-foreground truncate">{r.food_description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        ))}

        {searchResults?.length === 0 && debouncedQuery.length >= 2 && !searching && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Search className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="font-semibold text-muted-foreground">Geen resultaten voor "{debouncedQuery}"</p>
            <p className="text-xs text-muted-foreground mt-1">Probeer een andere zoekterm of scan de barcode</p>
          </div>
        )}

        {!debouncedQuery && (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <Search className="h-12 w-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Typ minimaal 2 tekens om te zoeken</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main FoodTracker component ───────────────────────────────────────────────

interface Props {
  weekNumber: number;
  day: string;
  dayLabel: string;
  sheetKcal?: number | null;
  targetKcal?: number | null;
  savedManualKcal?: number;           // restored from DB on load
  onTotalKcalChange?: (totalKcal: number) => void;
  onManualKcalChange?: (manual: number) => void; // so parent can persist it
}

export default function FoodTracker({ weekNumber, day, dayLabel, sheetKcal, targetKcal, savedManualKcal, onTotalKcalChange, onManualKcalChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Initialize from saved value if provided (restored from DB)
  const [manualKcal, setManualKcalRaw] = useState(
    savedManualKcal != null && savedManualKcal > 0 ? String(savedManualKcal) : ""
  );

  const setManualKcal = useCallback((val: string) => {
    setManualKcalRaw(val);
    onManualKcalChange?.(parseFloat(val) || 0);
  }, [onManualKcalChange]);
  const [showSearch, setShowSearch] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [barcodeLoadingId, setBarcodeLoadingId] = useState<string | null>(null);

  const { data: foodLogs = [] } = useFoodLogs(weekNumber, day);
  const deleteMutation = useDeleteFoodLog();

  // Totals
  const loggedKcal = foodLogs.reduce((s, l) => s + parseFloat(l.kcal || "0"), 0);
  const manual = parseFloat(manualKcal) || 0;
  const totalKcal = Math.round(manual + loggedKcal);

  useEffect(() => {
    onTotalKcalChange?.(totalKcal);
  }, [totalKcal, onTotalKcalChange]);

  // Handle barcode detected from live scanner
  const handleBarcodeDetected = useCallback(async (barcode: string) => {
    setShowScanner(false);
    setBarcodeLoadingId(barcode);
    try {
      const res = await fetch(`/api/food/barcode?code=${encodeURIComponent(barcode)}`);
      if (!res.ok) {
        toast({ title: "Barcode niet herkend", description: `Code: ${barcode}`, variant: "destructive" });
        return;
      }
      const detail = await res.json();
      if (detail.error) {
        toast({ title: "Product niet gevonden", description: `Barcode: ${barcode}`, variant: "destructive" });
        return;
      }
      // Pre-fill search panel with found food
      setShowSearch(true);
      // Store the food id to pre-select it in AddFoodPanel
      setBarcodeLoadingId(null);
      setScannedFoodId(detail.food_id);
    } catch {
      toast({ title: "Barcode opzoeken mislukt", variant: "destructive" });
    } finally {
      setBarcodeLoadingId(null);
    }
  }, [toast]);

  const [scannedFoodId, setScannedFoodId] = useState<string | null>(null);

  // ── Render ──────────────────────────────────────────────────────────────────

  // Full-screen search/serving panel
  if (showSearch) {
    return (
      <div className="fixed inset-0 z-40 bg-background flex flex-col">
        {/* Panel header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border sticky top-0 bg-background">
          <button
            onClick={() => { setShowSearch(false); setScannedFoodId(null); }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="font-bold">Voeding toevoegen</h2>
          <div className="ml-auto">
            <button
              onClick={() => { setShowSearch(false); setShowScanner(true); }}
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <ScanBarcode className="h-5 w-5" />
            </button>
          </div>
        </div>

        <AddFoodPanel
          weekNumber={weekNumber}
          day={day}
          dayLabel={dayLabel}
          initialFoodId={scannedFoodId}
          onClose={() => { setShowSearch(false); setScannedFoodId(null); }}
        />
      </div>
    );
  }

  // Fullscreen scanner
  if (showScanner) {
    return (
      <Suspense fallback={<div className="fixed inset-0 z-50 bg-black flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
      </Suspense>
    );
  }

  // ── Normal view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ① Manual kcal */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> Handmatig kcal
        </Label>
        {sheetKcal != null && (
          <p className="text-[10px] text-muted-foreground">📋 Spreadsheet-doel: <strong>{sheetKcal} kcal</strong></p>
        )}
        <Input
          type="number" inputMode="numeric"
          value={manualKcal}
          onChange={e => setManualKcal(e.target.value)}
          placeholder="Bijv. 800"
          className="h-12 text-lg font-bold px-4"
        />
      </div>

      {/* ② Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-12 font-bold border-2 border-dashed gap-2"
          onClick={() => setShowSearch(true)}
        >
          <Search className="h-4 w-4" /> Zoeken
        </Button>
        <Button
          variant="outline"
          className="h-12 font-bold border-2 border-dashed gap-2"
          onClick={() => setShowScanner(true)}
          disabled={!!barcodeLoadingId}
        >
          {barcodeLoadingId
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <ScanBarcode className="h-4 w-4" />}
          Scan barcode
        </Button>
      </div>

      {/* ③ Food log list */}
      {foodLogs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gegeten vandaag</p>
          <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {foodLogs.map(log => (
              <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{log.foodName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {parseFloat(log.amountServings) !== 1 ? `${log.amountServings}× ` : ""}
                    {log.servingDescription}
                    {log.kcal ? ` · ${Math.round(parseFloat(log.kcal))} kcal` : ""}
                    {log.eiwittenG ? ` · ${log.eiwittenG}g eiwit` : ""}
                  </p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(log.id)}
                  disabled={deleteMutation.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0 p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ④ Totaal rekensom */}
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="h-4 w-4 text-primary" />
          <p className="text-xs font-bold text-primary uppercase tracking-wider">Totaal kcal vandaag</p>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Handmatig</span>
            <span className="font-semibold">{manual > 0 ? `${Math.round(manual)} kcal` : "—"}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Getrackte producten ({foodLogs.length})</span>
            <span className="font-semibold">{loggedKcal > 0 ? `${Math.round(loggedKcal)} kcal` : "—"}</span>
          </div>
          <div className="border-t border-primary/20 pt-2 flex justify-between items-center">
            <span className="font-black">Totaal</span>
            <div className="text-right">
              <span className="font-black text-xl text-primary">{totalKcal > 0 ? `${totalKcal} kcal` : "0 kcal"}</span>
              {targetKcal && (
                 <span className="ml-2 text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                   / {targetKcal} kcal
                 </span>
              )}
            </div>
          </div>
          
          {/* Difference with target */}
          {targetKcal != null && totalKcal > 0 && (
            <div className="flex justify-between text-[11px] pt-1 mt-1 border-t border-primary/10">
              <span className="text-muted-foreground font-semibold">Verschil met voedingsplan</span>
              <span className={totalKcal > targetKcal ? "text-orange-500 font-bold" : "text-green-600 dark:text-green-400 font-bold"}>
                {totalKcal > targetKcal ? `+${totalKcal - targetKcal}` : `${totalKcal - targetKcal}`} kcal
              </span>
            </div>
          )}
          
          {/* Fallback to sheetKcal diff if no targetKcal */}
          {!targetKcal && sheetKcal != null && totalKcal > 0 && (
            <div className="flex justify-between text-[11px] pt-1 mt-1 border-t border-primary/10 text-muted-foreground">
              <span>Verschil met sheet ({sheetKcal} kcal)</span>
              <span className={totalKcal > sheetKcal ? "text-orange-500 font-bold" : "text-green-600 dark:text-green-400 font-bold"}>
                {totalKcal > sheetKcal ? `+${totalKcal - sheetKcal}` : `${totalKcal - sheetKcal}`} kcal
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
