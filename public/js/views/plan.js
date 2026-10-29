// Routines: create, edit, duplicate, delete, folders, and ready-made programs.
import { S, emit } from "../store.js";
import { $, esc, toast } from "../ui.js";
import { api } from "../api.js";
import { ago, lastUsedRoutine, exerciseNames, uid, restLabel } from "../domain.js";
import { STARTER_PROGRAMS } from "../exercises.js";

export function render() {
  $("starterBtn").classList.toggle("hide", S.routines.length > 0);
  const folders = new Map();
  for (const r of S.routines) {
    const key = r.folder || "";
    if (!folders.has(key)) folders.set(key, []);
    folders.get(key).push(r);
  }
  $("routineList").innerHTML = S.routines.length
    ? [...folders.entries()].map(([folder, rs]) => `
        <h3 class="month">${esc(folder || "Unfiled")}</h3>
        ${rs.map((r) => `<article class="card routine">
          <div class="routine-head">
            <h3>${esc(r.name)}</h3>
            <span class="mono muted">${r.exercises.length} ex · last ${ago(lastUsedRoutine(r.id))}</span>
          </div>
          <ol class="routine-ex">
            ${r.exercises.map((e) => `<li><span>${esc(e.name)}</span><span class="mono muted">${e.sets} × ${esc(e.reps)}${e.rest ? ` · ${restLabel(e.rest)}` : ""}</span></li>`).join("")}
          </ol>
          <div class="actions">
            <button class="btn sm" type="button" data-start-r="${r.id}">Start</button>
            <button class="btn ghost sm" type="button" data-edit-r="${r.id}">Edit</button>
            <button class="btn ghost sm" type="button" data-dup-r="${r.id}">Duplicate</button>
            <button class="btn ghost sm danger-text" type="button" data-del-r="${r.id}">Delete</button>
          </div>
        </article>`).join("")}`).join("")
    : `<div class="card empty"><p class="muted">No routines yet. Add one, or start from a ready-made program.</p></div>`;
}

function rowHtml(e) {
  return `<div class="rx-row">
    <input class="field rx-name" value="${esc(e.name)}" list="exList" placeholder="Exercise" maxlength="80" aria-label="Exercise">
    <input class="field rx-sets" type="number" min="1" max="10" value="${e.sets}" aria-label="Sets">
    <input class="field rx-reps" value="${esc(e.reps)}" placeholder="8-12" maxlength="20" aria-label="Reps">
    <input class="field rx-rest" type="number" min="0" max="900" value="${e.rest || ""}" placeholder="rest s" aria-label="Rest seconds">
    <button type="button" class="icon-btn sm" data-rx-rm aria-label="Remove exercise">×</button>
  </div>`;
}

function openRoutineDialog(r = null) {
  S.editingRoutine = r;
  $("routineTitle").textContent = r ? "Edit routine" : "New routine";
  $("routineName").value = r ? r.name : "";
  $("routineFolder").value = r ? r.folder || "" : "";
  $("folderList").innerHTML = [...new Set(S.routines.map((x) => x.folder).filter(Boolean))].map((f) => `<option value="${esc(f)}">`).join("");
  $("exList").innerHTML = exerciseNames().map((n) => `<option value="${esc(n)}">`).join("");
  const rows = r && r.exercises.length ? r.exercises : [{ name: "", sets: 3, reps: "8-12", rest: 90 }];
  $("routineRows").innerHTML = rows.map(rowHtml).join("");
  $("dlgRoutine").showModal();
}

async function loadStarter() {
  if (S.routines.length && !confirm("Add these programs to your plan?")) return;
  try {
    for (const prog of STARTER_PROGRAMS) for (const r of prog.routines) {
      const body = { name: r.name, folder: prog.folder, exercises: r.exercises.map(([name, sets, reps, rest]) => ({ name, sets, reps: String(reps), rest })) };
      S.routines.push(await api("/api/routines", { method: "POST", body }));
    }
    toast("Programs added");
    emit();
  } catch (err) {
    toast(err.message);
  }
}

async function duplicateRoutine(id) {
  const r = S.routines.find((x) => x.id === id);
  if (!r) return;
  try {
    S.routines.push(await api("/api/routines", { method: "POST", body: { name: `${r.name} (copy)`, folder: r.folder, exercises: r.exercises } }));
    emit();
  } catch (err) {
    toast(err.message);
  }
}

async function deleteRoutine(id) {
  const r = S.routines.find((x) => x.id === id);
  if (!r || !confirm(`Delete "${r.name}"? Past sessions are kept.`)) return;
  try {
    await api(`/api/routines?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    S.routines = S.routines.filter((x) => x.id !== id);
    emit();
  } catch (err) {
    toast(err.message);
  }
}

export function wire() {
  $("newRoutine").addEventListener("click", () => openRoutineDialog(null));
  $("starterBtn").addEventListener("click", loadStarter);
  $("rxAdd").addEventListener("click", () => $("routineRows").insertAdjacentHTML("beforeend", rowHtml({ name: "", sets: 3, reps: "8-12", rest: 90 })));
  $("routineRows").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rx-rm]");
    if (b) b.closest(".rx-row").remove();
  });

  $("routineList").addEventListener("click", (e) => {
    const at = (sel) => e.target.closest(sel);
    let t;
    if ((t = at("[data-edit-r]"))) return openRoutineDialog(S.routines.find((r) => r.id === t.dataset.editR));
    if ((t = at("[data-dup-r]"))) return duplicateRoutine(t.dataset.dupR);
    if ((t = at("[data-del-r]"))) return deleteRoutine(t.dataset.delR);
  });

  $("routineForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const exercises = [...$("routineRows").querySelectorAll(".rx-row")]
      .map((row) => ({
        name: row.querySelector(".rx-name").value.trim(),
        sets: parseInt(row.querySelector(".rx-sets").value, 10) || 3,
        reps: row.querySelector(".rx-reps").value.trim() || "8-12",
        rest: Math.max(0, Math.round(parseFloat(row.querySelector(".rx-rest").value) || 0)),
      }))
      .filter((x) => x.name);
    if (!exercises.length) return toast("Add at least one exercise");
    const body = { name: $("routineName").value.trim() || "Untitled routine", folder: $("routineFolder").value.trim().slice(0, 40), exercises };
    try {
      if (S.editingRoutine) {
        const saved = await api(`/api/routines?id=${encodeURIComponent(S.editingRoutine.id)}`, { method: "PATCH", body });
        S.routines = S.routines.map((r) => (r.id === saved.id ? saved : r));
      } else {
        S.routines.push(await api("/api/routines", { method: "POST", body }));
      }
      $("dlgRoutine").close();
      toast("Routine saved");
      emit();
    } catch (err) {
      toast(err.message);
    }
  });
}
