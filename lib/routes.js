// One router for the whole API. Vercel runs it as a single function (api/[...path].js),
// which keeps the deployment well inside the Hobby plan's function limits.
import { randomUUID } from "node:crypto";
import * as db from "./db.js";
import { authenticate } from "./api.js";

const { LIMITS } = db;
const q = (req, key) => (req.query && req.query[key] !== undefined ? String(req.query[key]) : "");
const idOf = (req) => q(req, "id").slice(0, 40);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const allow = (res, methods) => { res.setHeader("Allow", methods); return res.status(405).json({ error: "Method not allowed" }); };

async function profiles(req, res, p) {
  if (req.method === "GET") {
    const list = await db.listProfiles(p);
    return res.status(200).json({
      profiles: list,
      canCreate: list.length < LIMITS.maxProfiles,
      setupCodeRequired: Boolean(process.env.PROFILE_CODE),
      maxProfiles: LIMITS.maxProfiles,
    });
  }
  if (req.method === "POST") {
    const body = req.body || {};
    if (process.env.PROFILE_CODE && body.code !== process.env.PROFILE_CODE) return res.status(403).json({ error: "Wrong setup code" });
    const name = String(body.name || "").trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: "Enter a name" });
    if (!db.validPin(body.pin)) return res.status(400).json({ error: "PIN must be 4 to 8 digits" });
    if ((await db.countProfiles(p)) >= LIMITS.maxProfiles) return res.status(403).json({ error: `Profile limit reached (${LIMITS.maxProfiles})` });
    const id = randomUUID();
    await db.createProfile(p, { id, name, pinHash: await db.hashPin(body.pin) });
    return res.status(201).json({ id, name });
  }
  if (req.method === "DELETE") {
    const auth = await authenticate(req, p);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    await db.deleteProfile(p, auth.pid);
    return res.status(200).json({ ok: true });
  }
  return allow(res, "GET, POST, DELETE");
}

async function data(req, res, p, pid) {
  if (req.method === "GET") {
    return res.status(200).json({
      profile: await db.getProfileData(p, pid),
      routines: await db.listRoutines(p, pid),
      workouts: await db.listRecentWorkouts(p, pid, LIMITS.recentWorkouts),
      weights: await db.listWeights(p, pid),
      exercises: await db.listExercises(p, pid),
      measurements: await db.listMeasurements(p, pid),
    });
  }
  if (req.method === "PUT") {
    await db.saveProfileData(p, pid, req.body || {});
    return res.status(200).json(await db.getProfileData(p, pid));
  }
  if (req.method === "DELETE") {
    await db.resetProfileData(p, pid);
    return res.status(200).json({ ok: true });
  }
  return allow(res, "GET, PUT, DELETE");
}

async function stats(req, res, p, pid) {
  if (req.method !== "GET") return allow(res, "GET");
  const { settings } = await db.getProfileData(p, pid);
  return res.status(200).json(await db.statsFor(p, pid, settings.includeWarmups));
}

async function workouts(req, res, p, pid) {
  const body = req.body || {};
  if (req.method === "GET") {
    const from = Number(q(req, "from")), to = Number(q(req, "to"));
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 400 * 864e5) {
      return res.status(400).json({ error: "Give a from and to date range, up to 400 days" });
    }
    return res.status(200).json(await db.listWorkoutRange(p, pid, from, to, LIMITS.rangeWorkouts));
  }
  if (req.method === "POST") {
    const w = db.sanitizeWorkout(body);
    await db.insertWorkout(p, pid, w);
    return res.status(201).json(await db.getWorkout(p, pid, w.id));
  }
  const id = idOf(req);
  if (!id) return res.status(400).json({ error: "Missing id" });
  const old = await db.getWorkout(p, pid, id);
  if (!old) return res.status(404).json({ error: "Not found" });
  if (req.method === "PATCH") {
    const merged = db.sanitizeWorkout({ ...old, ...pick(body, ["title", "entries", "endedAt", "startedAt", "notes"]), id, routineId: old.routineId });
    await db.updateWorkout(p, pid, merged);
    return res.status(200).json(await db.getWorkout(p, pid, id));
  }
  if (req.method === "DELETE") {
    await db.deleteRow(p, pid, "workouts", id);
    return res.status(200).json({ ok: true });
  }
  return allow(res, "GET, POST, PATCH, DELETE");
}

async function routines(req, res, p, pid) {
  const body = req.body || {};
  if (req.method === "POST") {
    if ((await db.countRoutines(p, pid)) >= LIMITS.maxRoutines) return res.status(403).json({ error: `Routine limit reached (${LIMITS.maxRoutines})` });
    const r = db.sanitizeRoutine(body);
    await db.insertRoutine(p, pid, r);
    return res.status(201).json(await db.getRoutine(p, pid, r.id));
  }
  const id = idOf(req);
  if (!id) return res.status(400).json({ error: "Missing id" });
  const old = await db.getRoutine(p, pid, id);
  if (!old) return res.status(404).json({ error: "Not found" });
  if (req.method === "PATCH") {
    await db.updateRoutine(p, pid, db.sanitizeRoutine({ ...old, ...pick(body, ["name", "folder", "exercises"]), id }));
    return res.status(200).json(await db.getRoutine(p, pid, id));
  }
  if (req.method === "DELETE") {
    await db.deleteRow(p, pid, "routines", id);
    return res.status(200).json({ ok: true });
  }
  return allow(res, "POST, PATCH, DELETE");
}

async function exercises(req, res, p, pid) {
  const body = req.body || {};
  if (req.method === "POST") {
    if ((await db.countExercises(p, pid)) >= LIMITS.maxCustomExercises) return res.status(403).json({ error: `Custom exercise limit reached (${LIMITS.maxCustomExercises})` });
    const e = db.sanitizeExercise(body);
    if (!e) return res.status(400).json({ error: "Exercise needs a name" });
    await db.insertExercise(p, pid, e);
    return res.status(201).json(e);
  }
  const id = idOf(req);
  if (!id) return res.status(400).json({ error: "Missing id" });
  if (req.method === "PATCH") {
    const e = db.sanitizeExercise({ ...body, id });
    if (!e) return res.status(400).json({ error: "Exercise needs a name" });
    await db.updateExercise(p, pid, e);
    return res.status(200).json(e);
  }
  if (req.method === "DELETE") {
    await db.deleteRow(p, pid, "exercises", id);
    return res.status(200).json({ ok: true });
  }
  return allow(res, "POST, PATCH, DELETE");
}

async function weight(req, res, p, pid) {
  if (req.method === "POST") {
    const kg = Number(req.body?.kg);
    if (!Number.isFinite(kg) || kg < 20 || kg > 400) return res.status(400).json({ error: "Weight must be between 20 and 400 kg" });
    const w = db.sanitizeWeight({ ...req.body, kg });
    await db.insertWeight(p, pid, w);
    return res.status(201).json(w);
  }
  if (req.method === "DELETE") {
    const id = idOf(req);
    if (!id) return res.status(400).json({ error: "Missing id" });
    await db.deleteRow(p, pid, "body_weight", id);
    return res.status(200).json({ ok: true });
  }
  return allow(res, "POST, DELETE");
}

async function measurements(req, res, p, pid) {
  if (req.method === "POST") {
    const m = db.sanitizeMeasurement(req.body || {});
    if (!Object.keys(m.data).length) return res.status(400).json({ error: "Enter at least one measurement" });
    await db.insertMeasurement(p, pid, m);
    return res.status(201).json(m);
  }
  if (req.method === "DELETE") {
    const id = idOf(req);
    if (!id) return res.status(400).json({ error: "Missing id" });
    await db.deleteRow(p, pid, "measurements", id);
    return res.status(200).json({ ok: true });
  }
  return allow(res, "POST, DELETE");
}

const SIGNED_IN = { data, stats, workouts, routines, exercises, weight, measurements };

export async function route(req, res) {
  res.setHeader("Cache-Control", "no-store");
  // Take the endpoint name from the URL. Vercel's catch-all parameter isn't always populated.
  const fromUrl = new URL(req.url || "/", "http://x").pathname.replace(/^\/api\/?/, "").split("/")[0];
  const name = fromUrl || [].concat(req.query?.path || [])[0];
  try {
    if (name === "ping") {
      return res.status(200).json({
        ok: true,
        schema: db.SCHEMA_VERSION,
        databaseUrlSet: Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL),
        setupCodeRequired: Boolean(process.env.PROFILE_CODE),
        maxProfiles: LIMITS.maxProfiles,
        time: new Date().toISOString(),
      });
    }
    await db.ensureSchema();
    const p = db.db();
    if (name === "profiles") return profiles(req, res, p);
    const handler = SIGNED_IN[name];
    if (!handler) return res.status(404).json({ error: `No such endpoint: /api/${name || ""}` });
    const auth = await authenticate(req, p);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    return handler(req, res, p, auth.pid);
  } catch (err) {
    console.error(err);
    if (/No database URL/.test(String(err.message))) {
      return res.status(503).json({ error: "Database not connected. In Vercel, add Neon under Storage, then redeploy." });
    }
    return res.status(500).json({ error: "Server error. Check the function logs in Vercel." });
  }
}
