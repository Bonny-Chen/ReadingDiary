/* 閱讀日記 service worker：App shell 與靜態資源 cache-first，離線也能開啟。 */
const CACHE = 'reading-diary-v1';
const BASE = new URL(self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([BASE, `${BASE}manifest.webmanifest`, `${BASE}sql-wasm-browser.wasm`])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // 書目 API、Google 登入與 Drive 一律走網路；tesseract 語言模型（cdn）走快取
  const sameOrigin = url.origin === self.location.origin;
  const cacheableCdn = /(^|\.)jsdelivr\.net$|(^|\.)projectnaptha\.com$/.test(url.hostname);
  if (!sameOrigin && !cacheableCdn) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached || (request.mode === 'navigate' ? caches.match(BASE) : undefined));
      // 已有快取就先回快取，背景更新（下次開啟取得新版）
      return cached || network;
    }),
  );
});
