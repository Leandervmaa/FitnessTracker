import { db } from "@workspace/db";
import { exerciseLogsTable } from "@workspace/db";
async function main() {
  const logs = await db.select().from(exerciseLogsTable).limit(5);
  console.log(logs.map((l: any) => ({ id: l.id, reps: l.reps, notes: l.notes })));
  process.exit(0);
}
main();
