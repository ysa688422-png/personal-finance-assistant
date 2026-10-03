const CACHE_NAME = "mobile-voice-ledger-formal-recognition-fix-20261002";
const APP_SHELL = [
  "./index.html",
  "./index.html?v=recognition-fix-20261002",
  "./styles.css",
  "./styles.css?v=recognition-fix-20261002",
  "./app.js",
  "./app.js?v=recognition-fix-20261002",
  "./ledger-search.js",
  "./ledger-search.js?v=recognition-fix-20261002",
  "./image-ledger-parser.js?v=recognition-fix-20261002",
  "./image-ledger.js?v=recognition-fix-20261002",
  "./ocr/tesseract.min.js",
  "./ocr/worker.min.js",
  "./ocr/chi_sim.traineddata",
  "./ocr/tesseract-core-lstm.wasm.js",
  "./ocr/tesseract-core-lstm.wasm",
  "./ocr/tesseract-core-simd-lstm.wasm.js",
  "./ocr/tesseract-core-simd-lstm.wasm",
  "./ocr/tesseract-core-relaxedsimd-lstm.wasm.js",
  "./ocr/tesseract-core-relaxedsimd-lstm.wasm",
  "./manifest.json",
  "./manifest.json?v=recognition-fix-20261002",
  "./version.json",
  "../icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(APP_SHELL.map(async (asset) => {
        // The OCR model is unchanged between releases. Reuse a complete local
        // copy, but fetch the new app code before replacing the old worker.
        const existing = asset.includes("/ocr/") ? await caches.match(asset) : null;
        if (existing?.ok) await cache.put(asset, existing.clone());
        else await cache.add(asset);
      }));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("mobile-voice-ledger-formal-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
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
    const response = await fetchWithTimeout(request, 4000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    await cache.put("./index.html", response.clone());
    return response;
  } catch (_) {
    return (
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match("./index.html?v=recognition-fix-20261002")) ||
      (await caches.match("./index.html")) ||
      (await caches.match("./")) ||
      new Response("手机记账离线页面尚未准备好，请联网打开一次正式页面。", { status: 503, headers: { "Content-Type": "text/plain;charset=utf-8" } })
    );
  }
}

async function networkFirstAsset(request) {
  const isOcrAsset = new URL(request.url).pathname.includes("/ocr/");
  if (isOcrAsset) {
    const cachedOcr = await caches.match(request);
    if (cachedOcr) return cachedOcr;
  }
  try {
    const response = await fetchWithTimeout(request, new URL(request.url).pathname.includes("/ocr/") ? 30000 : 4000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true })) || Response.error();
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
