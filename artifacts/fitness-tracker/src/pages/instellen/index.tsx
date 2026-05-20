import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Upload, CheckCircle2, XCircle, FileSpreadsheet, Trash2, RefreshCw, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface DataStatus {
  source: "excel" | "demo";
  excelFilePresent: boolean;
  sheetNames?: string[];
  weeksLoaded?: number;
  parsedAt?: string;
  uploadInstructies?: {
    stap1: string;
    stap2: string;
    stap3: string;
    opmerking: string;
  } | null;
}

function useDataStatus() {
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data-status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return { status, loading, refresh: fetch_ };
}

export default function Instellen() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { status, loading, refresh } = useDataStatus();

  // Load on mount
  useState(() => { refresh(); });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload/excel", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Bestand geüpload!",
          description: `${data.wekenGeladen} weken geladen uit ${data.tabbladen?.length ?? 0} tabbladen.`,
        });
        await refresh();
      } else {
        toast({
          title: "Upload mislukt",
          description: data.error || "Onbekende fout bij het uploaden.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Verbindingsfout",
        description: "Kon de server niet bereiken. Probeer het opnieuw.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("Weet je zeker dat je het Excel-bestand wilt verwijderen? De app gebruikt dan weer demodata.")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/upload/excel", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Verwijderd", description: data.bericht });
        await refresh();
      } else {
        toast({ title: "Fout", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Verbindingsfout", description: "Kon de server niet bereiken.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/export/excel");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "Download mislukt",
          description: data.error || "Probeer het opnieuw.",
          variant: "destructive",
        });
        return;
      }
      // Trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      // Read filename from Content-Disposition header
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] || `FitnessTracker_Export.xlsx`;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Download gestart!",
        description: "Het bijgewerkte Excel-bestand wordt gedownload.",
      });
    } catch {
      toast({
        title: "Verbindingsfout",
        description: "Kon de server niet bereiken. Probeer het opnieuw.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center max-w-md mx-auto">
      <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="mr-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold text-foreground">Instellingen</h1>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </header>

      <div className="w-full p-5 flex flex-col gap-5">

        {/* Verbindingsstatus kaart */}
        <div className={`rounded-xl border p-5 flex items-start gap-4 ${
          status?.source === "excel"
            ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
            : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
        }`}>
          {status?.source === "excel" ? (
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-6 w-6 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`font-bold text-base ${status?.source === "excel" ? "text-green-800 dark:text-green-300" : "text-amber-800 dark:text-amber-300"}`}>
              {status?.source === "excel" ? "Excel-data actief" : "Demodata actief"}
            </p>
            {status?.source === "excel" ? (
              <div className="mt-1 space-y-0.5">
                <p className="text-sm text-green-700 dark:text-green-400">{status.weeksLoaded} weken geladen</p>
                <p className="text-xs text-green-600/70 dark:text-green-500/70 truncate">
                  Tabbladen: {status.sheetNames?.join(", ")}
                </p>
                {status.parsedAt && (
                  <p className="text-xs text-green-600/70 dark:text-green-500/70">
                    Geladen: {new Date(status.parsedAt).toLocaleString("nl-NL")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Upload het Excel-bestand om echte trainingsdata te tonen.
              </p>
            )}
          </div>
        </div>

        {/* Upload sectie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">Excel-bestand uploaden</h2>
              <p className="text-xs text-muted-foreground">Bodyrebuild Programma .xlsx</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Upload het Excel-exportbestand van de spreadsheet. De app leest automatisch de trainingsdata,
            voedingswaarden, feedbackvragen en video-links uit de tabbladen.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleUpload}
            className="hidden"
            id="excel-upload"
          />

          <Button
            className="w-full h-12 font-bold"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                Bezig met verwerken...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 mr-2" />
                {status?.excelFilePresent ? "Bestand vervangen" : "Excel-bestand uploaden"}
              </>
            )}
          </Button>

          {status?.excelFilePresent && (
            <Button
              variant="outline"
              className="w-full h-10 mt-3 text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleting ? "Verwijderen..." : "Bestand verwijderen (terug naar demo)"}
            </Button>
          )}
        </div>

        {/* Download sectie */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 bg-green-500/10 rounded-lg flex items-center justify-center">
              <Download className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">Download bijgewerkt Excel</h2>
              <p className="text-xs text-muted-foreground">Exporteer alle ingevulde data</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Download het Excel-bestand met daarin alle data die je via de app hebt ingevoerd:
            trainingsgewichten, voeding, dagboekmetingen en feedback-antwoorden.
            {!status?.excelFilePresent && " (Bevat alleen app-data, geen programma-data omdat er geen bestand is geüpload.)"}
          </p>

          <Button
            className="w-full h-12 font-bold bg-green-600 hover:bg-green-700 text-white"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Bestand voorbereiden...
              </>
            ) : (
              <>
                <Download className="h-5 w-5 mr-2" />
                Download Excel (.xlsx)
              </>
            )}
          </Button>
        </div>

        {/* Instructies */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-bold text-foreground mb-3">Hoe werkt het?</h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="h-5 w-5 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
              <span>Exporteer de spreadsheet als .xlsx via Google Sheets: <strong>Bestand → Downloaden → Microsoft Excel (.xlsx)</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="h-5 w-5 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
              <span>Klik hierboven op <strong>'Excel-bestand uploaden'</strong> en selecteer het gedownloade bestand.</span>
            </li>
            <li className="flex gap-2">
              <span className="h-5 w-5 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
              <span>De app verwerkt automatisch de tabbladen <strong>Week 1 t/m Week 12</strong>, <strong>Video links</strong>, <strong>Voeding</strong> en <strong>Feedback</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="h-5 w-5 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">4</span>
              <span>Bij een nieuwe versie van de spreadsheet: download opnieuw en upload het vervangende bestand.</span>
            </li>
          </ol>
        </div>

        {/* Vereiste tabbladen */}
        <div className="bg-secondary/50 border border-border rounded-xl p-4">
          <h3 className="font-semibold text-foreground text-sm mb-2">Verwachte tabbladen in het bestand</h3>
          <div className="flex flex-wrap gap-2">
            {["Week 1–12", "Video links", "Voeding", "Feedback", "Logboek"].map(name => (
              <span key={name} className="text-xs bg-background border border-border rounded-md px-2 py-1 font-mono">
                {name}
              </span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
