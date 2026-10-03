const CACHE_NAME = "mobile-ledger-v29-delete-sync";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./index.html?v=20260905-delete-sync",
  "./styles.css?v=20260905-delete-sync",
  "./app.js?v=20260905-delete-sync",
  "./manifest.json?v=20260905-delete-sync",
  "../sayi-anime-theme.css?v=20260905-delete-sync",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(ASSETS.map((asset) => cache.add(asset).catch(() => null)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;
  const isNavigation = event.request.mode === "navigate";
  const isWorkspacePage =
    requestUrl.pathname === "/home.html" ||
    requestUrl.pathname.includes("/财务管理/") ||
    requestUrl.pathname.includes("/%E8%B4%A2%E5%8A%A1%E7%AE%A1%E7%90%86/") ||
    requestUrl.pathname.includes("/支出与收入流水/") ||
    requestUrl.pathname.includes("/%E6%94%AF%E5%87%BA%E4%B8%8E%E6%94%B6%E5%85%A5%E6%B5%81%E6%B0%B4/") ||
    requestUrl.pathname.includes("/洒一投资工具箱/") ||
    requestUrl.pathname.includes("/%E6%B4%92%E4%B8%80%E6%8A%95%E8%B5%84%E5%B7%A5%E5%85%B7%E7%AE%B1/");
  if (isWorkspacePage) {
    event.respondWith(fetch(event.request));
    return;
  }
  const freshFirst = requestUrl.pathname.endsWith(".html") || requestUrl.pathname.endsWith(".js") || requestUrl.pathname.endsWith(".css") || requestUrl.pathname.endsWith(".json");
  if (isNavigation) {
    event.respondWith(networkFirstPage(event.request));
    return;
  }
  if (freshFirst) {
    event.respondWith(networkFirstAsset(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cachedIndex())));
});

async function networkFirstPage(request) {
  try {
    const fresh = await fetchWithTimeout(request, 2500);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, fresh.clone());
    await cache.put("./index.html", fresh.clone());
    return fresh;
  } catch {
    return cachedIndex();
  }
}

async function networkFirstAsset(request) {
  try {
    const fresh = await fetchWithTimeout(request, 2500);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return (await caches.match(request, { ignoreSearch: true })) || cachedIndex();
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

async function cachedIndex() {
  return (
    (await caches.match("./index.html?v=20260905-delete-sync")) ||
    (await caches.match("./index.html")) ||
    (await caches.match("./")) ||
    new Response("手机记账离线缓存还没有准备好。请回到同一 Wi-Fi 后打开一次手机记账。", {
      status: 503,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
    })
  );
}
