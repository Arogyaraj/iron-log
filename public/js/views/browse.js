// Library: built-in and custom exercises, records and history per exercise, custom exercise editor.
import { S, emit } from "../store.js";
import { $, esc, toast } from "../ui.js";
import { api } from "../api.js";
import { MUSCLES, KIND_LABEL, exerciseList, exMeta, priorBest, e1rm, round1, toDisp, fmtW, fmtVol, unit, isDone, counts, fmtDay, buildLookup } from "../domain.js";
import { openWorkout } from "./train.js";

export function render() {
  const q = S.libQuery.trim().toLowerCase();
  const chips = ["", ...MUSCLES.filter((m) => m !== "Other")];
  $("libChips").innerHTML = chips.map((m) => `<button type="button" class="chip${S.libMuscle === m ? " on" : ""}" data-muscle="${esc(m)}">${m || "All"}</button>`).join("");
  const items = exerciseList()
    .filter((e) => (!S.libMuscle || e.muscle === S.libMuscle) && (!q || e.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const sessionCount = new Map();
  for (const w of S.workouts) {
    if (!isDone(w)) continue;
    for (const e of w.entries) sessionCount.set(e.name.toLowerCase(), (sessionCount.get(e.name.toLowerCase()) || 0) + 1);
  }
  $("libList").innerHTML = items.length
    ? items.map((e) => `<button class="feed-btn" type="button" data-ex="${esc(e.name)}">
        <span class="feed-ico">${e.custom ? "★" : "•"}</span>
        <span class="grow"><strong>${esc(e.name)}</strong><span class="muted">${esc(e.muscle)} · ${KIND_LABEL[e.kind]} · ${sessionCount.get(e.name.toLowerCase()) || 0} sessions</span></span>
      </button>`).join("")
    : `<div class="card empty"><p class="muted">No exercises match. Add a custom one.</p></div>`;
}

export function openExercise(name) {
  const meta = exMeta(name);
  const best = priorBest(name, null);
  const sessions = S.workouts.filter((w) => isDone(w) && w.entries.some((e) => e.name.toLowerCase() === name.toLowerCase()));
  $("exTitle").textContent = meta.name;
  $("exMeta").textContent = `${meta.muscle} · ${KIND_LABEL[meta.kind]}${meta.custom ? " · custom" : ""}`;
  const recs = meta.kind === "weight"
    ? [["Heaviest", best.weight ? fmtW(best.weight) : "—"], ["Est. 1RM", best.e1rm ? fmtW(round1(best.e1rm)) : "—"], ["Best set volume", best.volume ? fmtVol(best.volume) : "—"]]
    : meta.kind === "bodyweight" ? [["Most reps", best.reps || "—"]] : [["Sessions", sessions.length]];
  $("exRecords").innerHTML = recs.map(([l, v]) => `<div class="kpi"><span>${l}</span><b>${v}</b></div>`).join("");

  const last12 = sessions.slice(0, 12).reverse();
  const score = (w) => {
    const e = w.entries.find((x) => x.name.toLowerCase() === name.toLowerCase());
    const sets = e.sets.filter(counts);
    if (meta.kind === "weight") return Math.max(0, ...sets.map((s) => e1rm(s.weight, s.reps) || s.weight));
    if (meta.kind === "bodyweight") return Math.max(0, ...sets.map((s) => s.reps));
    return Math.max(0, ...sets.map((s) => s.time || 0));
  };
  const vals = last12.map(score);
  const max = Math.max(1, ...vals);
  $("exChart").innerHTML = last12.length
    ? last12.map((w, i) => `<div class="c"><small>${vals[i] ? round1(meta.kind === "weight" ? toDisp(vals[i]) : vals[i]) : ""}</small><div class="bar-area"><i style="height:${Math.max(3, Math.round((vals[i] / max) * 100))}%"></i></div><small>${new Date(w.startedAt).getDate()}</small></div>`).join("")
    : `<p class="muted">No history yet.</p>`;
  $("exChartLabel").textContent = meta.kind === "weight" ? `Est. 1RM by session (${unit()})` : meta.kind === "bodyweight" ? "Best reps by session" : "Best time by session (s)";
  $("exHistory").innerHTML = sessions.length
    ? sessions.slice(0, 30).map((w) => {
        const e = w.entries.find((x) => x.name.toLowerCase() === name.toLowerCase());
        const txt = e.sets.filter(counts).map((s) => (meta.kind === "weight" ? `${toDisp(s.weight)}×${s.reps}` : meta.kind === "bodyweight" ? `${s.reps}` : `${s.time}s`)).join(", ");
        return `<button class="feed-btn" type="button" data-open="${w.id}"><span class="feed-ico">✓</span><span class="grow"><strong>${fmtDay(w.startedAt)}</strong><span class="muted">${esc(txt || "no sets")}</span></span></button>`;
      }).join("")
    : `<div class="card empty"><p class="muted">Not logged in any session yet.</p></div>`;

  $("exEdit").classList.toggle("hide", !meta.custom);
  $("exDelete").classList.toggle("hide", !meta.custom);
  $("exEdit").dataset.id = meta.custom ? meta.id : "";
  $("exDelete").dataset.id = meta.custom ? meta.id : "";
  $("dlgEx").showModal();
}

function openCustomDialog(ex = null) {
  S.editingCustom = ex;
  $("customTitle").textContent = ex ? "Edit exercise" : "Custom exercise";
  $("customName").value = ex ? ex.name : "";
  $("customMuscle").innerHTML = MUSCLES.map((m) => `<option ${ex && ex.muscle === m ? "selected" : ""}>${m}</option>`).join("");
  $("customKind").value = ex ? ex.kind : "weight";
  $("dlgCustom").showModal();
}

export function wire() {
  $("libSearch").addEventListener("input", (e) => { S.libQuery = e.target.value; render(); });
  $("libChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-muscle]");
    if (b) { S.libMuscle = b.dataset.muscle; render(); }
  });
  $("libList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ex]");
    if (b) openExercise(b.dataset.ex);
  });
  $("newCustom").addEventListener("click", () => openCustomDialog(null));
  $("customForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = { name: $("customName").value.trim(), muscle: $("customMuscle").value, kind: $("customKind").value };
    if (!body.name) return toast("Name the exercise");
    try {
      if (S.editingCustom) {
        const saved = await api(`/api/exercises?id=${encodeURIComponent(S.editingCustom.id)}`, { method: "PATCH", body });
        S.exercises = S.exercises.map((x) => (x.id === saved.id ? saved : x));
      } else {
        S.exercises.push(await api("/api/exercises", { method: "POST", body }));
      }
      buildLookup();
      $("dlgCustom").close();
      toast("Exercise saved");
      emit();
    } catch (err) {
      toast(err.message);
    }
  });
  $("exEdit").addEventListener("click", () => {
    const ex = S.exercises.find((x) => x.id === $("exEdit").dataset.id);
    if (!ex) return;
    $("dlgEx").close();
    openCustomDialog(ex);
  });
  $("exDelete").addEventListener("click", async () => {
    const id = $("exDelete").dataset.id;
    if (!id || !confirm("Delete this custom exercise? Past sessions keep their names.")) return;
    try {
      await api(`/api/exercises?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      S.exercises = S.exercises.filter((x) => x.id !== id);
      buildLookup();
      $("dlgEx").close();
      emit();
    } catch (err) {
      toast(err.message);
    }
  });
  $("exHistory").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    if (b) openWorkout(b.dataset.open);
  });
}
