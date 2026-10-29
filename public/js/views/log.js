// History: lifetime totals (server), a month calendar, volume and muscle charts, and the session list.
import { S, emit } from "../store.js";
import { $, esc, download, toast } from "../ui.js";
import { api } from "../api.js";
import { DAY, startOfWeek, localIso, fmtIso, fmtDay, durShort, pad, isDone, sessionTotals, fmtVol, toDisp, exMeta, counts } from "../domain.js";

export const monthKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}`; };

export async function loadMonth(key) {
  if (S.loadingMonth === key) return;
  S.loadingMonth = key;
  const [y, m] = key.split("-").map(Number);
  try {
    S.monthCache[key] = await api(`/api/workouts?from=${new Date(y, m - 1, 1).getTime()}&to=${new Date(y, m, 1).getTime()}`);
    if (S.view === "log") emit();
  } catch (err) {
    toast(err.message);
  } finally {
    S.loadingMonth = null;
  }
}

export function afterHistoryChange() {
  S.monthCache = {};
  refreshStats();
}

export async function refreshStats() {
  try {
    S.stats = await api("/api/stats");
    if (S.view === "log") emit();
  } catch {
    /* totals are optional; the screen still works without them */
  }
}

export function render() {
  const t0 = S.stats || { sessions: 0, thisMonth: 0, thisYear: 0, sets: 0, volume: 0, avgMinutes: 0 };
  $("hStats").innerHTML = [
    ["Sessions", t0.sessions],
    ["This month", t0.thisMonth],
    ["This year", t0.thisYear],
    ["Total sets", Number(t0.sets).toLocaleString()],
    ["Volume", fmtVol(t0.volume)],
    ["Avg length", t0.avgMinutes ? durShort(t0.avgMinutes * 60000) : "—"],
  ].map(([l, v]) => `<div class="kpi"><span>${l}</span><b>${v}</b></div>`).join("");

  const key = monthKey(S.calMonth);
  if (!S.monthCache[key]) loadMonth(key);
  const sessions = (S.monthCache[key] || []).filter(isDone);
  renderCalendar(sessions);

  const ws = startOfWeek();
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const start = ws - i * 7 * DAY;
    const v = S.workouts.filter((w) => isDone(w) && w.startedAt >= start && w.startedAt < start + 7 * DAY)
      .reduce((a, w) => a + sessionTotals(w).vol, 0);
    weeks.push({ start, v });
  }
  const max = Math.max(1, ...weeks.map((w) => w.v));
  $("vChart").innerHTML = weeks.map((w) => `<div class="c"><small>${w.v ? Math.round(toDisp(w.v) / 1000 * 10) / 10 + "k" : ""}</small><div class="bar-area"><i style="height:${Math.max(2, Math.round((w.v / max) * 100))}%"></i></div><small>${new Date(w.start).getDate()}</small></div>`).join("");

  const since = Date.now() - 28 * DAY;
  const split = new Map();
  for (const w of S.workouts) {
    if (!isDone(w) || w.startedAt < since) continue;
    for (const e of w.entries) {
      const m = exMeta(e.name).muscle;
      const n = e.sets.filter(counts).length;
      if (n) split.set(m, (split.get(m) || 0) + n);
    }
  }
  const totalSets = [...split.values()].reduce((a, b) => a + b, 0);
  $("muscleSplit").innerHTML = totalSets
    ? [...split.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `<div class="hbar-row">
        <span class="hbar-label">${esc(m)}</span>
        <span class="hbar-track"><i style="width:${Math.round((n / totalSets) * 100)}%"></i></span>
        <span class="mono muted">${n}</span></div>`).join("")
    : `<p class="muted">Finish a session to see your muscle split for the last 4 weeks.</p>`;

  const list = S.calDay ? sessions.filter((w) => localIso(new Date(w.startedAt)) === S.calDay) : sessions;
  $("logTitle").textContent = S.calDay ? `Sessions on ${fmtIso(S.calDay)}` : `Sessions in ${new Date(S.calMonth).toLocaleDateString(undefined, { month: "long" })}`;
  $("clearDay").classList.toggle("hide", !S.calDay);
  $("hList").innerHTML = list.length
    ? list.slice().reverse().map((w) => {
        const t = sessionTotals(w);
        return `<button class="feed-btn" type="button" data-open="${w.id}">
          <span class="feed-ico">✓</span>
          <span class="grow"><strong>${esc(w.title)}</strong>
          <span class="muted">${fmtDay(w.startedAt)} · ${durShort(w.endedAt - w.startedAt)} · ${t.sets} sets · ${fmtVol(t.vol)}</span></span>
        </button>`;
      }).join("")
    : `<div class="card empty"><p class="muted">${S.calDay ? "No session on this day." : "No sessions this month."}</p></div>`;
}

function renderCalendar(done) {
  const first = new Date(S.calMonth);
  const year = first.getFullYear(), month = first.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const marked = new Set(done.map((w) => localIso(new Date(w.startedAt))));
  const today = localIso();
  let cells = "";
  for (let i = 0; i < offset; i++) cells += `<span class="cal-cell blank"></span>`;
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${pad(month + 1)}-${pad(d)}`;
    cells += `<button type="button" class="cal-cell${marked.has(iso) ? " has" : ""}${iso === today ? " today" : ""}${S.calDay === iso ? " sel" : ""}" data-day="${iso}" aria-label="${fmtIso(iso)}${marked.has(iso) ? ", workout" : ""}">${d}</button>`;
  }
  $("calTitle").textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("calGrid").innerHTML = ["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span class="cal-head mono">${d}</span>`).join("") + cells;
}

function shiftMonth(delta) {
  const d = new Date(S.calMonth);
  S.calMonth = new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
  S.calDay = null;
  emit();
}

export function wire() {
  $("calGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-day]");
    if (!b) return;
    S.calDay = S.calDay === b.dataset.day ? null : b.dataset.day;
    emit();
  });
  $("calPrev").addEventListener("click", () => shiftMonth(-1));
  $("calNext").addEventListener("click", () => shiftMonth(1));
  $("clearDay").addEventListener("click", () => { S.calDay = null; emit(); });
}
