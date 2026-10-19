// Service worker: κρατάει τα αρχεία της εφαρμογής για γρήγορο άνοιγμα και offline.
// Άλλαξε το VERSION όταν ανεβάζεις νέα έκδοση.
const VERSION = "ekdromes-v5";
const SHELL = ["./", "index.html", "app.js", "firebase-config.js", "seed.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first για τα δικά μας αρχεία (ώστε οι αλλαγές να φαίνονται αμέσως), cache όταν είσαι offline.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
