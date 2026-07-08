// Snack service worker: precache the shell, serve static assets
// stale-while-revalidate, and fall back to a friendly offline page for
// navigations. Pages themselves are always network-first — this is a
// session-driven, server-rendered app, so HTML must stay fresh.
const CACHE_VERSION = "snack-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const PRECACHE_URLS = [
  "/offline.html",
  "/css/main.css",
  "/css/variables.css",
  "/css/base.css",
  "/css/layout.css",
  "/css/components.css",
  "/css/polish.css",
  "/css/pages/admin.css",
  "/js/ui.js",
  "/js/navbar.js",
  "/js/address-memory.js",
  "/js/cart-drawer.js",
  "/js/favorites.js",
  "/images/snack-logo.svg",
  "/images/placeholder.png",
  "/icons/icon-192.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const STATIC_DESTINATIONS = new Set(["style", "script", "image", "font"]);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only same-origin GETs; never touch the live socket.
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/socket.io/")) return;

  // Navigations: network first, offline page as the fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // Static assets: serve from cache immediately, refresh in the background.
  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);

        return cached || network;
      })
    );
  }
});
