import pg from "pg";
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const { Pool } = pg;
export const SCHEMA_VERSION = "4";

/* Free-tier budget. Vercel Hobby: 10 s default function timeout, 100 GB-hours compute, 100 GB bandwidth.
   Neon Free: 0.5 GB storage per project, compute that auto-suspends when idle. */
export const LIMITS = {
  recentWorkouts: 150,              // sessions returned by /api/data
  rangeWorkouts: 200,               // max sessions per date-range query
  maxRoutines: 100,
  maxCustomExercises: 200,
  maxProfiles: Number(process.env.MAX_PROFILES) || 5,
  maxEntries: 40,
  maxSets: 30,
  maxKg: 1000,
  lockoutFails: 5,
  lockoutMinutes: 15,
};

export const DEFAULT_PROFILE = { name: "Athlete", goal: 3 };
export const DEFAULT_SETTINGS = { units: "kg", includeWarmups: true, keepAwake: true, showRpe: false, restDefault: 90 };
export const SET_TYPES = ["normal", "warmup", "drop", "failure"];
export const PR_KINDS = ["weight", "e1rm", "volume", "reps"];
export const MUSCLES = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves", "Core", "Forearms", "Full body", "Cardio", "Other"];
export const KINDS = ["weight", "bodyweight", "time"];
export const MEASURE_KEYS = ["neck", "shoulders", "chest", "bicep", "forearm", "waist", "hips", "thigh", "calf"];
export const DATA_TABLES = ["routines", "workouts", "body_weight", "exercises", "measurements"];

let pool = null;
let ready = null;

export function db() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw new Error("No database URL configured");
    // One connection per function instance. Neon's free tier caps total connections, so keep it small.
    pool = new Pool({ connectionString, max: 1, idleTimeoutMillis: 5000, connectionTimeoutMillis: 5000 });
  }
  return pool;
}

/* ---------- PINs: per-profile, scrypt-hashed, never stored in plain text ---------- */

const SCRYPT = { N: 16384, r: 8, p: 1 };
export const validPin = (pin) => /^\d{4,8}$/.test(String(pin ?? ""));

export async function hashPin(pin) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(String(pin), salt, 32, SCRYPT);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function checkPin(pin, stored) {
  const [scheme, salt, hex] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const want = Buffer.from(hex, "hex");
  const got = await scrypt(String(pin ?? ""), salt, want.length, SCRYPT);
  return got.length === want.length && timingSafeEqual(got, want);
}

/* ---------- validation: bad or unknown values are dropped, never trusted ---------- */

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const num = (v, min, max, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const ms = (v) => (Number(v) > 0 ? Math.round(Number(v)) : 0);
const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
const today = () => new Date().toISOString().slice(0, 10);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

export function sanitizeSettings(raw = {}) {
  return {
    units: raw.units === "lb" ? "lb" : "kg",
    includeWarmups: raw.includeWarmups !== false,
    keepAwake: raw.keepAwake !== false,
    showRpe: !!raw.showRpe,
    restDefault: Math.round(num(raw.restDefault, 15, 600, DEFAULT_SETTINGS.restDefault)),
  };
}

function cleanSet(s) {
  const rpe = s?.rpe === null || s?.rpe === undefined || s?.rpe === "" ? null : Math.round(num(s.rpe, 1, 10) * 2) / 2;
  return {
    id: str(s?.id, 40) || randomUUID(),
    type: SET_TYPES.includes(s?.type) ? s.type : "normal",
    reps: Math.round(num(s?.reps, 0, 999)),
    weight: Math.round(num(s?.weight, 0, LIMITS.maxKg) * 100) / 100,
    rpe,
    time: Math.round(num(s?.time, 0, 86400)),
    done: !!s?.done,
    pr: list(s?.pr, 4).filter((k) => PR_KINDS.includes(k)),
  };
}

export function sanitizeWorkout(raw = {}) {
  const entries = list(raw.entries, LIMITS.maxEntries)
    .map((e) => ({
      id: str(e?.id, 40) || randomUUID(),
      name: str(e?.name, 80),
      note: str(e?.note, 300),
      superset: str(e?.superset, 2),
      rest: Math.round(num(e?.rest, 0, 900)),
      sets: list(e?.sets, LIMITS.maxSets).map(cleanSet),
    }))
    .filter((e) => e.name);
  return {
    id: str(raw.id, 40) || randomUUID(),
    title: str(raw.title, 80) || "Workout",
    routineId: str(raw.routineId, 40),
    startedAt: ms(raw.startedAt) || Date.now(),
    endedAt: ms(raw.endedAt),
    notes: str(raw.notes, 1000),
    entries,
  };
}

export function sanitizeRoutine(raw = {}) {
  const exercises = list(raw.exercises, 40)
    .map((e) => ({
      id: str(e?.id, 40) || randomUUID(),
      name: str(e?.name, 80),
      sets: Math.round(num(e?.sets, 1, 10, 3)),
      reps: str(e?.reps, 20) || "8-12",
      rest: Math.round(num(e?.rest, 0, 900)),
      note: str(e?.note, 200),
    }))
    .filter((e) => e.name);
  return {
    id: str(raw.id, 40) || randomUUID(),
    name: str(raw.name, 60) || "Untitled routine",
    folder: str(raw.folder, 40),
    exercises,
  };
}

export function sanitizeExercise(raw = {}) {
  const name = str(raw.name, 80);
  if (!name) return null;
  return {
    id: str(raw.id, 40) || randomUUID(),
    name,
    muscle: MUSCLES.includes(raw.muscle) ? raw.muscle : "Other",
    kind: KINDS.includes(raw.kind) ? raw.kind : "weight",
  };
}

export function sanitizeWeight(raw = {}) {
  return {
    id: str(raw.id, 40) || randomUUID(),
    day: isoDay(raw.day) || today(),
    kg: Math.round(num(raw.kg, 20, 400) * 100) / 100,
  };
}

export function sanitizeMeasurement(raw = {}) {
  const data = {};
  for (const k of MEASURE_KEYS) {
    const raw_v = raw.data?.[k];
    const v = Number(raw_v);
    if (raw_v !== undefined && raw_v !== null && raw_v !== "" && Number.isFinite(v) && v >= 1 && v <= 300) {
      data[k] = Math.round(v * 10) / 10;
    }
  }
  return { id: str(raw.id, 40) || randomUUID(), day: isoDay(raw.day) || today(), data };
}

/* ---------- row mapping ---------- */

const WORKOUT_COLS = `id, title, routine_id AS "routineId",
  (extract(epoch FROM started_at) * 1000)::float8 AS "startedAt",
  COALESCE((extract(epoch FROM ended_at) * 1000)::float8, 0) AS "endedAt", notes, entries`;

const mapWorkout = (r) => ({
  ...r,
  startedAt: Math.round(r.startedAt),
  endedAt: Math.round(r.endedAt),
  entries: r.entries || [],
});

/* ---------- profiles ---------- */

export async function countProfiles(p) {
  const { rows } = await p.query("SELECT count(*)::int AS n FROM profiles");
  return rows[0].n;
}

export async function listProfiles(p) {
  const { rows } = await p.query("SELECT id, name FROM profiles ORDER BY created_at ASC");
  return rows;
}

export async function findProfile(p, id) {
  const { rows } = await p.query("SELECT id, name, goal, settings, pin_hash FROM profiles WHERE id = $1", [id]);
  return rows[0] || null;
}

export async function createProfile(p, { id, name, pinHash }) {
  await p.query(
    "INSERT INTO profiles (id, name, goal, settings, pin_hash) VALUES ($1, $2, $3, $4::jsonb, $5)",
    [id, name, DEFAULT_PROFILE.goal, JSON.stringify(sanitizeSettings(DEFAULT_SETTINGS)), pinHash]
  );
}

export async function getProfileData(p, pid) {
  const row = await findProfile(p, pid);
  return {
    name: row.name,
    goal: Number(row.goal),
    settings: sanitizeSettings({ ...DEFAULT_SETTINGS, ...(row.settings || {}) }),
  };
}

export async function saveProfileData(p, pid, body = {}) {
  const goal = Math.min(14, Math.max(1, Math.round(num(body.goal, 1, 14, DEFAULT_PROFILE.goal))));
  await p.query(
    "UPDATE profiles SET name = $2, goal = $3, settings = $4::jsonb WHERE id = $1",
    [pid, str(body.name, 40) || DEFAULT_PROFILE.name, goal, JSON.stringify(sanitizeSettings(body.settings || {}))]
  );
}

export async function deleteProfile(p, pid) {
  await tx(p, async (c) => {
    for (const t of DATA_TABLES) await c.query(`DELETE FROM ${t} WHERE profile_id = $1`, [pid]);
    await c.query("DELETE FROM profiles WHERE id = $1", [pid]);
  });
}

/* ---------- login throttling (per profile, so changing IP doesn't bypass it) ---------- */

export async function isLocked(p, key) {
  const { rows } = await p.query(
    `SELECT 1 FROM pin_attempts WHERE key = $1 AND fails >= $2
       AND last > now() - ($3::int * interval '1 minute')`,
    [key, LIMITS.lockoutFails, LIMITS.lockoutMinutes]
  );
  return rows.length > 0;
}

export async function recordFail(p, key) {
  await p.query(
    `INSERT INTO pin_attempts (key, fails, last) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       fails = CASE WHEN pin_attempts.last < now() - ($2::int * interval '1 minute') THEN 1 ELSE pin_attempts.fails + 1 END,
       last = now()`,
    [key, LIMITS.lockoutMinutes]
  );
}

export async function clearFails(p, key) {
  await p.query("DELETE FROM pin_attempts WHERE key = $1", [key]);
}

/* ---------- routines ---------- */

export async function listRoutines(p, pid) {
  const { rows } = await p.query(
    "SELECT id, name, folder, exercises FROM routines WHERE profile_id = $1 ORDER BY created_at ASC",
    [pid]
  );
  return rows.map((r) => ({ ...r, exercises: r.exercises || [] }));
}

export async function countRoutines(p, pid) {
  const { rows } = await p.query("SELECT count(*)::int AS n FROM routines WHERE profile_id = $1", [pid]);
  return rows[0].n;
}

export async function getRoutine(p, pid, id) {
  const { rows } = await p.query("SELECT id, name, folder, exercises FROM routines WHERE id = $1 AND profile_id = $2", [id, pid]);
  return rows[0] ? { ...rows[0], exercises: rows[0].exercises || [] } : null;
}

export async function insertRoutine(p, pid, r) {
  await p.query(
    "INSERT INTO routines (id, profile_id, name, folder, exercises) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [r.id, pid, r.name, r.folder, JSON.stringify(r.exercises)]
  );
}

export async function updateRoutine(p, pid, r) {
  await p.query(
    "UPDATE routines SET name = $3, folder = $4, exercises = $5::jsonb, updated_at = now() WHERE id = $1 AND profile_id = $2",
    [r.id, pid, r.name, r.folder, JSON.stringify(r.exercises)]
  );
}

/* ---------- workouts ---------- */

export async function listRecentWorkouts(p, pid, limit) {
  const { rows } = await p.query(
    `SELECT ${WORKOUT_COLS} FROM workouts WHERE profile_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [pid, limit]
  );
  return rows.map(mapWorkout);
}

export async function listWorkoutRange(p, pid, fromMs, toMs, limit) {
  const { rows } = await p.query(
    `SELECT ${WORKOUT_COLS} FROM workouts
     WHERE profile_id = $1 AND started_at >= to_timestamp($2::float8 / 1000) AND started_at < to_timestamp($3::float8 / 1000)
     ORDER BY started_at ASC LIMIT $4`,
    [pid, fromMs, toMs, limit]
  );
  return rows.map(mapWorkout);
}

export async function getWorkout(p, pid, id) {
  const { rows } = await p.query(`SELECT ${WORKOUT_COLS} FROM workouts WHERE id = $1 AND profile_id = $2`, [id, pid]);
  return rows[0] ? mapWorkout(rows[0]) : null;
}

export async function insertWorkout(p, pid, w) {
  await p.query(
    `INSERT INTO workouts (id, profile_id, title, routine_id, started_at, ended_at, notes, entries)
     VALUES ($1, $2, $3, $4, to_timestamp($5::float8 / 1000),
             CASE WHEN $6::float8 > 0 THEN to_timestamp($6::float8 / 1000) ELSE NULL END,
             $7, $8::jsonb)`,
    [w.id, pid, w.title, w.routineId, w.startedAt, w.endedAt, w.notes, JSON.stringify(w.entries)]
  );
}

export async function updateWorkout(p, pid, w) {
  await p.query(
    `UPDATE workouts SET title = $3, routine_id = $4,
       started_at = to_timestamp($5::float8 / 1000),
       ended_at = CASE WHEN $6::float8 > 0 THEN to_timestamp($6::float8 / 1000) ELSE NULL END,
       notes = $7, entries = $8::jsonb, updated_at = now()
     WHERE id = $1 AND profile_id = $2`,
    [w.id, pid, w.title, w.routineId, w.startedAt, w.endedAt, w.notes, JSON.stringify(w.entries)]
  );
}

/* Lifetime totals are computed in SQL, so they stay correct even though lists only load recent sessions. */
export async function statsFor(p, pid, includeWarmups) {
  const { rows } = await p.query(
    `WITH done AS (
       SELECT started_at, ended_at, entries FROM workouts WHERE profile_id = $1 AND ended_at IS NOT NULL
     ), sets AS (
       SELECT s FROM done d, jsonb_array_elements(d.entries) e, jsonb_array_elements(e->'sets') s
     )
     SELECT
       (SELECT count(*)::int FROM done) AS sessions,
       (SELECT count(*)::int FROM done WHERE started_at >= date_trunc('year', now())) AS "thisYear",
       (SELECT count(*)::int FROM done WHERE started_at >= date_trunc('month', now())) AS "thisMonth",
       (SELECT COALESCE(avg(extract(epoch FROM (ended_at - started_at)) / 60), 0)::int FROM done) AS "avgMinutes",
       (SELECT count(*)::int FROM sets
          WHERE (s->>'done')::boolean AND ($2::boolean OR COALESCE(s->>'type', 'normal') <> 'warmup')) AS sets,
       (SELECT COALESCE(sum((s->>'weight')::numeric * (s->>'reps')::numeric), 0)::float8 FROM sets
          WHERE (s->>'done')::boolean AND ($2::boolean OR COALESCE(s->>'type', 'normal') <> 'warmup')) AS volume`,
    [pid, !!includeWarmups]
  );
  return rows[0];
}

/* ---------- body ---------- */

export async function listWeights(p, pid) {
  const { rows } = await p.query(
    "SELECT id, to_char(day, 'YYYY-MM-DD') AS day, kg::float8 AS kg FROM body_weight WHERE profile_id = $1 ORDER BY day ASC, created_at ASC",
    [pid]
  );
  return rows;
}

export async function insertWeight(p, pid, w) {
  await p.query("INSERT INTO body_weight (id, profile_id, day, kg) VALUES ($1, $2, $3::date, $4)", [w.id, pid, w.day, w.kg]);
}

export async function listMeasurements(p, pid) {
  const { rows } = await p.query(
    "SELECT id, to_char(day, 'YYYY-MM-DD') AS day, data FROM measurements WHERE profile_id = $1 ORDER BY day ASC, created_at ASC",
    [pid]
  );
  return rows;
}

export async function insertMeasurement(p, pid, m) {
  await p.query("INSERT INTO measurements (id, profile_id, day, data) VALUES ($1, $2, $3::date, $4::jsonb)", [m.id, pid, m.day, JSON.stringify(m.data)]);
}

/* ---------- exercises (custom) ---------- */

export async function listExercises(p, pid) {
  const { rows } = await p.query("SELECT id, name, muscle, kind FROM exercises WHERE profile_id = $1 ORDER BY name ASC", [pid]);
  return rows;
}

export async function countExercises(p, pid) {
  const { rows } = await p.query("SELECT count(*)::int AS n FROM exercises WHERE profile_id = $1", [pid]);
  return rows[0].n;
}

export async function insertExercise(p, pid, e) {
  await p.query("INSERT INTO exercises (id, profile_id, name, muscle, kind) VALUES ($1, $2, $3, $4, $5)", [e.id, pid, e.name, e.muscle, e.kind]);
}

export async function updateExercise(p, pid, e) {
  await p.query("UPDATE exercises SET name = $3, muscle = $4, kind = $5 WHERE id = $1 AND profile_id = $2", [e.id, pid, e.name, e.muscle, e.kind]);
}

/* ---------- shared ---------- */

const DELETABLE = ["routines", "workouts", "body_weight", "exercises", "measurements"];
export async function deleteRow(p, pid, table, id) {
  if (!DELETABLE.includes(table)) throw new Error("bad table");
  await p.query(`DELETE FROM ${table} WHERE id = $1 AND profile_id = $2`, [id, pid]);
}

export async function resetProfileData(p, pid) {
  await tx(p, async (c) => {
    for (const t of DATA_TABLES) await c.query(`DELETE FROM ${t} WHERE profile_id = $1`, [pid]);
    await c.query("UPDATE profiles SET goal = $2, settings = '{}'::jsonb WHERE id = $1", [pid, DEFAULT_PROFILE.goal]);
  });
}

export async function tx(p, fn) {
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

/* ---------- schema ----------
   Creates or upgrades tables on the first request, then skips the work until the version changes.
   Upgrading from v2 (single user, singleton "profile" table) moves all rows into one profile that uses APP_PIN. */
export function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const p = db();
      await p.query("CREATE TABLE IF NOT EXISTS meta (key text PRIMARY KEY, value text NOT NULL)");
      const meta = await p.query("SELECT value FROM meta WHERE key = 'schema'");
      if (meta.rows[0]?.value === SCHEMA_VERSION) return;

      await p.query(`CREATE TABLE IF NOT EXISTS profiles (
        id text PRIMARY KEY,
        name text NOT NULL DEFAULT 'Athlete',
        goal int NOT NULL DEFAULT 3,
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        pin_hash text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now())`);
      await p.query(`CREATE TABLE IF NOT EXISTS routines (
        id text PRIMARY KEY,
        profile_id text NOT NULL DEFAULT '',
        name text NOT NULL,
        folder text NOT NULL DEFAULT '',
        exercises jsonb NOT NULL DEFAULT '[]',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now())`);
      await p.query(`CREATE TABLE IF NOT EXISTS workouts (
        id text PRIMARY KEY,
        profile_id text NOT NULL DEFAULT '',
        title text NOT NULL DEFAULT 'Workout',
        routine_id text NOT NULL DEFAULT '',
        started_at timestamptz NOT NULL DEFAULT now(),
        ended_at timestamptz,
        notes text NOT NULL DEFAULT '',
        entries jsonb NOT NULL DEFAULT '[]',
        updated_at timestamptz NOT NULL DEFAULT now())`);
      await p.query(`CREATE TABLE IF NOT EXISTS body_weight (
        id text PRIMARY KEY,
        profile_id text NOT NULL DEFAULT '',
        day date NOT NULL,
        kg numeric(6,2) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now())`);
      await p.query(`CREATE TABLE IF NOT EXISTS exercises (
        id text PRIMARY KEY,
        profile_id text NOT NULL DEFAULT '',
        name text NOT NULL,
        muscle text NOT NULL DEFAULT 'Other',
        kind text NOT NULL DEFAULT 'weight',
        created_at timestamptz NOT NULL DEFAULT now())`);
      await p.query(`CREATE TABLE IF NOT EXISTS measurements (
        id text PRIMARY KEY,
        profile_id text NOT NULL DEFAULT '',
        day date NOT NULL,
        data jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now())`);

      // Bodyweight keeps two decimals so pounds entries round-trip exactly (idempotent).
      await p.query("ALTER TABLE body_weight ALTER COLUMN kg TYPE numeric(6,2)");

      // Tables from v2 have no profile_id yet.
      for (const t of DATA_TABLES) {
        await p.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS profile_id text NOT NULL DEFAULT ''`);
        await p.query(`CREATE INDEX IF NOT EXISTS ${t}_profile_idx ON ${t} (profile_id)`);
      }
      await p.query("CREATE INDEX IF NOT EXISTS workouts_profile_started_idx ON workouts (profile_id, started_at DESC)");
      await p.query("ALTER TABLE routines ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT ''");

      // Login throttle table changed shape in v3 (keyed per profile).
      await p.query("DROP TABLE IF EXISTS pin_attempts");
      await p.query(`CREATE TABLE pin_attempts (
        key text PRIMARY KEY,
        fails int NOT NULL DEFAULT 0,
        last timestamptz NOT NULL DEFAULT now())`);

      // One-time move of a v2 single-user database into a profile.
      const legacy = await p.query("SELECT to_regclass('public.profile') IS NOT NULL AS present");
      if (legacy.rows[0].present) {
        const { rows: [old] } = await p.query("SELECT name, goal, settings FROM profile WHERE id = 1");
        const { rows: [{ n }] } = await p.query("SELECT count(*)::int AS n FROM profiles");
        if (old && n === 0 && process.env.APP_PIN) {
          const id = randomUUID();
          await p.query(
            "INSERT INTO profiles (id, name, goal, settings, pin_hash) VALUES ($1, $2, $3, $4::jsonb, $5)",
            [id, old.name || DEFAULT_PROFILE.name, old.goal || DEFAULT_PROFILE.goal, JSON.stringify(old.settings || {}), await hashPin(process.env.APP_PIN)]
          );
          for (const t of DATA_TABLES) await p.query(`UPDATE ${t} SET profile_id = $1 WHERE profile_id = ''`, [id]);
        }
        if (n === 0 && !process.env.APP_PIN && old) {
          console.warn("Upgrade skipped the v2 data: set APP_PIN before upgrading to keep it.");
        }
        await p.query("DROP TABLE profile");
      }

      await p.query(
        "INSERT INTO meta (key, value) VALUES ('schema', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [SCHEMA_VERSION]
      );
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}
