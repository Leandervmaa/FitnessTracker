import XLSX from 'xlsx';
import fs from 'fs';

const EXCEL_PATH = '/Users/leandervanmaarschalkerwaard/Downloads/FitnessTracker/attached_assets/Leander_van_Maarschalkerwaard_Bodyrebuild_Programma_(1)_1778845137233.xlsx';

if (!fs.existsSync(EXCEL_PATH)) {
  console.log("Excel file not found at " + EXCEL_PATH);
  process.exit(1);
}

const wb = XLSX.readFile(EXCEL_PATH);
const exercises = new Set();

for (const sheetName of wb.SheetNames) {
  if (!sheetName.includes('Schema') && !sheetName.includes('Programma') && !sheetName.includes('Week')) {
    // Check if it looks like a training sheet
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    for (const row of rows) {
      const colB = row[1] ? String(row[1]).trim() : '';
      if (colB && /^[A-Z]\d*\s*:/i.test(colB)) {
        // e.g. "A1: Squat" or "B: Bench Press"
        const name = colB.replace(/^[A-Z]\d*\s*:\s*/i, '').trim();
        exercises.add(name);
      }
    }
  }
}

console.log("Unique Exercises found in Excel:");
console.log(Array.from(exercises));
