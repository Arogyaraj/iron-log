// DOM helpers shared by all views.
export const $ = (id) => document.getElementById(id);

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let toastTimer;
export function toast(msg, action) {
  $("toastMsg").textContent = msg;
  const b = $("toastBtn");
  b.classList.toggle("hide", !action);
  b.textContent = action ? action.label : "";
  b.onclick = action ? () => { action.run(); $("toast").classList.remove("show"); } : null;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3400);
}

export function setSync(state) {
  const el = $("sync");
  el.textContent = { saving: "Saving…", saved: "Saved", error: "Not saved" }[state] || "";
  el.className = "sync " + (state === "saved" ? "saved" : state === "error" ? "error" : "");
}

export function download(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Views ask the router to change screen through this event, so no view imports another view. */
export const navigate = (view) => window.dispatchEvent(new CustomEvent("il:navigate", { detail: view }));

export function wireCloseButtons() {
  document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => $(b.dataset.close).close()));
}
