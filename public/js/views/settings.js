// Settings: units, display options, JSON backup, switch or delete profile, erase data.
import { S, emit } from "../store.js";
import { $, download, toast } from "../ui.js";
import { api } from "../api.js";
import { applyData, localIso } from "../domain.js";

export function openSettings() {
  $("setName").value = S.profile.name;
  $("setGoal").value = S.profile.goal || "";
  $("setUnits").value = S.profile.settings.units;
  $("setKeepAwake").checked = S.profile.settings.keepAwake;
  $("setRpe").checked = S.profile.settings.showRpe;
  $("setWarmups").checked = S.profile.settings.includeWarmups;
  $("setRest").value = S.profile.settings.restDefault;
  $("dlgSettings").showModal();
}

const lockApp = (msg) => window.dispatchEvent(new CustomEvent("il:lock", { detail: msg }));

export function wire() {
  $("menuBtn").addEventListener("click", openSettings);
  $("who").addEventListener("click", openSettings);
  $("avatar").addEventListener("click", openSettings);

  $("settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const settings = {
      units: $("setUnits").value,
      keepAwake: $("setKeepAwake").checked,
      showRpe: $("setRpe").checked,
      includeWarmups: $("setWarmups").checked,
      restDefault: Math.round(parseFloat($("setRest").value)) || 90,
    };
    try {
      const profile = await api("/api/data", { method: "PUT", body: { name: $("setName").value.trim() || "Athlete", goal: Math.round(parseFloat($("setGoal").value)) || 3, settings } });
      S.profile = { ...S.profile, ...profile };
      $("dlgSettings").close();
      toast("Settings saved");
      emit();
    } catch (err) {
      toast(err.message);
    }
  });

  $("exportJson").addEventListener("click", () => {
    const data = { exported: new Date().toISOString(), profile: S.profile, routines: S.routines, workouts: S.workouts, weights: S.weights, exercises: S.exercises, measurements: S.measurements };
    download(`iron-log-backup-${localIso()}.json`, "application/json", JSON.stringify(data, null, 2));
    toast("Backup exported");
  });

  $("switchProfile").addEventListener("click", () => {
    $("dlgSettings").close();
    lockApp("");
  });

  $("deleteProfile").addEventListener("click", async () => {
    if (!confirm(`Delete the profile "${S.profile.name}" and all of its data? This cannot be undone.`)) return;
    try {
      await api("/api/profiles", { method: "DELETE" });
      $("dlgSettings").close();
      lockApp("Profile deleted.");
    } catch (err) {
      toast(err.message);
    }
  });

  $("settingsErase").addEventListener("click", async () => {
    if (!confirm("Erase every routine, session, exercise and measurement in this profile? The profile and PIN are kept. This cannot be undone.")) return;
    try {
      await api("/api/data", { method: "DELETE" });
      applyData(await api("/api/data"));
      $("dlgSettings").close();
      toast("All data erased");
      emit();
    } catch (err) {
      toast(err.message);
    }
  });
}
