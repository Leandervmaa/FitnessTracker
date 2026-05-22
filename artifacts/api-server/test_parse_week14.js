import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const excelPath = path.resolve(__dirname, "./data/programma.xlsx");
const wb = XLSX.readFile(excelPath);

console.log("Sheet names in workbook:", wb.SheetNames);

for (const sheetName of wb.SheetNames) {
  const lower = sheetName.toLowerCase().trim();
  if (lower.includes("upperlower") || lower.includes("upper lower") || lower.includes("deload")) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    
    let currentWeekNum = null;
    let inWeek14 = false;
    
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const colA = String(row[0] || "").trim();
      const colB = String(row[1] || "").trim();
      
      const weekMatch = colA.match(/^week\s+(\d+)$/i);
      if (weekMatch) {
        currentWeekNum = parseInt(weekMatch[1], 10);
        if (currentWeekNum === 14) {
          inWeek14 = true;
          console.log(`\n=== Found Week 14 in Sheet: "${sheetName}" at Row: ${ri} ===`);
          console.log("Header row:", row.map((val, idx) => `[${idx}]: "${val}"`).join(" | "));
        } else {
          inWeek14 = false;
        }
      }
      
      if (inWeek14) {
        // Log training titles or exercise rows
        if (/^training\s+[A-D]/i.test(colA) || (colB && /^[A-Z]\s*:/i.test(colB))) {
          console.log(`Row ${ri} (ColA: "${colA}", ColB: "${colB}"):`);
          const filledCols = row
            .map((val, idx) => ({ idx, val: String(val).trim() }))
            .filter(item => item.val !== "");
          console.log("  Filled columns:", filledCols.map(c => `[${c.idx}]: "${c.val}"`).join(" | "));
        }
      }
    }
  }
}
