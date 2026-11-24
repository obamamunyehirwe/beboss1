"use strict";

const CACHE_NAME = "beboss-desktop-shell-v1";
const APP_PATH = "/desktop";
const STATIC_DESTINATIONS = new Set(["script", "style", "image", "font", "worker", "manifest"]);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Store a clean application shell document. It contains no owner or business data.
    try {
      const response = await fetch(APP_PATH, { credentials: "same-origin", cache: "reload" });
      if (response.ok && response.type === "basic") {
        await cache.put(APP_PATH, response.clone());
      }
    } catch {
      // The service worker can still activate; the application will retry on next online start.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("beboss-desktop-shell-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function isSensitivePath(pathname) {
  return pathname.startsWith("/rest/v1/") ||
    pathname.startsWith("/auth/v1/") ||
    pathname.startsWith("/functions/v1/") ||
    pathname.includes("_serverFn") ||
    pathname.startsWith("/api/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isSensitivePath(url.pathname)) return;

  if (request.mode === "navigate") {
    // Only the owner workspace shell is cached. Admin and public pages never fall back
    // to a different cached document, and no server-rendered shop data is cached here.
    if (url.pathname !== APP_PATH && url.pathname !== APP_PATH + "/") return;
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") await cache.put(APP_PATH, response.clone());
        return response;
      } catch {
        const offlineShell = await cache.match(APP_PATH);
        if (offlineShell) return offlineShell;
        return new Response(
          "<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>BeBoss offline</title></head><body><main><h1>BeBoss needs its first online launch</h1><p>Connect this computer to the internet once to install the desktop workspace and cache its application files. Your business records remain in the encrypted desktop vault.</p></main></body></html>",
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
    })());
    return;
  }

  if (!STATIC_DESTINATIONS.has(request.destination)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const network = fetch(request).then(async (response) => {
      if (response.ok && response.type === "basic") {
        try { await cache.put(request, response.clone()); } catch { /* caching must never break a live online response */ }
      }
      return response;
    });
    if (cached) {
      event.waitUntil(network.catch(() => undefined));
      return cached;
    }
    try { return await network; }
    catch {
      return cached || Response.error();
    }
  })());
});
