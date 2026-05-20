import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Plus, Trash2, X, Loader2, AlertCircle,
  ScanBarcode, Calculator, Pencil
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function useSearch(query: string) {
  return useQuery<{ results: SearchResult[] } | { error: string; code?: number }>({
    queryKey: ["food-search", query],
    queryFn: async () => {
      const res = await fetch(`/api/food/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.length >= 2,
    staleTime: 60_000,
    retry: false,
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

// ─── Barcode detector ─────────────────────────────────────────────────────────

async function readBarcodeFromFile(file: File): Promise<string | null> {
  // Try native BarcodeDetector first (Chrome Android)
  if ("BarcodeDetector" in window) {
    try {
      const bd = new (window as any).BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"],
      });
      const bitmap = await createImageBitmap(file);
      const codes = await bd.detect(bitmap);
      if (codes.length > 0) return codes[0].rawValue as string;
    } catch { /* fall through */ }
  }
  // Fallback: null (manual entry)
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcNutrients(serving: Serving, amt: number) {
  return {
    kcal: Math.round(parseFloat(serving.calories || "0") * amt),
    eiwit: Math.round(parseFloat(serving.protein || "0") * amt * 10) / 10,
    koolh: Math.round(parseFloat(serving.carbohydrate || "0") * amt * 10) / 10,
    vet: Math.round(parseFloat(serving.fat || "0") * amt * 10) / 10,
    vezel: serving.fiber ? Math.round(parseFloat(serving.fiber) * amt * 10) / 10 : null,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  weekNumber: number;
  day: string;
  dayLabel: string;
  sheetKcal?: number | null;
  onTotalKcalChange?: (totalKcal: number) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FoodTracker({ weekNumber, day, dayLabel, sheetKcal, onTotalKcalChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Manual kcal
  const [manualKcal, setManualKcal] = useState("");

  // Search state
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [selectedServingId, setSelectedServingId] = useState("");
  const [amount, setAmount] = useState("1");
  const [showSearch, setShowSearch] = useState(false);

  // Barcode
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [barcodeManual, setBarcodeManual] = useState("");
  const [showManualBarcode, setShowManualBarcode] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  const { data: foodLogs = [] } = useFoodLogs(weekNumber, day);
  const { data: searchData, isFetching: searching } = useSearch(debouncedQuery);
  const { data: foodDetail, isFetching: loadingDetail } = useFoodDetail(selectedFoodId);
  const addMutation = useAddFoodLog();
  const deleteMutation = useDeleteFoodLog();

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  // Auto-select first serving
  useEffect(() => {
    if (foodDetail?.servings?.length) setSelectedServingId(foodDetail.servings[0].serving_id);
  }, [foodDetail]);

  // Calculate totals
  const loggedKcal = foodLogs.reduce((s, l) => s + parseFloat(l.kcal || "0"), 0);
  const manual = parseFloat(manualKcal) || 0;
  const totalKcal = Math.round(manual + loggedKcal);

  useEffect(() => {
    onTotalKcalChange?.(totalKcal);
  }, [totalKcal, onTotalKcalChange]);

  const selectedServing = foodDetail?.servings.find(s => s.serving_id === selectedServingId);
  const preview = selectedServing ? calcNutrients(selectedServing, parseFloat(amount) || 1) : null;

  // ─── Barcode lookup ────────────────────────────────────────────────────────

  const lookupBarcode = useCallback(async (code: string) => {
    setBarcodeLoading(true);
    try {
      const res = await fetch(`/api/food/barcode?code=${encodeURIComponent(code.trim())}`);
      if (!res.ok) {
        toast({ title: "Barcode niet gevonden", description: "Product niet herkend", variant: "destructive" });
        return;
      }
      const detail: FoodDetail = await res.json();
      setSelectedFoodId(detail.food_id);
      setShowSearch(true);
      setShowManualBarcode(false);
      toast({ title: `${detail.food_name} gevonden ✓` });
    } catch {
      toast({ title: "Barcode zoeken mislukt", variant: "destructive" });
    } finally {
      setBarcodeLoading(false);
    }
  }, [toast]);

  const handleBarcodeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBarcodeLoading(true);
    const code = await readBarcodeFromFile(file);
    if (code) {
      await lookupBarcode(code);
    } else {
      // BarcodeDetector not available → ask for manual entry
      setShowManualBarcode(true);
      setBarcodeLoading(false);
      toast({ title: "Streepjescode niet automatisch herkend", description: "Vul de barcode handmatig in." });
    }
    if (barcodeInputRef.current) barcodeInputRef.current.value = "";
  };

  // ─── Add food ──────────────────────────────────────────────────────────────

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
        vezelG: n.vezel,
      });
      toast({ title: `${foodDetail.food_name} toegevoegd ✓` });
      setSelectedFoodId(null);
      setQuery("");
      setDebouncedQuery("");
      setAmount("1");
    } catch (err: any) {
      toast({ title: "Toevoegen mislukt", description: err.message, variant: "destructive" });
    }
  };

  const isIpError = (searchData as any)?.code === 21 || (searchData as any)?.error?.includes?.("IP");
  const searchResults = (searchData as any)?.results as SearchResult[] | undefined;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ① Manual kcal */}
      <div className="space-y-1.5">
        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> Handmatig kcal invullen
        </Label>
        {sheetKcal != null && (
          <p className="text-[10px] text-muted-foreground">
            📋 Spreadsheet-doel: <span className="font-bold">{sheetKcal} kcal</span>
          </p>
        )}
        <Input
          type="number"
          inputMode="numeric"
          value={manualKcal}
          onChange={e => setManualKcal(e.target.value)}
          placeholder="Bijv. 800"
          className="h-12 text-lg font-bold px-4"
        />
      </div>

      {/* ② Food search + barcode */}
      <div className="space-y-2">
        <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5" /> Voedsel toevoegen via zoeken of barcode
        </Label>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 h-10 font-bold border-dashed text-sm"
            onClick={() => setShowSearch(s => !s)}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Zoeken
          </Button>

          {/* Hidden file input for camera */}
          <input
            ref={barcodeInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleBarcodeFile}
            className="hidden"
          />
          <Button
            variant="outline"
            className="flex-1 h-10 font-bold border-dashed text-sm"
            onClick={() => barcodeInputRef.current?.click()}
            disabled={barcodeLoading}
          >
            {barcodeLoading
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <ScanBarcode className="h-4 w-4 mr-1.5" />}
            Barcode
          </Button>
        </div>

        {/* Manual barcode fallback */}
        {showManualBarcode && (
          <div className="flex gap-2">
            <Input
              value={barcodeManual}
              onChange={e => setBarcodeManual(e.target.value)}
              placeholder="Vul barcodenum­mer in (bijv. 8710400100)"
              className="h-10 text-sm"
              inputMode="numeric"
              onKeyDown={e => { if (e.key === "Enter") lookupBarcode(barcodeManual); }}
            />
            <Button
              className="h-10 px-3 shrink-0"
              onClick={() => lookupBarcode(barcodeManual)}
              disabled={barcodeLoading || !barcodeManual}
            >
              Zoek
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => { setShowManualBarcode(false); setBarcodeManual(""); }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* IP error */}
        {isIpError && (
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Voedingsdatabase vereist IP-whitelisting op platform.fatsecret.com</span>
          </div>
        )}

        {/* Search panel */}
        {showSearch && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            {!selectedFoodId && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={e => { setQuery(e.target.value); }}
                    placeholder="Zoek voeding (bijv. kip, brood...)"
                    className="pl-10 h-10"
                    autoFocus
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>

                {searchResults && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {searchResults.map(r => (
                      <button
                        key={r.food_id}
                        onClick={() => setSelectedFoodId(r.food_id)}
                        className="w-full text-left px-3 py-2.5 hover:bg-secondary/60 transition-colors"
                      >
                        <div className="text-sm font-semibold truncate">{r.food_name}</div>
                        {r.brand_name && <div className="text-[10px] text-muted-foreground">{r.brand_name}</div>}
                        <div className="text-[10px] text-muted-foreground truncate">{r.food_description}</div>
                      </button>
                    ))}
                    {searchResults.length === 0 && debouncedQuery.length >= 2 && (
                      <div className="px-3 py-4 text-sm text-muted-foreground text-center">Geen resultaten</div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Serving panel */}
            {selectedFoodId && (
              loadingDetail ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : foodDetail ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{foodDetail.food_name}</p>
                      {foodDetail.brand_name && <p className="text-[10px] text-muted-foreground">{foodDetail.brand_name}</p>}
                    </div>
                    <button onClick={() => { setSelectedFoodId(null); setQuery(""); }} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Portie</label>
                    <select
                      value={selectedServingId}
                      onChange={e => setSelectedServingId(e.target.value)}
                      className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
                    >
                      {foodDetail.servings.map(s => (
                        <option key={s.serving_id} value={s.serving_id}>{s.serving_description}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Aantal porties</label>
                    <Input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} min="0.1" step="0.5" className="h-10" />
                  </div>

                  {preview && (
                    <div className="grid grid-cols-4 gap-1.5 bg-secondary/30 rounded-lg p-2 text-center">
                      {[["kcal", preview.kcal], ["eiwit", `${preview.eiwit}g`], ["koolh", `${preview.koolh}g`], ["vet", `${preview.vet}g`]].map(([lbl, val]) => (
                        <div key={lbl as string}>
                          <div className="text-sm font-black text-primary">{val}</div>
                          <div className="text-[9px] text-muted-foreground">{lbl}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Button className="w-full h-10 font-bold" onClick={handleAdd} disabled={addMutation.isPending || !selectedServing}>
                    {addMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Toevoegen aan {dayLabel}
                  </Button>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* ③ Food log list */}
      {foodLogs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gegeten vandaag</p>
          <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
            {foodLogs.map(log => (
              <div key={log.id} className="flex items-center gap-3 px-4 py-2.5">
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
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
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
            <span>Handmatig ingevoerd</span>
            <span className="font-semibold">{manual > 0 ? `${Math.round(manual)} kcal` : "—"}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Getrackte producten ({foodLogs.length})</span>
            <span className="font-semibold">{loggedKcal > 0 ? `${Math.round(loggedKcal)} kcal` : "—"}</span>
          </div>
          <div className="border-t border-primary/20 pt-2 flex justify-between">
            <span className="font-black text-foreground">Totaal</span>
            <span className="font-black text-xl text-primary">{totalKcal > 0 ? `${totalKcal} kcal` : "0 kcal"}</span>
          </div>
          {sheetKcal != null && totalKcal > 0 && (
            <div className="flex justify-between text-[10px] text-muted-foreground pt-0.5">
              <span>Verschil met doel ({sheetKcal} kcal)</span>
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
