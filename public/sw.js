// Service Worker «Білого суперкубка»: кешує ресурси для швидкого запуску та гри без інтернету.
const CACHE = 'bsk-v3';
const CORE = ['./', './index.html', './manifest.webmanifest', './assets/ui/branding/imi-round-original.svg', './assets/icons/supercup.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const isPage = req.mode === 'navigate';
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: isPage });
      const network = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      // сторінка: спершу мережа (щоб отримувати оновлення), інакше кеш; ресурси: спершу кеш
      if (isPage) return (await network) || cached || cache.match('./index.html');
      return cached || (await network) || new Response('', { status: 504 });
    })
  );
});
