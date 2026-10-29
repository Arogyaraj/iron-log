// Training: starting sessions, the live editor, edits to past sessions, records, rest timer, summaries.
import { S, emit } from "../store.js";
import { $, esc, toast, setSync, navigate } from "../ui.js";
import { api, session } from "../api.js";
import {
  uid, clone, dur, durShort, restLabel, fmtDay, clock, num, e1rm, exMeta, unit, toDisp, toKg, round1, ago,
  fmtW, fmtVol, sessionTotals, prevSet, priorBest, newSet, lastUsedRoutine, exerciseNames,
} from "../domain.js";
import { afterHistoryChange } from "./log.js";

const SET_LABEL = { warmup: "W", drop: "D", failure: "F" };
const PR_LABEL = { weight: "Heaviest", e1rm: "Est. 1RM", volume: "Set volume", reps: "Most reps" };
const TYPES = ["normal", "warmup", "drop", "failure"];

/* ---------- picker and editor ---------- */

export function render() {
  const sess = S.sess;
  $("sessWrap").classList.toggle("hide", !sess);
  $("pickWrap").classList.toggle("hide", !!sess);
  if (sess) return renderSession();
  const folders = new Map();
  for (const r of S.routines) {
    if (!folders.has(r.folder || "")) folders.set(r.folder || "", []);
    folders.get(r.folder || "").push(r);
  }
  $("pickList").innerHTML = S.routines.length
    ? [...folders.entries()].map(([folder, rs]) => `
        ${folder ? `<h3 class="month">${esc(folder)}</h3>` : ""}
        ${rs.map((r) => `<button class="row-pick" type="button" data-start-r="${r.id}">
          <span><strong>${esc(r.name)}</strong><small class="muted">${r.exercises.length} exercises · last ${ago(lastUsedRoutine(r.id))}</small></span>
          <span class="mono">Start →</span></button>`).join("")}`).join("")
    : `<div class="card empty"><p class="muted">No routines yet. Build one in Plan, or log an empty workout.</p></div>`;
}


function renderSession() {
  const { w, mode } = S.sess;
  const live = mode === "live";
  $("sessHead").innerHTML = `
    <div class="grow">
      <p class="eyebrow">${live ? `In progress · <span id="liveClock">${dur(Date.now() - w.startedAt)}</span>` : `Editing · ${fmtDay(w.startedAt)}`}</p>
      <input class="sess-title-input" id="sessTitle" value="${esc(w.title)}" maxlength="80" aria-label="Workout title">
    </div>
    <div class="actions">
      ${live
        ? `<button class="btn ghost" type="button" data-act="discard">Discard</button><button class="btn" type="button" data-act="finish">Finish</button>`
        : `<button class="btn ghost" type="button" data-act="cancel">Cancel</button><button class="btn" type="button" data-act="save">Save</button>`}
    </div>`;
  renderEntries();
  $("exList").innerHTML = exerciseNames().map((n) => `<option value="${esc(n)}">`).join("");
}

export function renderEntries() {
  const { w } = S.sess;
  if (!w.entries.length) {
    $("sessBody").innerHTML = `<p class="muted">Add your first exercise below.</p>`;
    return;
  }
  const groups = [];
  w.entries.forEach((e, i) => {
    const last = groups[groups.length - 1];
    if (e.superset && last && last.key === e.superset) last.items.push(i);
    else groups.push({ key: e.superset || null, items: [i] });
  });
  $("sessBody").innerHTML = groups.map((g) => {
    const inner = g.items.map((i) => entryHtml(w.entries[i], i)).join("");
    return g.key ? `<div class="ss-group"><div class="ss-label mono">Superset ${esc(g.key)}</div>${inner}</div>` : inner;
  }).join("");
  updateLiveClock();
}

function entryHtml(e, ei) {
  const meta = exMeta(e.name);
  const kind = meta.kind;
  const showRpe = kind === "weight" && S.profile.settings.showRpe;
  const cls = kind === "weight" ? "k-w" : kind === "bodyweight" ? "k-b" : "k-t";
  const heads = kind === "weight"
    ? ["Set", "Previous", unit(), "Reps", ...(showRpe ? ["RPE"] : []), "", ""]
    : kind === "bodyweight" ? ["Set", "Previous", "Reps", "", ""] : ["Set", "Previous", "Sec", "", ""];
  let normal = 0;
  const rows = e.sets.map((s, si) => {
    if (s.type === "normal") normal++;
    const label = s.type === "normal" ? normal : SET_LABEL[s.type];
    const p = prevSet(e.name, si, S.sess.w.id);
    const prevText = !p ? "—" : kind === "weight" ? `${toDisp(p.weight)}×${p.reps}` : kind === "bodyweight" ? `${p.reps} reps` : `${p.time || 0}s`;
    const at = `data-ei="${ei}" data-si="${si}"`;
    return `<div class="set-row ${cls}${showRpe ? " rpe" : ""}${s.done ? " is-done" : ""}">
      <button class="set-num t-${s.type}" type="button" data-type="${ei}:${si}" aria-label="Set type, tap to change">${label}${s.pr && s.pr.length ? '<i class="pr-dot" aria-hidden="true"></i>' : ""}</button>
      <button class="prev" type="button" data-fill="${ei}:${si}" title="Fill from previous">${prevText}</button>
      ${kind === "weight"
        ? `<input class="field num" inputmode="decimal" value="${s.weight ? toDisp(s.weight) : ""}" placeholder="0" ${at} data-f="weight" aria-label="${unit()}">
           <input class="field num" inputmode="numeric" value="${s.reps || ""}" placeholder="0" ${at} data-f="reps" aria-label="Reps">`
        : kind === "bodyweight"
        ? `<input class="field num" inputmode="numeric" value="${s.reps || ""}" placeholder="0" ${at} data-f="reps" aria-label="Reps">`
        : `<input class="field num" inputmode="numeric" value="${s.time || ""}" placeholder="0" ${at} data-f="time" aria-label="Seconds">`}
      ${showRpe ? `<input class="field num" inputmode="decimal" value="${s.rpe ?? ""}" placeholder="—" ${at} data-f="rpe" aria-label="RPE">` : ""}
      <button class="tick${s.done ? " on" : ""}" type="button" data-done="${ei}:${si}" aria-pressed="${!!s.done}" aria-label="Mark set complete">${s.done ? "✓" : ""}</button>
      <button class="icon-btn sm" type="button" data-rmset="${ei}:${si}" aria-label="Remove set">−</button>
    </div>`;
  }).join("");
  return `<section class="card ex-card">
    <div class="ex-head">
      <div class="grow">
        <h3>${esc(e.name)}</h3>
        <small class="muted mono">${esc(meta.muscle)}${e.rest ? ` · rest ${restLabel(e.rest)}` : ""}</small>
        ${e.note ? `<p class="ex-note">${esc(e.note)}</p>` : ""}
      </div>
      <button class="icon-btn sm" type="button" data-exopts="${ei}" aria-label="Exercise options">⋯</button>
    </div>
    <div class="set-row set-head mono ${cls}${showRpe ? " rpe" : ""}">${heads.map((h) => `<span>${h}</span>`).join("")}</div>
    ${rows || `<p class="muted">No sets yet.</p>`}
    <div class="actions"><button class="btn ghost sm" type="button" data-addset="${ei}">+ Set</button></div>
  </section>`;
}

function updateLiveClock() {
  const el = $("liveClock");
  if (el && S.sess) el.textContent = dur(Date.now() - S.sess.w.startedAt);
}

/* ---------- starting, saving, finishing ---------- */

export function startWorkout(routineId) {
  if (S.sess) {
    toast(S.sess.mode === "live" ? "Finish or discard your current workout first" : "Save or cancel your edit first");
    return navigate("train");
  }
  const r = S.routines.find((x) => x.id === routineId);
  const w = {
    id: uid(), title: r ? r.name : "Empty workout", routineId: r ? r.id : "",
    startedAt: Date.now(), endedAt: 0, notes: "",
    entries: r
      ? r.exercises.map((e) => ({
          id: uid(), name: e.name, note: e.note || "", superset: "", rest: e.rest || 0,
          sets: Array.from({ length: e.sets }, (_, i) => newSet(e.name, i, e.reps, null)),
        }))
      : [],
  };
  createSession(w);
}

async function createSession(w) {
  try {
    const saved = await api("/api/workouts", { method: "POST", body: w });
    S.workouts.unshift(saved);
    S.sess = { mode: "live", w: clone(saved) };
    keepAwake(true);
    startLive();
    navigate("train");
    emit();
  } catch (err) {
    toast(err.message);
  }
}

export function persist() {
  if (!S.sess || S.sess.mode === "edit") return;
  S.dirty = true;
  setSync("saving");
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(() => flush(), 1500);
}

let inflight = Promise.resolve();
export function flush(extra = {}) {
  clearTimeout(S.saveTimer);
  const sx = S.sess;
  if (!sx) return Promise.resolve(null);
  S.dirty = false;
  const body = { title: sx.w.title, notes: sx.w.notes, entries: clone(sx.w.entries), ...extra };
  const id = sx.w.id;
  inflight = inflight
    .catch(() => {})
    .then(() => api(`/api/workouts?id=${encodeURIComponent(id)}`, { method: "PATCH", body, keepalive: true }))
    .then(
      (saved) => { setSync("saved"); return saved; },
      (err) => { setSync("error"); toast(err.message); return null; }
    );
  return inflight;
}

export function flushIfDirty() {
  if (S.dirty && S.sess && S.sess.mode === "live") flush();
}

async function finishWorkout() {
  if (!S.sess || S.sess.mode !== "live") return;
  const saved = await flush({ endedAt: Date.now() });
  if (!saved) return;
  const i = S.workouts.findIndex((x) => x.id === saved.id);
  if (i >= 0) S.workouts[i] = saved;
  S.sess = null;
  stopLive();
  afterHistoryChange();
  openSummary(saved);
  navigate("today");
}

async function saveEdit() {
  if (!S.sess || S.sess.mode !== "edit") return;
  const saved = await flush();
  if (!saved) return;
  const i = S.workouts.findIndex((x) => x.id === saved.id);
  if (i >= 0) S.workouts[i] = saved;
  S.sess = null;
  toast("Changes saved");
  afterHistoryChange();
  navigate("log");
}

async function discardWorkout() {
  if (!S.sess || !confirm("Discard this workout? It will be deleted.")) return;
  const id = S.sess.w.id;
  clearTimeout(S.saveTimer);
  await inflight.catch(() => {});
  try {
    await api(`/api/workouts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    S.workouts = S.workouts.filter((x) => x.id !== id);
    S.sess = null;
    stopLive();
    afterHistoryChange();
    navigate("train");
  } catch (err) {
    toast(err.message);
  }
}

function cancelEdit() {
  clearTimeout(S.saveTimer);
  S.sess = null;
  navigate("log");
}

/* ---------- history: details, edit, repeat, save as routine ---------- */

export function openWorkout(id) {
  const w = S.workouts.find((x) => x.id === id);
  if (!w) return;
  const t = sessionTotals(w);
  $("woTitle").textContent = w.title;
  $("woMeta").textContent = `${fmtDay(w.startedAt)} · ${clock(w.startedAt)} · ${durShort(w.endedAt - w.startedAt)} · ${fmtVol(t.vol)}`;
  $("woBody").innerHTML = w.entries.map((e) => {
    const kind = exMeta(e.name).kind;
    return `<div class="wo-ex"><h4>${esc(e.name)}</h4>${e.note ? `<p class="ex-note">${esc(e.note)}</p>` : ""}
      ${e.sets.map((s, i) => `<div class="wo-set${s.done ? "" : " skipped"}">
        <span class="mono">${SET_LABEL[s.type] || i + 1}</span>
        <span>${kind === "weight" ? `${fmtW(s.weight)} × ${s.reps}` : kind === "bodyweight" ? `${s.reps} reps` : `${s.time || 0}s`}${s.rpe ? ` @ ${s.rpe}` : ""}</span>
        <span class="mono muted">${s.pr && s.pr.length ? "★ record" : s.done ? "done" : "skipped"}</span></div>`).join("")}
    </div>`;
  }).join("") + (w.notes ? `<p class="ex-note">${esc(w.notes)}</p>` : "");
  $("woEdit").dataset.id = w.id;
  $("woRepeat").dataset.id = w.id;
  $("woRoutine").dataset.id = w.id;
  $("woDelete").dataset.id = w.id;
  $("dlgWorkout").showModal();
}

function editWorkout(id) {
  if (S.sess) return toast("Finish or discard your current workout first");
  const w = S.workouts.find((x) => x.id === id);
  if (!w) return;
  $("dlgWorkout").close();
  S.sess = { mode: "edit", w: clone(w) };
  navigate("train");
  emit();
}

function repeatWorkout(id) {
  const w = S.workouts.find((x) => x.id === id);
  if (!w) return;
  if (S.sess) return toast("Finish or discard your current workout first");
  $("dlgWorkout").close();
  createSession({
    id: uid(), title: w.title, routineId: w.routineId || "", startedAt: Date.now(), endedAt: 0, notes: "",
    entries: w.entries.map((e) => ({
      id: uid(), name: e.name, note: e.note || "", superset: e.superset || "", rest: e.rest || 0,
      sets: e.sets.map((s) => ({ id: uid(), type: s.type, reps: s.reps, weight: s.weight, rpe: s.rpe ?? null, time: s.time || 0, done: false, pr: [] })),
    })),
  });
}

async function saveAsRoutine(id) {
  const w = S.workouts.find((x) => x.id === id);
  if (!w) return;
  const name = prompt("Routine name", w.title);
  if (!name) return;
  const exercises = w.entries.map((e) => {
    const normal = e.sets.filter((s) => s.type === "normal");
    const reps = normal.length ? normal[0].reps : e.sets[0] ? e.sets[0].reps : 8;
    return { name: e.name, sets: Math.max(1, Math.min(10, normal.length || e.sets.length || 1)), reps: String(reps || "8-12"), rest: e.rest || 0, note: e.note || "" };
  });
  try {
    S.routines.push(await api("/api/routines", { method: "POST", body: { name: name.slice(0, 60), folder: "", exercises } }));
    $("dlgWorkout").close();
    $("dlgSummary").close();
    toast("Saved as routine");
    emit();
  } catch (err) {
    toast(err.message);
  }
}

async function deleteWorkout(id) {
  if (!confirm("Delete this session permanently?")) return;
  try {
    await api(`/api/workouts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    S.workouts = S.workouts.filter((x) => x.id !== id);
    $("dlgWorkout").close();
    toast("Session deleted");
    afterHistoryChange();
  } catch (err) {
    toast(err.message);
  }
}

/* ---------- sets: completion, records, types, previous values ---------- */

const PR_KINDS = ["weight", "e1rm", "volume", "reps"];

function markDone(ei, si) {
  const e = S.sess.w.entries[ei];
  const s = e.sets[si];
  s.done = !s.done;
  s.pr = [];
  if (s.done) {
    const kind = exMeta(e.name).kind;
    const best = priorBest(e.name, S.sess.w.id);
    if (best.count && s.type !== "warmup") {
      const est = e1rm(s.weight, s.reps);
      if (kind === "weight" && s.weight > 0) {
        if (s.weight > best.weight) s.pr.push("weight");
        if (est > 0 && est > best.e1rm) s.pr.push("e1rm");
        if (s.reps > 0 && s.weight * s.reps > best.volume) s.pr.push("volume");
      }
      if (kind === "bodyweight" && s.reps > best.reps) s.pr.push("reps");
    }
    if (s.pr.length) toast(`New record · ${s.pr.map((k) => PR_LABEL[k]).join(", ")}`);
    startRest(e.rest || S.profile.settings.restDefault);
  }
  persist();
  renderEntries();
}

function openSummary(w) {
  const t = sessionTotals(w);
  const prs = [];
  for (const e of w.entries) for (const s of e.sets) for (const k of s.pr || []) {
    prs.push({
      name: e.name, label: PR_LABEL[k],
      value: k === "reps" ? `${s.reps} reps` : k === "volume" ? fmtVol(s.weight * s.reps) : k === "e1rm" ? fmtW(round1(e1rm(s.weight, s.reps))) : fmtW(s.weight),
    });
  }
  $("sumTitle").textContent = w.title;
  $("sumMeta").textContent = `${fmtDay(w.startedAt)} · ${durShort(w.endedAt - w.startedAt)}`;
  $("sumStats").innerHTML = [["Duration", durShort(w.endedAt - w.startedAt)], ["Sets", t.sets], ["Volume", fmtVol(t.vol)]]
    .map(([l, v]) => `<div class="kpi"><span>${l}</span><b>${v}</b></div>`).join("");
  $("sumPrs").innerHTML = prs.length
    ? prs.map((p) => `<div class="feed-item"><div class="feed-ico">★</div><div class="grow"><strong>${esc(p.name)}</strong><div class="muted">${esc(p.label)} · ${esc(p.value)}</div></div></div>`).join("")
    : `<p class="muted">No records this time. Consistency builds them.</p>`;
  $("sumExercises").innerHTML = w.entries.map((e) => `<div class="sum-row"><span>${esc(e.name)}</span><span class="mono muted">${e.sets.filter((s) => s.done).length} sets</span></div>`).join("");
  $("sumSaveRoutine").dataset.id = w.id;
  $("sumShare").dataset.id = w.id;
  $("dlgSummary").showModal();
}

function summaryText(w) {
  const t = sessionTotals(w);
  const lines = [`${w.title} · ${fmtDay(w.startedAt)}`, `${durShort(w.endedAt - w.startedAt)} · ${t.sets} sets · ${fmtVol(t.vol)}`, ""];
  for (const e of w.entries) {
    const kind = exMeta(e.name).kind;
    const sets = e.sets.filter((s) => s.done).map((s) => (kind === "weight" ? `${toDisp(s.weight)}×${s.reps}` : kind === "time" ? `${s.time}s` : `${s.reps}`));
    if (sets.length) lines.push(`${e.name}: ${sets.join(", ")}`);
  }
  return lines.join("\n");
}

/* ---------- exercise options ---------- */

function openExOpts(ei) {
  const e = S.sess.w.entries[ei];
  S.exIdx = ei;
  $("exoTitle").textContent = e.name;
  $("exoName").value = e.name;
  $("exoNote").value = e.note || "";
  $("exoRest").value = e.rest || "";
  $("exoSuperset").value = e.superset || "";
  $("dlgExOpts").showModal();
}

function applyExOpts() {
  const e = S.sess.w.entries[S.exIdx];
  const name = $("exoName").value.trim().slice(0, 80);
  if (name) e.name = name;
  e.note = $("exoNote").value.trim().slice(0, 300);
  e.rest = Math.max(0, Math.min(900, Math.round(num($("exoRest").value))));
  e.superset = $("exoSuperset").value;
  $("dlgExOpts").close();
  persist();
  renderSession();
}

function moveEntry(dir) {
  const arr = S.sess.w.entries;
  const ei = S.exIdx, to = ei + dir;
  if (to < 0 || to >= arr.length) return;
  [arr[ei], arr[to]] = [arr[to], arr[ei]];
  $("dlgExOpts").close();
  persist();
  renderEntries();
}

function deleteEntry() {
  if (!confirm("Remove this exercise from the workout?")) return;
  S.sess.w.entries.splice(S.exIdx, 1);
  $("dlgExOpts").close();
  persist();
  renderEntries();
}

/* ---------- rest timer, live clock, keep awake ---------- */

export function startRest(sec) {
  S.restEnd = Date.now() + sec * 1000;
  $("rest").classList.remove("hide");
  clearInterval(S.restTimer);
  updateRest();
  S.restTimer = setInterval(updateRest, 250);
}
function updateRest() {
  const left = Math.ceil((S.restEnd - Date.now()) / 1000);
  if (left <= 0) {
    hideRest();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    return;
  }
  $("restTime").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}
export function hideRest() {
  clearInterval(S.restTimer);
  S.restEnd = 0;
  $("rest").classList.add("hide");
}

export function startLive() {
  clearInterval(S.liveTimer);
  S.liveTimer = setInterval(updateLiveClock, 1000);
}
export function stopLive() {
  clearInterval(S.liveTimer);
  hideRest();
  keepAwake(false);
}

export async function keepAwake(on) {
  if (!("wakeLock" in navigator)) return;
  try {
    if (on && S.profile.settings.keepAwake && S.sess && S.sess.mode === "live") {
      if (!S.wakeLock) S.wakeLock = await navigator.wakeLock.request("screen");
    } else if (S.wakeLock) {
      await S.wakeLock.release();
      S.wakeLock = null;
    }
  } catch {
    S.wakeLock = null;
  }
}

/* ---------- wiring ---------- */

export function wire() {
  $("sessWrap").addEventListener("click", (e) => {
    const at = (sel) => e.target.closest(sel);
    let t;
    if ((t = at("[data-act]"))) {
      const a = t.dataset.act;
      if (a === "finish") return finishWorkout();
      if (a === "discard") return discardWorkout();
      if (a === "save") return saveEdit();
      if (a === "cancel") return cancelEdit();
    }
    if (!S.sess) return;
    if ((t = at("[data-done]"))) {
      const [ei, si] = t.dataset.done.split(":").map(Number);
      return markDone(ei, si);
    }
    if ((t = at("[data-type]"))) {
      const [ei, si] = t.dataset.type.split(":").map(Number);
      const s = S.sess.w.entries[ei].sets[si];
      s.type = TYPES[(TYPES.indexOf(s.type) + 1) % TYPES.length];
      persist();
      return renderEntries();
    }
    if ((t = at("[data-fill]"))) {
      const [ei, si] = t.dataset.fill.split(":").map(Number);
      const p = prevSet(S.sess.w.entries[ei].name, si, S.sess.w.id);
      if (!p) return;
      Object.assign(S.sess.w.entries[ei].sets[si], { weight: p.weight, reps: p.reps, time: p.time || 0 });
      persist();
      return renderEntries();
    }
    if ((t = at("[data-addset]"))) {
      const e = S.sess.w.entries[+t.dataset.addset];
      const prev = e.sets[e.sets.length - 1];
      e.sets.push(prev
        ? { id: uid(), type: "normal", reps: prev.reps, weight: prev.weight, rpe: prev.rpe, time: prev.time, done: false, pr: [] }
        : newSet(e.name, 0, 8, S.sess.w.id));
      persist();
      return renderEntries();
    }
    if ((t = at("[data-rmset]"))) {
      const [ei, si] = t.dataset.rmset.split(":").map(Number);
      S.sess.w.entries[ei].sets.splice(si, 1);
      persist();
      return renderEntries();
    }
    if ((t = at("[data-exopts]"))) return openExOpts(+t.dataset.exopts);
  });

  // Typing saves values without re-rendering, so the keyboard stays open.
  document.addEventListener("input", (e) => {
    const tgt = e.target;
    if (tgt.id === "sessTitle" && S.sess) {
      S.sess.w.title = tgt.value.slice(0, 80);
      return persist();
    }
    const f = tgt.dataset && tgt.dataset.f;
    if (!f || !S.sess || tgt.dataset.ei === undefined) return;
    const s = S.sess.w.entries[+tgt.dataset.ei].sets[+tgt.dataset.si];
    if (f === "weight") s.weight = toKg(num(tgt.value));
    else if (f === "reps") s.reps = Math.max(0, Math.round(num(tgt.value)));
    else if (f === "time") s.time = Math.max(0, Math.round(num(tgt.value)));
    else if (f === "rpe") s.rpe = tgt.value === "" ? null : Math.min(10, Math.max(1, Math.round(num(tgt.value) * 2) / 2));
    persist();
  });

  $("addExForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!S.sess) return;
    const name = $("exName").value.trim().slice(0, 80);
    if (!name) return;
    const w = S.sess.w;
    const sets = [0, 1, 2].map((i) => newSet(name, i, 8, w.id));
    const existing = w.entries.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (existing) existing.sets.push(...sets);
    else w.entries.push({ id: uid(), name: exMeta(name).name, note: "", superset: "", rest: 0, sets });
    $("exName").value = "";
    persist();
    renderEntries();
  });

  $("startEmpty").addEventListener("click", () => startWorkout(""));
  $("exoForm").addEventListener("submit", (e) => { e.preventDefault(); applyExOpts(); });
  $("exoUp").addEventListener("click", () => moveEntry(-1));
  $("exoDown").addEventListener("click", () => moveEntry(1));
  $("exoDelete").addEventListener("click", deleteEntry);

  $("sumSaveRoutine").addEventListener("click", (e) => saveAsRoutine(e.currentTarget.dataset.id));
  $("sumShare").addEventListener("click", async (e) => {
    const w = S.workouts.find((x) => x.id === e.currentTarget.dataset.id);
    if (!w) return;
    const text = summaryText(w);
    if (navigator.share) {
      try { await navigator.share({ title: w.title, text }); } catch { /* cancelled */ }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast("Summary copied");
    }
  });
  $("woEdit").addEventListener("click", (e) => editWorkout(e.currentTarget.dataset.id));
  $("woRepeat").addEventListener("click", (e) => repeatWorkout(e.currentTarget.dataset.id));
  $("woRoutine").addEventListener("click", (e) => saveAsRoutine(e.currentTarget.dataset.id));
  $("woDelete").addEventListener("click", (e) => deleteWorkout(e.currentTarget.dataset.id));

  $("restAdd").addEventListener("click", () => { if (S.restEnd) S.restEnd += 30000; updateRest(); });
  $("restSkip").addEventListener("click", hideRest);
}
