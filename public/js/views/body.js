// Body: bodyweight log and body measurements.
import { S, emit } from "../store.js";
import { $, esc, toast } from "../ui.js";
import { api } from "../api.js";
import { localIso, fmtW, fmtIso, toDisp, unit, LB, isLb, round2 } from "../domain.js";

const MEASURE_LABELS = { neck: "Neck", shoulders: "Shoulders", chest: "Chest", bicep: "Bicep", forearm: "Forearm", waist: "Waist", hips: "Hips", thigh: "Thigh", calf: "Calf" };

export function render() {
  if (!$("wDate").value) $("wDate").value = localIso();
  const list = S.weights;
  const last = list[list.length - 1], prev = list[list.length - 2];
  const signed = (n) => `${n > 0 ? "+" : ""}${toDisp(n)} ${unit()}`;
  $("wStats").innerHTML = [
    ["Latest", last ? fmtW(last.kg) : "—"],
    ["Change", last && prev ? signed(last.kg - prev.kg) : "—"],
    ["Entries", list.length],
  ].map(([l, v]) => `<div class="kpi"><span>${l}</span><b>${v}</b></div>`).join("");

  const recent = list.slice(-14);
  if (!recent.length) {
    $("wChart").innerHTML = `<p class="muted">No entries yet.</p>`;
  } else {
    const vals = recent.map((x) => x.kg);
    const min = Math.min(...vals), span = Math.max(...vals) - min || 1;
    $("wChart").innerHTML = recent.map((x) => `<div class="c"><small>${toDisp(x.kg)}</small><div class="bar-area"><i style="height:${20 + ((x.kg - min) / span) * 80}%"></i></div><small>${new Date(x.day + "T00:00").getDate()}</small></div>`).join("");
  }
  $("wList").innerHTML = list.length
    ? list.slice().reverse().map((x) => `<div class="feed-item">
        <div class="feed-ico">⚖</div>
        <div class="grow"><strong>${fmtW(x.kg)}</strong><div class="muted">${fmtIso(x.day)}</div></div>
        <button class="linkish" type="button" data-del-w="${x.id}">Delete</button></div>`).join("")
    : `<div class="card empty"><p class="muted">Log your first weigh-in above.</p></div>`;

  $("mList").innerHTML = S.measurements.length
    ? S.measurements.slice().reverse().map((m) => `<div class="card meas">
        <div class="routine-head"><strong>${fmtIso(m.day)}</strong><button class="linkish" type="button" data-del-m="${m.id}">Delete</button></div>
        <div class="meas-grid">${Object.entries(m.data).map(([k, v]) => `<span><span class="muted">${MEASURE_LABELS[k] || k}</span> <b>${v} cm</b></span>`).join("")}</div>
      </div>`).join("")
    : `<div class="card empty"><p class="muted">Track chest, waist and other measurements here.</p></div>`;
}

export function wire() {
  $("wForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = parseFloat($("wKg").value.replace(",", ".")) || 0;
    const kg = isLb() ? v / LB : v;
    if (kg < 20 || kg > 400) return toast(`Enter a weight between ${toDisp(20)} and ${toDisp(400)} ${unit()}`);
    try {
      S.weights.push(await api("/api/weight", { method: "POST", body: { kg: round2(kg), day: $("wDate").value || localIso() } }));
      S.weights.sort((a, b) => a.day.localeCompare(b.day));
      $("wKg").value = "";
      toast("Weight logged");
      emit();
    } catch (err) {
      toast(err.message);
    }
  });

  $("wList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-del-w]");
    if (!b) return;
    try {
      await api(`/api/weight?id=${encodeURIComponent(b.dataset.delW)}`, { method: "DELETE" });
      S.weights = S.weights.filter((x) => x.id !== b.dataset.delW);
      emit();
    } catch (err) {
      toast(err.message);
    }
  });

  $("addMeasure").addEventListener("click", () => {
    $("measureRows").innerHTML = Object.entries(MEASURE_LABELS).map(([k, label]) => `
      <label class="meas-field"><span class="lbl">${label} (cm)</span><input class="field" type="number" step="0.1" min="1" max="300" inputmode="decimal" data-mk="${k}"></label>`).join("");
    $("measureDate").value = localIso();
    $("dlgMeasure").showModal();
  });
  $("measureForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {};
    document.querySelectorAll("[data-mk]").forEach((inp) => { if (inp.value !== "") data[inp.dataset.mk] = parseFloat(inp.value); });
    if (!Object.keys(data).length) return toast("Enter at least one measurement");
    try {
      S.measurements.push(await api("/api/measurements", { method: "POST", body: { day: $("measureDate").value || localIso(), data } }));
      S.measurements.sort((a, b) => a.day.localeCompare(b.day));
      $("dlgMeasure").close();
      toast("Measurements saved");
      emit();
    } catch (err) {
      toast(err.message);
    }
  });
  $("mList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-del-m]");
    if (!b || !confirm("Delete these measurements?")) return;
    try {
      await api(`/api/measurements?id=${encodeURIComponent(b.dataset.delM)}`, { method: "DELETE" });
      S.measurements = S.measurements.filter((x) => x.id !== b.dataset.delM);
      emit();
    } catch (err) {
      toast(err.message);
    }
  });
}
