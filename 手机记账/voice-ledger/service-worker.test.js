// 直接执行生产 Service Worker：核验完整离线安装、旧模型复用和请求缓存规则。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source=fs.readFileSync(require.resolve("./sw.js"),"utf8");
const base="https://example.test/voice-ledger/";
const request=(path,extra={}) => ({ url:new URL(path,base).href, method:"GET", mode:"same-origin", ...extra });

function setup({ failAssets=[], offline=false, holdDeletes=false, holdFetch=null }={}) {
  const handlers=new Map(), stores=new Map(), logs=[], deletions=[];
  const pendingFetches=[];
  let networkOffline=offline;
  const resolveURL=(value) => new URL(typeof value === "string" ? value : value.url,base).href;
  const failing=new Set(failAssets.map(resolveURL));
  const network=async (value) => {
    const url=resolveURL(value);
    logs.push({ action:"fetch", url });
    if (networkOffline || failing.has(url)) throw new Error("network unavailable");
    if (holdFetch && url === resolveURL(holdFetch)) await new Promise((resolve) => pendingFetches.push(resolve));
    return new Response(`NEW:${new URL(url).pathname}${new URL(url).search}`,{ status:200 });
  };
  const getStore=(name) => {
    if (!stores.has(name)) stores.set(name,new Map());
    return stores.get(name);
  };
  const cacheFor=(name) => ({
    async add(asset) {
      logs.push({ action:"add", name, url:resolveURL(asset) });
      const response=await network(asset);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      getStore(name).set(resolveURL(asset),response.clone());
    },
    async put(asset,response) {
      logs.push({ action:"put", name, url:resolveURL(asset) });
      getStore(name).set(resolveURL(asset),response.clone());
    },
    async match(asset,options={}) {
      const url=resolveURL(asset);
      for (const [key,response] of getStore(name)) {
        if (key === url || (options.ignoreSearch && key.split("?")[0] === url.split("?")[0])) return response.clone();
      }
      return undefined;
    },
  });
  const storage={
    async open(name) { getStore(name); return cacheFor(name); },
    async keys() { return [...stores.keys()]; },
    async match(asset,options={}) {
      for (const name of stores.keys()) {
        const response=await cacheFor(name).match(asset,options);
        if (response) return response;
      }
      return undefined;
    },
    async delete(name) {
      logs.push({ action:"delete-start", name });
      if (holdDeletes) await new Promise((resolve) => deletions.push(resolve));
      const result=stores.delete(name);
      logs.push({ action:"delete-done", name });
      return result;
    },
  };
  const context=vm.createContext({
    URL, Response, caches:storage, fetch:network, setTimeout, clearTimeout,
    self:{
      addEventListener(name,callback) { handlers.set(name,callback); },
      async skipWaiting() { logs.push({ action:"skipWaiting" }); },
      clients:{ async claim() { logs.push({ action:"claim" }); } },
    },
  });
  vm.runInContext(source,context);
  const { CACHE_NAME, APP_SHELL }=vm.runInContext("({ CACHE_NAME, APP_SHELL })",context);
  return {
    logs, stores, name:CACHE_NAME, shell:Array.from(APP_SHELL),
    seed(name,path,body="OLD",status=200) { getStore(name).set(resolveURL(path),new Response(body,{ status })); },
    async cached(name,path) { return cacheFor(name).match(path); },
    offline(value=true) { networkOffline=value; },
    finishDeletes() { deletions.splice(0).forEach((resolve) => resolve()); },
    finishFetches() { pendingFetches.splice(0).forEach((resolve) => resolve()); },
    lifecycle(name) {
      let work;
      handlers.get(name)({ waitUntil(promise) { work=promise; } });
      assert.ok(work, `${name} 应把异步任务加入 waitUntil`);
      return work;
    },
    fetch(path,extra={}) {
      let handled=false, result;
      handlers.get("fetch")({ request:request(path,extra), respondWith(promise) { handled=true; result=promise; } });
      return { handled, result };
    },
  };
}

async function waitFor(condition) {
  for (let attempt=0;attempt<100;attempt++) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail("Service Worker mock 没有到达等待点");
}

async function main() {
  const oldName="mobile-voice-ledger-formal-previous";
  {
    const probe=setup();
    const appAsset=probe.shell.find((asset) => /\/app\.js\?/.test(asset));
    assert.ok(appAsset,"新版本应用脚本属于必需离线资源");
    const sw=setup({ failAssets:[appAsset] });
    sw.seed(oldName,"./index.html","KNOWN GOOD PAGE");
    sw.seed(oldName,"./app.js","KNOWN GOOD APP");
    await assert.rejects(sw.lifecycle("install"),/network unavailable/);
    assert.equal(sw.logs.some((item) => item.action === "skipWaiting"),false,"关键资源失败不得激活不完整新版本");
    assert.equal(sw.logs.some((item) => item.action.startsWith("delete")),false,"安装失败不能清理旧离线版本");
    assert.equal(await (await sw.cached(oldName,"./index.html")).text(),"KNOWN GOOD PAGE");
    assert.equal(await (await sw.cached(oldName,"./app.js")).text(),"KNOWN GOOD APP");
  }

  {
    const probe=setup();
    const heldAsset=probe.shell.find((asset) => /\/app\.js\?/.test(asset));
    const sw=setup({ holdFetch:heldAsset });
    const work=sw.lifecycle("install");
    await waitFor(() => sw.stores.get(sw.name)?.size === new Set(sw.shell.map((asset) => new URL(asset,base).href)).size-1);
    assert.equal(sw.logs.some((item) => item.action === "skipWaiting"),false,"即使其余资源已缓存，也必须等待最后关键脚本完成");
    assert.equal(await sw.cached(sw.name,heldAsset),undefined);
    sw.finishFetches(); await work;
    assert.ok(await sw.cached(sw.name,heldAsset));
    assert.equal(sw.logs.filter((item) => item.action === "skipWaiting").length,1);
  }

  {
    const probe=setup();
    const ocrAssets=probe.shell.filter((asset) => asset.includes("/ocr/"));
    assert.ok(ocrAssets.length > 0,"OCR 模型和运行库必须纳入离线资源");
    const sw=setup({ failAssets:ocrAssets });
    ocrAssets.forEach((asset) => sw.seed(oldName,asset,`OLD MODEL:${asset}`));
    sw.seed(oldName,"./app.js","OLD APP");
    sw.seed(oldName,"./styles.css","OLD CSS");
    await sw.lifecycle("install");
    assert.equal(sw.logs.filter((item) => item.action === "skipWaiting").length,1);
    assert.equal(sw.logs.filter((item) => item.action === "fetch" && item.url.includes("/ocr/")).length,0,"已有完整 OCR 资源复用，不重复下载大模型");
    for (const asset of ocrAssets) {
      assert.equal(await (await sw.cached(sw.name,asset)).text(),`OLD MODEL:${asset}`);
    }
    assert.match(await (await sw.cached(sw.name,"./app.js")).text(),/^NEW:/,"应用代码必须获取新版");
    assert.match(await (await sw.cached(sw.name,"./styles.css")).text(),/^NEW:/,"样式必须获取新版");
    const skip=sw.logs.findIndex((item) => item.action === "skipWaiting");
    const lastWrite=sw.logs.map((item,index) => [item,index]).filter(([item]) => item.action === "put" || item.action === "add").at(-1)[1];
    assert.ok(skip > lastWrite,"全部资源操作完成才 skipWaiting");
    assert.equal(sw.stores.get(sw.name).size,new Set(sw.shell.map((asset) => new URL(asset,base).href)).size,"新缓存包含所有必需资源");
  }

  {
    const probe=setup();
    const model=probe.shell.find((asset) => /traineddata$/.test(asset));
    const sw=setup({ failAssets:[model] });
    sw.seed(oldName,model,"ERROR PAGE",404);
    await assert.rejects(sw.lifecycle("install"),/network unavailable/);
    assert.ok(sw.logs.some((item) => item.action === "fetch" && item.url.endsWith("traineddata")),"旧缓存错误响应不得冒充完整模型");
    assert.equal(sw.logs.some((item) => item.action === "skipWaiting"),false);
  }

  {
    const sw=setup({ holdDeletes:true });
    await sw.lifecycle("install");
    sw.seed(oldName,"./index.html","OLD PAGE");
    sw.seed("mobile-voice-ledger-formal-older","./index.html","OLDER PAGE");
    sw.seed("unrelated-user-cache","./something","UNRELATED");
    const work=sw.lifecycle("activate");
    await waitFor(() => sw.logs.filter((item) => item.action === "delete-start").length === 2);
    assert.equal(sw.logs.some((item) => item.action === "claim"),false,"旧缓存清理完成前不能接管页面");
    assert.equal(sw.stores.has(sw.name),true,"当前版本缓存保留");
    sw.finishDeletes(); await work;
    assert.equal(sw.stores.has(oldName),false);
    assert.equal(sw.stores.has("mobile-voice-ledger-formal-older"),false);
    assert.equal(sw.stores.has("unrelated-user-cache"),true,"其他应用缓存不删除");
    assert.equal(sw.stores.has(sw.name),true);
    const claim=sw.logs.findIndex((item) => item.action === "claim");
    assert.ok(sw.logs.every((item,index) => item.action !== "delete-done" || index < claim),"先全部清理完成，再 clients.claim");
  }

  {
    const sw=setup({ offline:true });
    sw.seed(sw.name,"./index.html","OFFLINE FORMAL PAGE");
    const navigation=sw.fetch("./index.html?v=refresh-on-phone",{ mode:"navigate" });
    assert.equal(navigation.handled,true);
    const response=await navigation.result;
    assert.equal(response.status,200);
    assert.equal(await response.text(),"OFFLINE FORMAL PAGE","手机带更新参数导航仍可回退正式离线页面");
    const empty=setup({ offline:true });
    const missing=await empty.fetch("./index.html",{ mode:"navigate" }).result;
    assert.equal(missing.status,503,"尚未安装离线资源应明确返回不可用提示");
    assert.match(await missing.text(),/联网打开/);
  }

  {
    const sw=setup();
    const navigation=await sw.fetch("./index.html?v=phone",{ mode:"navigate" }).result;
    assert.equal(navigation.status,200);
    const cached=await sw.cached(sw.name,"./index.html");
    assert.ok(cached,"联网导航同时保存正式离线回退入口");
    assert.match(await cached.text(),/NEW:.*index\.html/);
    sw.offline();
    const offlineNavigation=await sw.fetch("./",{ mode:"navigate" }).result;
    assert.equal(offlineNavigation.status,200);
    assert.match(await offlineNavigation.text(),/NEW:.*index\.html/);
  }

  {
    const sw=setup({ offline:true });
    sw.seed(sw.name,"./ocr/chi_sim.traineddata","OFFLINE OCR MODEL");
    const result=await sw.fetch("./ocr/chi_sim.traineddata").result;
    assert.equal(await result.text(),"OFFLINE OCR MODEL");
    assert.equal(sw.logs.filter((item) => item.action === "fetch").length,0,"OCR 缓存优先，离线识别不等待网络超时");
    sw.seed(sw.name,"./app.js","CACHED APP");
    const app=await sw.fetch("./app.js?v=other").result;
    assert.equal(await app.text(),"CACHED APP","普通资源离线时允许忽略更新参数回退");
    const absent=await sw.fetch("./missing.js").result;
    assert.equal(absent.type,"error","无缓存资源不伪造成功响应");
  }

  {
    const sw=setup();
    for (const [path,extra] of [["/api/records",{}],["/api/status?t=123",{}],["./index.html",{ method:"POST" }]]) {
      const call=sw.fetch(path,extra);
      assert.equal(call.handled,false,"账本 API 和非 GET 请求不得被 Service Worker 缓存或回退");
      assert.equal(call.result,undefined);
    }
    assert.equal(sw.logs.length,0);
    assert.equal(sw.stores.size,0,"账本 API 不打开任何缓存");
  }

  console.log("离线更新回归通过：安装失败保留旧版、完整资源才替换、旧 OCR 模型复用、新应用代码重取、先清缓存后接管、离线导航和识别资源回退、API 不缓存。");
}

main().catch((error) => { console.error(error); process.exitCode=1; });
