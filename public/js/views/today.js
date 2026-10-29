import { S } from "../store.js";
import { $, esc, navigate } from "../ui.js";
import { startOfWeek, ago, dur, fmtDay, durShort, isDone, sessionTotals, fmtVol, lastUsedRoutine } from "../domain.js";

const RING_C = 2 * Math.PI * 52;

export function render() {
  const weekStart = startOfWeek();
  const week = S.workouts.filter((w) => isDone(w) && w.startedAt >= weekStart);
  const goal = S.profile.goal;
  const pct = goal ? Math.min(1, week.length / goal) : 0;
  $("ringFill").style.strokeDasharray = `${RING_C}`;
  $("ringFill").style.strokeDashoffset = `${RING_C * (1 - pct)}`;
  $("ringPct").textContent = goal ? `${week.length}/${goal}` : String(week.length);
  const left = goal - week.length;
  $("tagline").textContent = goal
    ? left > 0 ? `${left} more session${left === 1 ? "" : "s"} to hit this week's goal.` : "Weekly goal hit. Keep it going."
    : "Set a weekly goal in settings.";
  $("tWeek").textContent = week.length;
  $("tVol").textContent = fmtVol(week.reduce((a, w) => a + sessionTotals(w).vol, 0));
  const last = S.workouts.find(isDone);
  $("tLast").textContent = last ? ago(last.startedAt) : "—";

  const live = S.sess && S.sess.mode === "live" ? S.sess.w : null;
  $("resume").classList.toggle("hide", !live);
  if (live) $("resumeTxt").textContent = `${live.title} · ${dur(Date.now() - live.startedAt)}`;

  const next = S.routines.slice().sort((a, b) => lastUsedRoutine(a.id) - lastUsedRoutine(b.id))[0];
  const nextBtn = $("nextUp");
  nextBtn.classList.toggle("hide", !next || !!live);
  if (next) {
    nextBtn.dataset.startR = next.id;
    nextBtn.innerHTML = `<span class="mono muted">Next up</span><strong>${esc(next.name)}</strong><span class="mono">Start →</span>`;
  }

  const recent = S.workouts.filter(isDone).slice(0, 4);
  $("recent").innerHTML = recent.length
    ? recent.map((w) => {
        const t = sessionTotals(w);
        return `<button class="feed-btn" type="button" data-open="${w.id}">
          <span class="feed-ico">✓</span>
          <span class="grow"><strong>${esc(w.title)}</strong><span class="muted">${fmtDay(w.startedAt)} · ${durShort(w.endedAt - w.startedAt)} · ${t.sets} sets · ${fmtVol(t.vol)}</span></span>
        </button>`;
      }).join("")
    : `<div class="card empty"><p class="muted">Finish a session and it shows up here.</p></div>`;
}

export function wire() {
  $("resume").addEventListener("click", () => navigate("train"));
}
