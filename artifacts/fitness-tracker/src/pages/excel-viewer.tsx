import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, FileSpreadsheet, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ExcelViewer() {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excelData, setExcelData] = useState<Record<string, string[][]> | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");

  useEffect(() => {
    fetch("/api/upload/excel/json")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Geen Excel-bestand aanwezig of er is een fout opgetreden bij het inladen.");
        }
        return res.json();
      })
      .then((data) => {
        setExcelData(data);
        const sheetNames = Object.keys(data);
        if (sheetNames.length > 0) {
          // Default to the first sheet that matches 'week' or 'upper/lower' or just the first sheet
          const firstSheet = sheetNames.find(n => /week|upper|lower/i.test(n)) || sheetNames[0];
          setActiveSheet(firstSheet);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-[100dvh] w-full bg-background flex flex-col items-center max-w-md mx-auto">
      <header className="w-full p-4 flex items-center border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="mr-2">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1 flex items-center">
          <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" />
          <h1 className="text-xl font-bold text-foreground">Excel Schema</h1>
        </div>
      </header>

      <div className="w-full flex-1 flex flex-col p-4 overflow-hidden">
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground">Bestand inladen...</p>
          </div>
        )}

        {error && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center px-4">
            <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">Geen Excel in-app viewer data</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-6">{error}</p>
            <Link href="/instellen">
              <Button>Upload Excel Schema</Button>
            </Link>
          </div>
        )}

        {excelData && activeSheet && (
          <div className="w-full flex-1 flex flex-col overflow-hidden">
            {/* Sheet Tabs */}
            <div className="w-full overflow-x-auto pb-2 flex gap-1 mb-4 border-b border-border">
              {Object.keys(excelData).map((sheetName) => (
                <button
                  key={sheetName}
                  onClick={() => setActiveSheet(sheetName)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex-shrink-0 ${
                    activeSheet === sheetName
                      ? "bg-green-600 text-white"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  }`}
                >
                  {sheetName}
                </button>
              ))}
            </div>

            {/* Sheet Table Viewer */}
            <div className="flex-1 w-full border border-border rounded-xl bg-card overflow-auto shadow-sm">
              <table className="w-full border-collapse text-[10px] sm:text-xs">
                <tbody>
                  {excelData[activeSheet].map((row, ri) => {
                    // Check if it's an empty row to apply styling
                    const isEmpty = row.every((c) => !c || c.trim() === "");
                    if (isEmpty) return <tr key={ri} className="h-3" />;

                    // Detect headers (e.g. contains Week, Set, Oefening)
                    const isHeader = row.some((c) => 
                      /week|oefening|bijzonderheden|set|werk sets|reps/i.test(c)
                    ) && !row.some((c) => /^[A-Z]\s*:/i.test(c));

                    return (
                      <tr 
                        key={ri} 
                        className={`${
                          isHeader 
                            ? "bg-secondary/80 font-bold border-y border-border" 
                            : "border-b border-border/50 hover:bg-secondary/25"
                        }`}
                      >
                        {row.map((cell, ci) => {
                          // Apply colored highlights to specific terms
                          const cellStr = String(cell || "");
                          let textColor = "text-foreground";
                          if (/^[A-Z]\s*:/i.test(cellStr)) {
                            textColor = "text-primary font-bold";
                          } else if (/^week\s+\d+/i.test(cellStr)) {
                            textColor = "text-green-600 dark:text-green-400 font-black";
                          }

                          return (
                            <td 
                              key={ci} 
                              className={`p-2 min-w-[80px] border-r border-border/30 whitespace-nowrap ${textColor}`}
                            >
                              {cellStr}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
