// Profile gate: choose a profile, enter its PIN, or create one.
import { S } from "../store.js";
import { $, toast } from "../ui.js";
import { api, session, ApiError } from "../api.js";
import { applyData } from "../domain.js";

let onSignedIn = () => {};

export function showGate(panel, msg = "") {
  for (const id of ["gLoading", "gPick", "gPin", "gCreate"]) $(id).classList.toggle("hide", id !== panel);
  $("gateErr").textContent = msg;
  $("gate").style.display = "grid";
}

export async function loadProfiles(msg = "") {
  showGate("gLoading");
  let info;
  try {
    const res = await fetch("/api/profiles", { cache: "no-store" });
    info = await res.json();
    if (!res.ok) throw new Error(info.error || `Server error ${res.status}`);
  } catch (err) {
    showGate("gPick", msg || `Can't load profiles: ${err.message}. Check the connection, then tap Refresh.`);
    return;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  $("profileList").innerHTML = info.profiles.length
    ? info.profiles.map((p) => `<button class="row-pick" type="button" data-profile="${esc(p.id)}" data-name="${esc(p.name)}">
        <span><strong>${esc(p.name)}</strong><small class="muted">Tap to sign in</small></span><span class="mono">→</span></button>`).join("")
    : `<p class="muted">No profiles yet. Create the first one.</p>`;
  $("newProfile").classList.toggle("hide", !info.canCreate);
  $("profileLimit").classList.toggle("hide", info.canCreate);
  $("profileLimit").textContent = `All ${info.maxProfiles} profile slots are in use.`;
  $("gCode").classList.toggle("hide", !info.setupCodeRequired);
  $("gcCode").classList.toggle("hide", !info.setupCodeRequired);
  showGate("gPick", msg);
}

function chooseProfile(id, name) {
  S.pid = id;
  S.pin = "";
  $("pinFor").textContent = name;
  $("gPinInput").value = "";
  showGate("gPin");
  setTimeout(() => $("gPinInput").focus(), 50);
}

async function signIn() {
  applyData(await api("/api/data", { login: true }));
  session.save();
  onSignedIn();
}

export function wireGate(signedIn) {
  onSignedIn = signedIn;

  $("profileList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-profile]");
    if (b) chooseProfile(b.dataset.profile, b.dataset.name);
  });
  $("gRetry").addEventListener("click", () => loadProfiles());
  $("gBack").addEventListener("click", () => loadProfiles());
  $("gCreateBack").addEventListener("click", () => loadProfiles());

  $("newProfile").addEventListener("click", () => {
    for (const id of ["gcName", "gcPin", "gcPin2", "gcCode"]) $(id).value = "";
    showGate("gCreate");
  });

  $("gPin").addEventListener("submit", async (e) => {
    e.preventDefault();
    S.pin = $("gPinInput").value.trim();
    $("gPinBtn").disabled = true;
    try {
      await signIn();
      $("gPinInput").value = "";
    } catch (err) {
      S.pin = "";
      if (err instanceof ApiError && /Unknown profile/.test(err.message)) return loadProfiles("That profile no longer exists.");
      showGate("gPin", err.message);
    } finally {
      $("gPinBtn").disabled = false;
    }
  });

  $("gCreate").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPin = $("gcPin").value.trim();
    if (newPin !== $("gcPin2").value.trim()) return showGate("gCreate", "The two PINs don't match.");
    $("gcBtn").disabled = true;
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: $("gcName").value.trim(), pin: newPin, code: $("gcCode").value.trim() }),
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(created.error || `Server error ${res.status}`);
      S.pid = created.id;
      S.pin = newPin;
      await signIn();
      toast(`Welcome, ${created.name}`);
    } catch (err) {
      showGate("gCreate", err.message);
    } finally {
      $("gcBtn").disabled = false;
    }
  });
}
