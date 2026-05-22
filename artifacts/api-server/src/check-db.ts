import { db } from "./db/index.js";
import { exerciseLogsTable } from "@workspace/db";
async function main() {
  const logs = await db.select().from(exerciseLogsTable).limit(5);
  console.log(logs.map(l => ({ id: l.id, reps: l.reps, notes: l.notes })));
  process.exit(0);
}
main();
