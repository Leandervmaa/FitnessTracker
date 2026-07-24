import crypto from "crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { authSessionsTable, clientsTable, exerciseLibraryTable, usersTable, type User } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { exerciseLibrarySeed } from "../data/exerciseLibrarySeed.js";

export const DEFAULT_CLIENT_ID = "default-client";
const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 120_000;
const KEY_LENGTH = 32;

export type AuthUser = Pick<User, "id" | "role" | "username" | "displayName" | "clientId">;

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function publicUser(user: User): AuthUser {
  return {
    id: user.id,
    role: user.role,
    username: user.username,
    displayName: user.displayName,
    clientId: user.clientId,
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, KEY_LENGTH, "sha256")
    .toString("hex");
  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, iterationsRaw, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterationsRaw || !salt || !expected) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations)) return false;

  const actual = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, "sha256");
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function ensureIdentitySchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clients (
      id text PRIMARY KEY,
      name text NOT NULL,
      email text,
      phone text,
      goal text,
      notes text,
      live_sheet_type text,
      live_sheet_url text,
      live_sheet_id text,
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS live_sheet_type text`);
  await db.execute(sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS live_sheet_url text`);
  await db.execute(sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS live_sheet_id text`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      role text NOT NULL,
      username text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      display_name text NOT NULL,
      client_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash text PRIMARY KEY,
      user_id text NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS exercise_library (
      id text PRIMARY KEY,
      name text NOT NULL,
      category text,
      video_url text,
      image_url text,
      notes text,
      source text,
      source_video_id text,
      is_global boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS planned_workouts (
      id text PRIMARY KEY,
      client_id text NOT NULL,
      week_number integer NOT NULL,
      name text NOT NULL,
      day_label text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'planned',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS planned_workout_exercises (
      id text PRIMARY KEY,
      workout_id text NOT NULL,
      client_id text NOT NULL,
      week_number integer NOT NULL,
      exercise_library_id text,
      name text NOT NULL,
      video_url text,
      image_url text,
      notes text,
      sets integer NOT NULL DEFAULT 3,
      rep_range text,
      target_rpe numeric(3,1),
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS exercise_set_logs (
      id serial PRIMARY KEY,
      client_id text NOT NULL,
      planned_workout_id text NOT NULL,
      planned_exercise_id text NOT NULL,
      exercise_library_id text,
      week_number integer NOT NULL,
      set_number integer NOT NULL,
      reps integer,
      weight numeric(7,2),
      rpe numeric(3,1),
      notes text,
      completed_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS nutrition_targets (
      id text PRIMARY KEY,
      client_id text NOT NULL,
      day_label text NOT NULL,
      kcal integer,
      protein_g integer,
      carbs_g integer,
      fat_g integer,
      water_ml integer,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS training_day_templates (
      id text PRIMARY KEY,
      name text NOT NULL,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS training_day_template_exercises (
      id text PRIMARY KEY,
      template_id text NOT NULL,
      exercise_library_id text,
      name text NOT NULL,
      video_url text,
      image_url text,
      notes text,
      sets integer NOT NULL DEFAULT 3,
      rep_range text,
      target_rpe numeric(3,1),
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trainer_feedback (
      id serial PRIMARY KEY,
      client_id text NOT NULL,
      week_number integer NOT NULL,
      title text NOT NULL,
      body text,
      video_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS planned_workouts_client_week_idx ON planned_workouts (client_id, week_number)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS planned_exercises_workout_idx ON planned_workout_exercises (workout_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS set_logs_client_exercise_idx ON exercise_set_logs (client_id, exercise_library_id, completed_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS trainer_feedback_client_week_idx ON trainer_feedback (client_id, week_number)`);

  for (const table of ["exercise_logs", "nutrition_entries", "feedback_answers", "progress_photos", "food_logs"]) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS client_id text`));
    await db.execute(sql.raw(`UPDATE ${table} SET client_id = '${DEFAULT_CLIENT_ID}' WHERE client_id IS NULL`));
  }

  await db
    .insert(exerciseLibraryTable)
    .values(
      exerciseLibrarySeed.map((exercise) => ({
        ...exercise,
        source: "youtube_playlist",
        isGlobal: true,
      })),
    )
    .onConflictDoNothing();

  const trainerUsername = normalizeUsername(process.env.TRAINER_USERNAME || "trainer");
  const [trainer] = await db.select().from(usersTable).where(eq(usersTable.username, trainerUsername));
  if (!trainer) {
    await db.insert(usersTable).values({
      id: "trainer",
      role: "trainer",
      username: trainerUsername,
      displayName: process.env.TRAINER_DISPLAY_NAME || "Personal trainer",
      passwordHash: hashPassword(process.env.TRAINER_PASSWORD || "bodyrebuild"),
    });
    logger.warn({ username: trainerUsername }, "Default trainer account created. Set TRAINER_PASSWORD in production.");
  }

  if (process.env.CREATE_DEFAULT_CLIENT === "true") {
    const [defaultClient] = await db.select().from(clientsTable).where(eq(clientsTable.id, DEFAULT_CLIENT_ID));
    if (!defaultClient) {
      await db.insert(clientsTable).values({
        id: DEFAULT_CLIENT_ID,
        name: process.env.DEFAULT_CLIENT_NAME || "Eerste klant",
        status: "active",
        goal: "Bestaand traject uit de huidige app",
      });
    }

    const defaultClientUsername = normalizeUsername(process.env.DEFAULT_CLIENT_USERNAME || "klant");
    const [defaultClientUser] = await db.select().from(usersTable).where(eq(usersTable.clientId, DEFAULT_CLIENT_ID));
    const [existingDefaultUsername] = await db.select().from(usersTable).where(eq(usersTable.username, defaultClientUsername));
    if (!defaultClientUser && !existingDefaultUsername) {
      await db.insert(usersTable).values({
        id: "default-client-user",
        role: "client",
        username: defaultClientUsername,
        displayName: process.env.DEFAULT_CLIENT_DISPLAY_NAME || "Eerste klant",
        passwordHash: hashPassword(process.env.DEFAULT_CLIENT_PASSWORD || "welkom"),
        clientId: DEFAULT_CLIENT_ID,
      });
      logger.warn(
        { username: defaultClientUsername },
        "Default client account created. Set DEFAULT_CLIENT_PASSWORD in production.",
      );
    }
  }
}

export async function authenticate(username: string, password: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, normalizeUsername(username)));

  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(authSessionsTable).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function findSessionUser(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);

  const [session] = await db
    .select()
    .from(authSessionsTable)
    .where(and(eq(authSessionsTable.tokenHash, tokenHash), gt(authSessionsTable.expiresAt, new Date())));

  if (!session) return null;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  return user ?? null;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(authSessionsTable).where(eq(authSessionsTable.tokenHash, hashToken(token)));
}

export async function createClientWithUser(input: {
  name: string;
  username: string;
  password: string;
  email?: string | null;
  phone?: string | null;
  goal?: string | null;
  notes?: string | null;
  liveSheetType?: string | null;
  liveSheetUrl?: string | null;
  liveSheetId?: string | null;
}): Promise<{ client: typeof clientsTable.$inferSelect; user: AuthUser }> {
  const clientId = randomId("client");
  const userId = randomId("user");
  const username = normalizeUsername(input.username);

  const [client] = await db
    .insert(clientsTable)
    .values({
      id: clientId,
      name: input.name.trim(),
      email: input.email || null,
      phone: input.phone || null,
      goal: input.goal || null,
      notes: input.notes || null,
      liveSheetType: input.liveSheetType || null,
      liveSheetUrl: input.liveSheetUrl || null,
      liveSheetId: input.liveSheetId || null,
      status: "active",
    })
    .returning();

  const [user] = await db
    .insert(usersTable)
    .values({
      id: userId,
      role: "client",
      username,
      passwordHash: hashPassword(input.password),
      displayName: input.name.trim(),
      clientId,
    })
    .returning();

  return { client, user: publicUser(user) };
}
