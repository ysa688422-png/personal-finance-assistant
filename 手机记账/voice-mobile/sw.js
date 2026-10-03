const CACHE_NAME = "mobile-voice-ledger-test-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./index.html?v=mobile-2",
  "./styles.css",
  "./styles.css?v=mobile-2",
  "./app.js",
  "./app.js?v=mobile-2",
  "./manifest.json",
  "./manifest.json?v=mobile-2",
  "../icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(APP_SHELL.map((asset) => cache.add(asset).catch(() => null)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("mobile-voice-ledger-test-") && key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }
  event.respondWith(networkFirstAsset(event.request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetchWithTimeout(request, 1800);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    await cache.put("./index.html", response.clone());
    return response;
  } catch (_) {
    return (
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match("./index.html?v=mobile-2")) ||
      (await caches.match("./index.html")) ||
      (await caches.match("./")) ||
      new Response("语音记账离线页面尚未准备好，请回到家庭 Wi-Fi 后打开一次新版页面。", { status: 503, headers: { "Content-Type": "text/plain;charset=utf-8" } })
    );
  }
}

async function networkFirstAsset(request) {
  try {
    const response = await fetchWithTimeout(request, 1800);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await caches.match(request, { ignoreSearch: true })) || Response.error();
  }
}

function fetchWithTimeout(request, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeout);
    fetch(request).then((response) => {
      clearTimeout(timer);
      resolve(response);
    }).catch((error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
