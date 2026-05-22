import { parseExcelFile } from "./src/services/excelParser.ts";

const parsed = parseExcelFile();
if (!parsed) {
  console.error("Failed to parse excel file");
  process.exit(1);
}

const week14 = parsed.weeks.find(w => w.weekNumber === 14);
if (!week14) {
  console.error("Week 14 not found in parsed data");
  process.exit(1);
}

console.log("=== Week 14 Workouts in parser ===");
week14.workouts.forEach(w => {
  console.log(`Workout: ${w.name} (${w.dayLabel})`);
  w.exercises.forEach(e => {
    console.log(`  Exercise: ${e.name}`);
    console.log(`    Prescribed reps: ${e.reps}`);
    console.log(`    sheetWeights: ${e.sheetWeights}`);
    console.log(`    sheetReps: ${e.sheetReps}`);
  });
});
