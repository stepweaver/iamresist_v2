// Minimal service worker — required for iOS to recognize the site as an
// installable PWA. When the site is added to the home screen and launched in
// standalone mode, iOS grants it a proper audio session that survives screen
// lock, enabling lock-screen playback and controls.
//
// Strategy: network-first for navigations. A successful response is shown and
// then stored. The cache is used only when the network request fails, so an
// online visit is not stuck on an older HTML document. Other requests are not
// intercepted.

const CACHE = "resist-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Cache page navigation for this origin only.
  if (url.origin === self.location.origin && e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }

  // All other requests (API, YouTube iframes, CDN assets) pass through.
});
