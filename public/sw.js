/* WellNest service worker — makes the site installable and gives a friendly offline screen.
 *
 * Deliberately conservative, so the app never shows stale or private data:
 *  - Pages (HTML) always come from the network; if the phone is offline, /offline.html is shown instead.
 *  - Only fingerprinted build files (/assets/*), icons and fonts are cached.
 *  - Anything else — Lovable Cloud, sign-in, payments, maps, server functions, POSTs — is never touched.
 *  - Google sign-in (/~oauth/…) and its return trip are left entirely to the browser.
 * Bump VERSION to force every installed copy to refresh its cache.
 */
const VERSION = "wellnest-v2";
const STATIC_CACHE = `${VERSION}-static`;
const ASSET_CACHE = `${VERSION}-assets`;
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/favicon.svg", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const sameOrigin = (url) => url.origin === self.location.origin;
const isBuildAsset = (url) => sameOrigin(url) && url.pathname.startsWith("/assets/");
const isIcon = (url) => sameOrigin(url) && (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/favicon"));
const isFont = (url) => url.hostname === "fonts.gstatic.com";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/~") || url.hash.includes("access_token") || url.searchParams.has("code") || url.searchParams.has("error")) return;

  // Pages: always fresh from the network; offline page when there is no connection.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  // Fingerprinted build files, icons and font files never change under the same URL: cache first.
  if (isBuildAsset(url) || isIcon(url) || isFont(url)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(isIcon(url) ? STATIC_CACHE : ASSET_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
  }
  // Everything else goes straight to the network (no respondWith).
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
