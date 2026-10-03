// Service Worker for 洒一投资工具箱 PWA
// v2: HTML 使用 Network First，静态资源使用 Cache First，避免手机端一直卡旧版本。
const CACHE_NAME = 'sayi-invest-v19-intraday-voice-input';
const urlsToCache = [
  './',
  './index.html',
  './股票持仓.html',
  './洒一开户奖励.html',
  './洒一港股打新.html',
  './日内期权交易记录.html',
  './manifest.json',
  './auto-backup.js',
  '../sayi-anime-theme.css?v=20260621-cream2',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.log('Cache failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cacheName => cacheName !== CACHE_NAME ? caches.delete(cacheName) : null)
    ))
  );
  self.clients.claim();
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || new Response('离线且没有可用缓存', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : '洒一投资工具箱提醒',
    icon: '../品牌资产/sayi-finance-app-icon.png',
    badge: '../品牌资产/sayi-finance-app-icon.png',
    vibrate: [100, 50, 100],
    data: { url: './index.html' }
  };
  event.waitUntil(self.registration.showNotification('洒一投资工具箱', options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
