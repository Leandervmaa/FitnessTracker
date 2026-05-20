import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const excelPath = path.resolve(__dirname, "./data/programma.xlsx");
const wb = XLSX.readFile(excelPath);
const sheetName = wb.SheetNames.find(n => /week|upper|lower/i.test(n));
const sheet = wb.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

console.log("Sheet name:", sheetName);
let foundHeader = false;
rows.forEach((row, i) => {
  if (row[0] && row[0].includes("Week 1") && row[1] === "Oefening:") {
    foundHeader = true;
  }
  if (foundHeader && i < 45) {
    console.log(`Row ${i}:`, row);
  }
});
