import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const excelPath = path.resolve(__dirname, "./data/programma.xlsx");
const wb = XLSX.readFile(excelPath);

const sheetName = "DELOAD week 14";
const sheet = wb.Sheets[sheetName];
if (sheet) {
  console.log(`=== First 30 rows of ${sheetName} ===`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const row = rows[i];
    console.log(`Row ${i}:`, row.map((val, idx) => `[${idx}]: "${val}"`).join(" | "));
  }
} else {
  console.log(`Sheet ${sheetName} not found`);
}
