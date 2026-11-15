// Offline navigation fallback only. Never cache API responses, user scenarios, or scientific data.
const CACHE = 'moonproof-offline-v1';
const FALLBACK = './offline.html';
const ASSETS = [FALLBACK,'./ds/tokens.css','./ds/components.css','./shell/offline.css','./moon-hd/pole-preview.webp'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('moonproof-offline-') && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  const relative = './' + url.pathname.slice(scope.pathname.length);
  if (request.mode === 'navigate' && (relative === './' || relative === './index.html')) {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match(FALLBACK))));
  } else if (ASSETS.includes(relative)) {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match(relative))));
  }
});
