// Storybook Service Worker — enables PWA installation and basic offline support

const CACHE_NAME = "storybook-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Only cache GET requests for same-origin navigation and static assets
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Don't cache API requests
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for static assets
        if (response.ok && (
          url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|woff2?)$/) ||
          url.pathname === "/"
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Serve from cache if network fails
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, try to serve the cached index
          if (event.request.mode === "navigate") {
            return caches.match("/");
          }
          return new Response("Offline", { status: 503 });
        });
      })
  );
});
