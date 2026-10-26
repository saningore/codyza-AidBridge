const CACHE = "aidbridge-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/field.html", "/offline-db.js"])));
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => (await caches.match("/field.html")) || new Response("Offline", { status: 503 })),
  );
});
