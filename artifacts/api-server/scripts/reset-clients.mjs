import { createRequire } from "node:module";

const requireFromDbPackage = createRequire(new URL("../../../lib/db/package.json", import.meta.url));
const { Pool } = requireFromDbPackage("pg");

if (process.env.CONFIRM_RESET_CLIENTS !== "YES") {
  console.error("Stop: zet CONFIRM_RESET_CLIENTS=YES om alle klanten en klantdata te verwijderen.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("Stop: DATABASE_URL ontbreekt.");
  process.exit(1);
}

const statements = [
  "DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'client' OR client_id IS NOT NULL)",
  "DELETE FROM exercise_set_logs",
  "DELETE FROM planned_workout_exercises",
  "DELETE FROM planned_workouts",
  "DELETE FROM nutrition_targets",
  "DELETE FROM exercise_logs",
  "DELETE FROM nutrition_entries",
  "DELETE FROM feedback_answers",
  "DELETE FROM progress_photos",
  "DELETE FROM food_logs",
  "DELETE FROM users WHERE role = 'client' OR client_id IS NOT NULL",
  "DELETE FROM clients",
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  for (const statement of statements) {
    await client.query(statement);
  }
  await client.query("COMMIT");
  console.log("Alle klanten en klantdata zijn verwijderd. Trainer, templates en oefenbibliotheek zijn behouden.");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Reset mislukt:", err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
