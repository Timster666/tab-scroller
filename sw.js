// Tab Scroller offline helper.
// Online: always fetch the newest version straight from the server (past GitHub's 10-minute cache) and keep a copy.
// Offline or slow network: use the saved copy.
const CACHE = 'tab-scroller-v2';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('slow network')), ms))]);

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.searchParams.has('fresh')) return;          // the app's own update check: straight to the network
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      if (req.mode === 'navigate') {
        // a unique address makes GitHub's cache hand out the newest file
        const net = await withTimeout(fetch('./index.html?fresh=' + Date.now(), { cache: 'no-store' }), 3000);
        if (!net.ok) throw new Error('HTTP ' + net.status);
        await cache.put('./index.html', net.clone());
        await cache.put('./', net.clone());
        return net;
      }
      const net = await withTimeout(fetch(req, { cache: 'no-cache' }), 3000);
      if (net && net.ok) cache.put(req, net.clone());
      return net;
    } catch (err) {
      const hit = (await cache.match(req, { ignoreSearch: true })) ||
                  (req.mode === 'navigate' ? await cache.match('./index.html') : null);
      return hit || Response.error();
    }
  })());
});
