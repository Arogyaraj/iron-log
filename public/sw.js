const VERSION = "ironlog-v4";
const SHELL = ["/", "/index.html", "/styles.css", "/icon.svg", "/manifest.webmanifest",
  "/js/main.js", "/js/api.js", "/js/store.js", "/js/ui.js", "/js/domain.js", "/js/exercises.js",
  "/js/views/gate.js", "/js/views/today.js", "/js/views/train.js", "/js/views/plan.js", "/js/views/log.js",
  "/js/views/browse.js", "/js/views/body.js", "/js/views/settings.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // training data is never cached

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req.mode === "navigate" ? "/index.html" : req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html")))
  );
});
