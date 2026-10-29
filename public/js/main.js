// Entry point: wires the views, runs the router, and restores or starts a session.
import { S, subscribe, emit } from "./store.js";
import { $, wireCloseButtons, setSync } from "./ui.js";
import { api, session, setSessionEnd } from "./api.js";
import { applyData, greeting, dur } from "./domain.js";
import * as gate from "./views/gate.js";
import * as today from "./views/today.js";
import * as train from "./views/train.js";
import * as plan from "./views/plan.js";
import * as log from "./views/log.js";
import * as browse from "./views/browse.js";
import * as body from "./views/body.js";
import * as settings from "./views/settings.js";

const VIEWS = { today, train, plan, log, library: browse, body };

function renderHeader() {
  $("name").textContent = S.profile.name;
  $("avatar").textContent = S.profile.name.split(/\s+/).map((p) => p[0] || "").join("").slice(0, 2).toUpperCase() || "?";
  $("hello").textContent = greeting() + ",";
}

function render() {
  if ($("app").classList.contains("hide")) return;
  renderHeader();
  VIEWS[S.view]?.render();
}

export function go(view) {
  if (!VIEWS[view]) view = "today";
  S.view = view;
  for (const v of Object.keys(VIEWS)) $("view-" + v).classList.toggle("hide", v !== view);
  document.querySelectorAll(".dock button[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  render();
  window.scrollTo({ top: 0 });
}

function lock(msg = "") {
  session.clear();
  document.body.classList.add("locked");
  $("app").classList.add("hide");
  $("dock").classList.add("hide");
  gate.loadProfiles(msg);
}

function unlock() {
  window.__ilBooted = true;
  document.body.classList.remove("locked");
  $("gate").style.display = "none";
  $("app").classList.remove("hide");
  $("dock").classList.remove("hide");
  go(S.view);
  log.refreshStats();
}

function wireGlobal() {
  // One delegated handler for the buttons that look the same on every screen.
  document.addEventListener("click", (e) => {
    const at = (sel) => e.target.closest(sel);
    let t;
    if ((t = at("[data-view]"))) return go(t.dataset.view);
    if ((t = at("[data-open]"))) return train.openWorkout(t.dataset.open);
    if ((t = at("[data-start-r]"))) return train.startWorkout(t.dataset.startR);
  });
  window.addEventListener("il:navigate", (e) => go(e.detail));
  window.addEventListener("il:lock", (e) => lock(e.detail || ""));
  subscribe(() => render());

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S.sess && S.sess.mode === "live") train.keepAwake(true);
    if (document.visibilityState === "hidden") train.flushIfDirty();
  });
  window.addEventListener("pagehide", () => train.flushIfDirty());

  $("themeBtn").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("il-mode", dark ? "dark" : "light");
  });

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("installBtn").classList.remove("hide");
  });
  $("installBtn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("installBtn").classList.add("hide");
  });
}

async function boot() {
  if (localStorage.getItem("il-mode") === "dark") document.documentElement.dataset.theme = "dark";
  setSessionEnd((msg) => lock(msg));
  wireCloseButtons();
  gate.wireGate(unlock);
  for (const v of Object.values(VIEWS)) v.wire();
  settings.wire();
  wireGlobal();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

  const saved = session.load();
  if (saved && saved.pid && saved.pin) {
    S.pid = saved.pid;
    S.pin = saved.pin;
    try {
      applyData(await api("/api/data", { login: true }));
      if (S.sess) train.keepAwake(true);
      unlock();
      return;
    } catch {
      session.clear();
    }
  }
  lock("");
}

// Keep the live clock and the rest timer running; they only touch their own elements.
setInterval(() => {
  if (S.sess && S.sess.mode === "live" && $("liveClock")) $("liveClock").textContent = dur(Date.now() - S.sess.w.startedAt);
}, 1000);

boot();
