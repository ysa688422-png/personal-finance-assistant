// 洒一投资工具箱 - 自动文件备份
// 说明：浏览器出于安全限制，首次使用需要点击主页按钮授权备份文件夹。
(function () {
  'use strict';

  const DB_NAME = 'sayi_auto_file_backup_db';
  const STORE_NAME = 'settings';
  const HANDLE_KEY = 'backupDirectoryHandle';
  const OPTION_IMAGE_DB_NAME = 'sayi_intraday_option_images_db';
  const OPTION_IMAGE_STORE_NAME = 'images';
  const STORAGE_KEYS = {
    stockPortfolio: 'stockPortfolio_v3_anime',
    accountRewards: 'accountRewards_v4',
    hkIpoRecords: 'hkIpoRecords_v2',
    intradayOptions: 'intradayOptionsRecords_v1',
    intradayOptionImages: 'intradayOptionsTradeImages_v1',
    exchangeRates: 'sayi_exchange_rates_v2'
  };
  let backupTimer = null;

  function isSupported() {
    return 'showDirectoryPicker' in window && 'indexedDB' in window;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  }

  function openOptionImageDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(OPTION_IMAGE_DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(OPTION_IMAGE_STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function optionImageDbGet(key) {
    if (!key || !('indexedDB' in window)) return '';
    const db = await openOptionImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OPTION_IMAGE_STORE_NAME, 'readonly');
      const req = tx.objectStore(OPTION_IMAGE_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || '');
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  function safeParse(raw, fallback = null) {
    if (!raw || raw === 'null' || raw === 'undefined') return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function getRawAllData() {
    return {
      [STORAGE_KEYS.stockPortfolio]: localStorage.getItem(STORAGE_KEYS.stockPortfolio),
      [STORAGE_KEYS.accountRewards]: localStorage.getItem(STORAGE_KEYS.accountRewards),
      [STORAGE_KEYS.hkIpoRecords]: localStorage.getItem(STORAGE_KEYS.hkIpoRecords),
      [STORAGE_KEYS.intradayOptions]: localStorage.getItem(STORAGE_KEYS.intradayOptions),
      [STORAGE_KEYS.intradayOptionImages]: localStorage.getItem(STORAGE_KEYS.intradayOptionImages),
      [STORAGE_KEYS.exchangeRates]: localStorage.getItem(STORAGE_KEYS.exchangeRates)
    };
  }

  function getAllData() {
    const raw = getRawAllData();
    return {
      stockPortfolio: safeParse(raw[STORAGE_KEYS.stockPortfolio], {}),
      accountRewards: safeParse(raw[STORAGE_KEYS.accountRewards], {}),
      hkIpoRecords: safeParse(raw[STORAGE_KEYS.hkIpoRecords], {}),
      intradayOptions: safeParse(raw[STORAGE_KEYS.intradayOptions], {}),
      intradayOptionImages: safeParse(raw[STORAGE_KEYS.intradayOptionImages], {}),
      exchangeRates: safeParse(raw[STORAGE_KEYS.exchangeRates], {})
    };
  }

  function countActive(list) {
    return (Array.isArray(list) ? list : []).filter(item => !item.deleted).length;
  }

  function countOptionImages(imageData) {
    const imageMap = imageData?.images || imageData || {};
    return Object.values(imageMap).reduce((sum, day) => {
      if (Array.isArray(day)) return sum + day.filter(item => item && (item.imageDataUrl || item.imageKey)).length;
      if (Array.isArray(day?.items)) return sum + day.items.filter(item => item && (item.imageDataUrl || item.imageKey)).length;
      return sum + (day && (day.imageDataUrl || day.imageKey) ? 1 : 0);
    }, 0);
  }

  async function hydrateOptionImages(imageData) {
    const clone = JSON.parse(JSON.stringify(imageData || {}));
    const imageMap = clone.images || clone || {};
    const tasks = [];
    Object.values(imageMap).forEach(day => {
      const items = Array.isArray(day) ? day : (Array.isArray(day?.items) ? day.items : (day ? [day] : []));
      items.forEach(item => {
        if (!item || item.imageDataUrl || !item.imageKey) return;
        tasks.push(optionImageDbGet(item.imageKey).then(dataUrl => {
          if (dataUrl) item.imageDataUrl = dataUrl;
        }).catch(() => {}));
      });
    });
    await Promise.all(tasks);
    return clone;
  }

  async function getBackupPayload(reason) {
    const data = getAllData();
    data.intradayOptionImages = await hydrateOptionImages(data.intradayOptionImages);
    const stockList = data.stockPortfolio.stocks || (Array.isArray(data.stockPortfolio) ? data.stockPortfolio : []);
    const accountList = data.accountRewards.accounts || (Array.isArray(data.accountRewards) ? data.accountRewards : []);
    const ipoList = data.hkIpoRecords.records || (Array.isArray(data.hkIpoRecords) ? data.hkIpoRecords : []);
    const optionList = data.intradayOptions.records || (Array.isArray(data.intradayOptions) ? data.intradayOptions : []);
    const optionImageCount = countOptionImages(data.intradayOptionImages);
    return {
      app: 'sayi-invest-toolbox',
      version: '4.0-auto-file-backup',
      reason: reason || 'auto_save',
      exportTime: new Date().toISOString(),
      data,
      rawData: getRawAllData(),
      stats: {
        stockCount: countActive(stockList),
        accountCount: countActive(accountList),
        ipoCount: countActive(ipoList),
        optionCount: countActive(optionList),
        optionImageCount,
        totalCount: countActive(stockList) + countActive(accountList) + countActive(ipoList) + countActive(optionList)
      }
    };
  }

  function fileTimestamp(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + '_' + pad(date.getHours()) + '-' + pad(date.getMinutes()) + '-' + pad(date.getSeconds());
  }

  async function ensurePermission(handle, write = true) {
    const options = write ? { mode: 'readwrite' } : {};
    if ((await handle.queryPermission(options)) === 'granted') return true;
    return (await handle.requestPermission(options)) === 'granted';
  }

  async function getBackupDirHandle(rootHandle) {
    if (rootHandle.name === '基础数据') return rootHandle;
    const investmentRoot = rootHandle.name === '洒一投资工具箱'
      ? rootHandle
      : await rootHandle.getDirectoryHandle('洒一投资工具箱', { create: true });
    return await investmentRoot.getDirectoryHandle('基础数据', { create: true });
  }

  function describeBackupPath(rootHandle) {
    if (rootHandle.name === '基础数据') return '基础数据';
    if (rootHandle.name === '洒一投资工具箱') return '洒一投资工具箱/基础数据';
    return rootHandle.name + '/洒一投资工具箱/基础数据';
  }

  async function writeJsonFile(dirHandle, fileName, payload) {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
  }

  async function getSavedRootHandle() {
    if (!isSupported()) return null;
    const handle = await idbGet(HANDLE_KEY).catch(() => null);
    if (!handle) return null;
    if (!(await ensurePermission(handle, true))) return null;
    return handle;
  }

  async function chooseBackupFolder() {
    if (!isSupported()) {
      alert('当前浏览器不支持自动写入文件夹。请用最新版 Chrome 或 Edge 打开主页后再试。');
      return false;
    }
    const rootHandle = await window.showDirectoryPicker({
      id: 'sayi-invest-backup-folder',
      mode: 'readwrite',
      startIn: 'desktop'
    });
    if (!(await ensurePermission(rootHandle, true))) return false;
    const backupDir = await getBackupDirHandle(rootHandle);
    await idbSet(HANDLE_KEY, rootHandle);
    await saveNow('folder_authorized');
    alert('✓ 自动备份已开启。\n\n以后数据会自动保存到：' + describeBackupPath(rootHandle));
    return true;
  }

  async function saveNow(reason) {
    const rootHandle = await getSavedRootHandle();
    if (!rootHandle) return false;
    const backupDir = await getBackupDirHandle(rootHandle);
    const payload = await getBackupPayload(reason || 'auto_save');
    await writeJsonFile(backupDir, 'latest.json', payload);
    await writeJsonFile(backupDir, 'backup_' + fileTimestamp() + '.json', payload);
    localStorage.setItem('sayi_last_file_backup_time', payload.exportTime);
    return true;
  }

  function schedule(reason) {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(() => {
      saveNow(reason).catch(error => console.warn('自动文件备份失败:', error));
    }, 600);
  }

  async function refreshStatus(elementId) {
    const el = document.getElementById(elementId || 'fileBackupStatus');
    if (!el) return;
    if (!isSupported()) {
      el.textContent = '自动文件备份：当前浏览器不支持，请使用 Chrome/Edge';
      return;
    }
    const handle = await getSavedRootHandle();
    const last = localStorage.getItem('sayi_last_file_backup_time');
    el.textContent = handle
      ? '自动文件备份：已开启' + (last ? '｜最近：' + new Date(last).toLocaleString('zh-CN') : '')
      : '自动文件备份：未开启，请先授权基础数据文件夹';
  }

  window.sayiAutoFileBackup = {
    isSupported,
    chooseBackupFolder,
    saveNow,
    schedule,
    refreshStatus,
    getBackupPayload
  };
})();
