const CACHE = "iampromote-20260715-mobile-inventory-restore";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./fan.html",
  "./fan.css",
  "./fan.js",
  "./media.html",
  "./media.css",
  "./media.js",
  "./fan-mana.png",
  "./fan-hugel.png",
  "./fan-cochinola.jpg",
  "./qrcode.bundle.js",
  "./livefest-logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.endsWith(".webmanifest")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(async () => (
        await caches.match(event.request)
        || await caches.match("./index.html")
        || Response.error()
      ))
  );
});






























