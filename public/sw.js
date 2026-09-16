const CACHE = "festholic-20260913-streamlit-wake-help-v77";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./login.html",
  "./login.css",
  "./login.js",
  "./auth-guard.js",
  "./cookie-consent.js",
  "./workspace-sync.js",
  "./experiencia.js",
  "./legal.html",
  "./legal.js",
  "./security.html",
  "./security.js",
  "./security.css",
  "./generador-pdf.html",
  "./account-profile.js",
  "./account-profile.css",
  "./admin.html",
  "./admin.js",
  "./system-pages.css",
  "./qrcode.bundle.js",
  "./jsQR.js",
  "./qr-digitize.js",
  "./experiencia.html",
  "./fan.html",
  "./fan.css",
  "./fan.js",
  "./media.html",
  "./media.css",
  "./media-workspace.css",
  "./media.js",
  "./img/logo/festholic.png",
  "./img/logo/iconoweb.jpg",
  "./livefest-logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];

const PAGE_FALLBACKS = {
  "/": "./index.html",
  "/index.html": "./index.html",
  "/login": "./login.html",
  "/login.html": "./login.html",
  "/experiencia": "./experiencia.html",
  "/experiencia.html": "./experiencia.html",
  "/fan": "./fan.html",
  "/fan.html": "./fan.html",
  "/media": "./media.html",
  "/media.html": "./media.html",
  "/legal.html": "./legal.html",
  "/security.html": "./security.html",
  "/generador-pdf.html": "./generador-pdf.html",
  "/admin.html": "./admin.html"
};

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
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.endsWith("webmanifest")) {
    return;
  }

  const isNavigation = event.request.mode === "navigate";
  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;

        if (isNavigation) {
          const path = url.pathname.replace(/\/+$/, "") || "/";
          return (await caches.match(PAGE_FALLBACKS[path] || "./index.html")) || Response.error();
        }

        return Response.error();
      })
  );
});
