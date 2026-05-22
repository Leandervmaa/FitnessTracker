import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const excelPath = path.resolve(__dirname, "./data/programma.xlsx");
const wb = XLSX.readFile(excelPath);

const sheetName = wb.SheetNames.find((n) => /progressie/i.test(n));
if (sheetName) {
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  
  console.log(`=== Progressie Headers by Week ===`);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const col0 = String(row[0] || "").trim();
    if (/^week\s+(\d+)$/i.test(col0)) {
      const filledCols = row
        .map((val, idx) => ({ idx, val: String(val).trim() }))
        .filter(item => item.val !== "");
      console.log(`Row ${i} (${col0}):`, filledCols.map(c => `[${c.idx}]: "${c.val}"`).join(" | "));
    }
  }
} else {
  console.log("Progressie sheet not found");
}
