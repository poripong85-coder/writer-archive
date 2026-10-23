// 앱 셸 오프라인 캐시. 기록 자체는 IndexedDB에 있으므로 여기서는 정적 파일만 다룬다.
const CACHE = 'gyul-shell-v3';
const SHELL = [
  './',
  'index.html',
  'styles/app.css',
  'styles/site.css',
  'fonts/Galmuri11.woff2',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'app/main.js',
  'app/config.js',
  'app/supa.js',
  'app/auth.js',
  'vendor/supabase-2.117.3.js',
  'app/store.js',
  'app/env.js',
  'app/books.js',
  'app/pages.js',
  'app/clock.js',
  'app/db.js',
  'app/util.js',
  'app/ui.js',
  'app/media.js',
  'app/backup.js',
  'app/pixel.js',
  'app/village.js',
  'app/views/today.js',
  'app/views/calendar.js',
  'app/views/fragments.js',
  'app/pages/home.js',
  'app/pages/page.js',
  'app/pages/fragments-page.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 파비콘 등 외부 요청은 통과

  // 네트워크 우선, 실패하면 캐시 (배포 직후 최신 파일을 받도록)
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
