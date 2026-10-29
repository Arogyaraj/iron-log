// Pure helpers: units, dates, workout maths, personal records. No DOM access.
import { S } from "./store.js";
import { LIBRARY } from "./exercises.js";

export const DAY = 864e5;
export const LB = 2.20462;
export const MUSCLES = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves", "Core", "Forearms", "Full body", "Cardio", "Other"];
export const KIND_LABEL = { weight: "Weight & reps", bodyweight: "Bodyweight", time: "Time" };

export const pad = (n) => String(n).padStart(2, "0");
export const round1 = (n) => Math.round(n * 10) / 10;
export const round2 = (n) => Math.round(n * 100) / 100;
export const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const localIso = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const fmtDay = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
export const fmtIso = (iso) => new Date(iso + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
export const clock = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const dur = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${h ? h + ":" : ""}${pad(m)}:${pad(s)}`;
};
export const durShort = (ms) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m} min`;
};
export const restLabel = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}:${pad(sec % 60)}` : `${sec}s`);
export const startOfWeek = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
};
export function ago(ts) {
  if (!ts) return "never";
  const d = Math.floor((Date.now() - ts) / DAY);
  if (d <= 0) return "today";
  if (d < 14) return `${d}d`;
  if (d < 60) return `${Math.round(d / 7)}w`;
  return `${Math.round(d / 30)}mo`;
}
export const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
export const isDone = (w) => !!w.endedAt;
export const e1rm = (weight, reps) => (weight > 0 && reps >= 1 && reps <= 12 ? weight * (1 + reps / 30) : 0);

/* Units: data is stored in kilograms and shown in the profile's unit. */
export const isLb = () => S.profile.settings.units === "lb";
export const unit = () => (isLb() ? "lb" : "kg");
export const toDisp = (kg) => round1(isLb() ? kg * LB : kg);
export const toKg = (v) => round2(isLb() ? v / LB : v);
export const fmtW = (kg) => `${toDisp(kg)} ${unit()}`;
export const fmtVol = (kg) => `${Math.round(isLb() ? kg * LB : kg).toLocaleString()} ${unit()}`;
export const counts = (s) => s.done && (S.profile.settings.includeWarmups || s.type !== "warmup");

/* Exercise lookup: built-in library plus the profile's custom exercises. */
const EX = new Map();
export function buildLookup() {
  EX.clear();
  for (const e of LIBRARY) EX.set(e.name.toLowerCase(), { name: e.name, muscle: e.muscle, kind: e.kind, custom: false });
  for (const e of S.exercises) EX.set(e.name.toLowerCase(), { name: e.name, muscle: e.muscle, kind: e.kind, custom: true, id: e.id });
}
export const exMeta = (name) => EX.get(String(name).toLowerCase()) || { name, muscle: "Other", kind: "weight", custom: false };
export const exerciseList = () => [...EX.values()];
export const exerciseNames = () => exerciseList().map((e) => e.name).sort((a, b) => a.localeCompare(b));

export function sessionTotals(w) {
  let sets = 0, vol = 0;
  for (const e of w.entries) for (const s of e.sets) {
    if (!counts(s)) continue;
    sets++;
    vol += (s.weight || 0) * (s.reps || 0);
  }
  return { sets, vol };
}

export function lastFinishedWith(name, excludeId) {
  const key = name.toLowerCase();
  for (const w of S.workouts) {
    if (!isDone(w) || w.id === excludeId) continue;
    const e = w.entries.find((x) => x.name.toLowerCase() === key);
    if (e) return e;
  }
  return null;
}

export function prevSet(name, idx, excludeId) {
  const e = lastFinishedWith(name, excludeId);
  return e && e.sets[idx] && e.sets[idx].done ? e.sets[idx] : null;
}

/* Best earlier results for an exercise. Warm-ups never count. */
export function priorBest(name, excludeId) {
  const key = name.toLowerCase();
  const best = { count: 0, weight: 0, e1rm: 0, volume: 0, reps: 0 };
  for (const w of S.workouts) {
    if (!isDone(w) || w.id === excludeId) continue;
    for (const e of w.entries) {
      if (e.name.toLowerCase() !== key) continue;
      for (const s of e.sets) {
        if (!s.done || s.type === "warmup") continue;
        best.count++;
        best.weight = Math.max(best.weight, s.weight || 0);
        best.e1rm = Math.max(best.e1rm, e1rm(s.weight, s.reps));
        best.volume = Math.max(best.volume, (s.weight || 0) * (s.reps || 0));
        best.reps = Math.max(best.reps, s.reps || 0);
      }
    }
  }
  return best;
}

export function newSet(name, idx, targetReps, excludeId) {
  const p = prevSet(name, idx, excludeId);
  return {
    id: uid(), type: "normal",
    reps: p ? p.reps : parseInt(targetReps, 10) || 0,
    weight: p ? p.weight : 0,
    rpe: null,
    time: p ? p.time : 0,
    done: false, pr: [],
  };
}

export const lastUsedRoutine = (routineId) => {
  const w = S.workouts.find((x) => x.routineId === routineId && isDone(x));
  return w ? w.startedAt : 0;
};

/* Loads the sign-in payload into state. Restores an open session if there is one. */
export function applyData(d) {
  S.profile = { name: d.profile.name || "Athlete", goal: d.profile.goal ?? 3, settings: { ...S.profile.settings, ...d.profile.settings } };
  S.routines = d.routines;
  S.workouts = d.workouts;
  S.weights = d.weights;
  S.exercises = d.exercises || [];
  S.measurements = d.measurements || [];
  buildLookup();
  if (!S.sess) {
    const open = S.workouts.find((w) => !isDone(w));
    if (open) S.sess = { mode: "live", w: clone(open) };
  }
}
