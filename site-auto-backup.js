// 洒一的财务与投资 - 全站自动文件备份
// 首次使用需要在主页点击“开启自动备份”，由浏览器授权备份文件夹。
(function () {
  'use strict';

  const DB_NAME = 'sayi_site_auto_file_backup_db';
  const STORE_NAME = 'settings';
  const HANDLE_KEY = 'siteBackupDirectoryHandle';
  const LAST_TIME_KEY = 'sayi_site_file_backup_last_time';
  const ENABLED_KEY = 'sayi_site_file_backup_enabled';
  const PENDING_REASON_KEY = 'sayi_site_file_backup_pending_reason';
  const LOCAL_BACKUP_KEY = 'sayi_finance_invest_all_backups_v1';
  const OPTION_IMAGE_DB_NAME = 'sayi_intraday_option_images_db';
  const OPTION_IMAGE_STORE_NAME = 'images';
  const WATCHED_KEYS = [
    'personal-asset-manager:v1',
    'mobile-ledger:v1',
    'mobile-ledger:sync-url',
    'mobile-ledger:finance-reset-at',
    'stockPortfolio_v3_anime',
    'accountRewards_v4',
    'hkIpoRecords_v2',
    'intradayOptionsRecords_v1',
    'intradayOptionsTradeImages_v1',
    'sayi_exchange_rates_v2',
    'sayi_finance_asset_sync_v1',
    'sayi_legacy_stock_imported_at'
  ];
  const IGNORED_PREFIXES = [
    'sayi_site_file_backup_',
    'sayi_auto_file_backup_',
    'sayi_last_file_backup_time'
  ];
  let backupTimer = null;
  let storagePatched = false;

  function isSupported() {
    return window.isSecureContext && 'showDirectoryPicker' in window && 'indexedDB' in window;
  }

  function supportMessage() {
    if (!window.isSecureContext) return '当前页面不是安全页面。请用 https://电脑局域网地址:4175/home.html，或用 Chrome/Edge 打开本机页面。';
    if (!('showDirectoryPicker' in window)) return '当前浏览器不支持选择备份文件夹。请用电脑版 Chrome 或 Edge 打开主页；Safari、iPhone 主屏幕 App 通常不支持这个自动写文件夹功能。';
    if (!('indexedDB' in window)) return '当前浏览器不能保存文件夹授权，请换最新版 Chrome 或 Edge。';
    return '';
  }

  function setStatus(text, elementId = 'siteFileBackupStatus') {
    const el = document.getElementById(elementId);
    if (el) el.textContent = text;
  }

  function safeParse(raw, fallback = null) {
    if (!raw || raw === 'null' || raw === 'undefined') return fallback;
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { return fallback; }
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

  function getRawAllData() {
    const data = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) data[key] = localStorage.getItem(key);
    }
    return data;
  }

  function getStructuredData() {
    const finance = safeParse(localStorage.getItem('personal-asset-manager:v1'), { transactions: [], assets: [], debts: [] });
    const mobileLedger = safeParse(localStorage.getItem('mobile-ledger:v1'), { records: [] });
    return {
      finance,
      mobileLedger,
      investment: {
        stockPortfolio: safeParse(localStorage.getItem('stockPortfolio_v3_anime'), {}),
        accountRewards: safeParse(localStorage.getItem('accountRewards_v4'), {}),
        hkIpoRecords: safeParse(localStorage.getItem('hkIpoRecords_v2'), {}),
        intradayOptions: safeParse(localStorage.getItem('intradayOptionsRecords_v1'), {}),
        intradayOptionImages: safeParse(localStorage.getItem('intradayOptionsTradeImages_v1'), {}),
        exchangeRates: safeParse(localStorage.getItem('sayi_exchange_rates_v2'), null),
        financeAssetSync: safeParse(localStorage.getItem('sayi_finance_asset_sync_v1'), null)
      },
      settings: {
        mobileLedgerSyncUrl: localStorage.getItem('mobile-ledger:sync-url') || '',
        mobileLedgerFinanceResetAt: localStorage.getItem('mobile-ledger:finance-reset-at') || '',
        legacyStockImportedAt: localStorage.getItem('sayi_legacy_stock_imported_at') || ''
      }
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

  function getStats(data = getStructuredData()) {
    const finance = data.finance || {};
    const mobileLedger = data.mobileLedger || {};
    const investment = data.investment || {};
    return {
      financeTransactions: Array.isArray(finance.transactions) ? finance.transactions.length : 0,
      financeAssets: Array.isArray(finance.assets) ? finance.assets.length : 0,
      financeDebts: Array.isArray(finance.debts) ? finance.debts.length : 0,
      mobileRecords: Array.isArray(mobileLedger.records) ? mobileLedger.records.length : 0,
      stockCount: countActive(investment.stockPortfolio?.stocks || (Array.isArray(investment.stockPortfolio) ? investment.stockPortfolio : [])),
      accountCount: countActive(investment.accountRewards?.accounts || (Array.isArray(investment.accountRewards) ? investment.accountRewards : [])),
      ipoCount: countActive(investment.hkIpoRecords?.records || (Array.isArray(investment.hkIpoRecords) ? investment.hkIpoRecords : [])),
      intradayOptionCount: countActive(investment.intradayOptions?.records || (Array.isArray(investment.intradayOptions) ? investment.intradayOptions : [])),
      intradayOptionImageCount: countOptionImages(investment.intradayOptionImages),
      localStorageKeys: localStorage.length
    };
  }

  async function getBackupPayload(reason) {
    const data = getStructuredData();
    data.investment.intradayOptionImages = await hydrateOptionImages(data.investment.intradayOptionImages);
    return {
      app: 'sayi-finance-invest-all',
      version: '20260603-site-auto-file-backup',
      reason: reason || 'auto_save',
      exportTime: new Date().toISOString(),
      data,
      rawData: Object.fromEntries(WATCHED_KEYS.map(key => [key, localStorage.getItem(key)])),
      allLocalStorage: getRawAllData(),
      stats: getStats(data)
    };
  }

  function fileTimestamp(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  }

  async function ensurePermission(handle, write = true) {
    const options = write ? { mode: 'readwrite' } : {};
    if ((await handle.queryPermission(options)) === 'granted') return true;
    return (await handle.requestPermission(options)) === 'granted';
  }

  async function getBackupDirHandle(rootHandle) {
    if (rootHandle.name === '基础数据') return rootHandle;
    if (rootHandle.name === '全站数据') return rootHandle.getDirectoryHandle('基础数据', { create: true });
    const backupRoot = rootHandle.name === '数据备份'
      ? rootHandle
      : await rootHandle.getDirectoryHandle('数据备份', { create: true });
    const siteRoot = await backupRoot.getDirectoryHandle('全站数据', { create: true });
    return siteRoot.getDirectoryHandle('基础数据', { create: true });
  }

  function describeBackupPath(rootHandle) {
    if (rootHandle.name === '基础数据') return '基础数据';
    if (rootHandle.name === '全站数据') return '全站数据/基础数据';
    if (rootHandle.name === '数据备份') return '数据备份/全站数据/基础数据';
    return `${rootHandle.name}/数据备份/全站数据/基础数据`;
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
      const message = supportMessage();
      setStatus('自动文件备份：' + message);
      alert(message);
      return false;
    }
    setStatus('自动文件备份：正在等待你选择备份文件夹...');
    try {
      const rootHandle = await window.showDirectoryPicker({
        id: 'sayi-site-backup',
        mode: 'readwrite',
        startIn: 'documents'
      });
      if (!(await ensurePermission(rootHandle, true))) {
        setStatus('自动文件备份：未获得写入权限，请重新点“开启自动备份”并允许写入。');
        alert('还没有获得写入权限。请重新点“开启自动备份”，选择文件夹后允许写入。');
        return false;
      }
      await getBackupDirHandle(rootHandle);
      await idbSet(HANDLE_KEY, rootHandle);
      localStorage.setItem(ENABLED_KEY, '1');
      const saved = await saveNow('folder_authorized');
      if (!saved) throw new Error('文件夹授权没有保存成功');
      alert('✓ 全站自动备份已开启。\n\n以后数据会自动保存到：' + describeBackupPath(rootHandle));
      return true;
    } catch (error) {
      const cancelled = error && (error.name === 'AbortError' || /abort/i.test(String(error.message || error)));
      const message = cancelled
        ? '你刚才取消了选择文件夹，所以自动备份还没有开启。'
        : '开启自动备份失败：' + (error.message || error);
      setStatus('自动文件备份：' + message);
      alert(message);
      return false;
    }
  }

  async function saveNow(reason) {
    const rootHandle = await getSavedRootHandle();
    if (!rootHandle) return false;
    const backupDir = await getBackupDirHandle(rootHandle);
    const payload = await getBackupPayload(reason || 'auto_save');
    await writeJsonFile(backupDir, 'latest.json', payload);
    await writeJsonFile(backupDir, 'backup_' + fileTimestamp() + '.json', payload);
    localStorage.setItem(LAST_TIME_KEY, payload.exportTime);
    return true;
  }

  function isWatchedKey(key) {
    if (!key || key === LOCAL_BACKUP_KEY) return false;
    if (IGNORED_PREFIXES.some(prefix => key.startsWith(prefix))) return false;
    return WATCHED_KEYS.includes(key);
  }

  function schedule(reason) {
    if (localStorage.getItem(ENABLED_KEY) !== '1') return;
    clearTimeout(backupTimer);
    backupTimer = setTimeout(() => {
      saveNow(reason || 'auto_save').then(() => refreshStatus()).catch(error => console.warn('全站自动文件备份失败:', error));
    }, 900);
  }

  function patchLocalStorage() {
    if (storagePatched) return;
    storagePatched = true;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const result = originalSetItem.apply(this, arguments);
      try {
        if (isWatchedKey(String(key || ''))) schedule('local_storage_change:' + key);
      } catch (error) {
        console.warn('全站自动备份监听失败:', error);
      }
      return result;
    };
  }

  async function dailyAutoBackup() {
    const today = new Date().toISOString().slice(0, 10);
    const last = localStorage.getItem('sayi_site_file_backup_last_daily');
    if (last === today) return;
    localStorage.setItem('sayi_site_file_backup_last_daily', today);
    schedule('daily_auto_backup');
  }

  async function processPendingBackup() {
    const reason = localStorage.getItem(PENDING_REASON_KEY);
    if (!reason) return;
    localStorage.removeItem(PENDING_REASON_KEY);
    schedule(reason);
  }

  async function refreshStatus(elementId) {
    const el = document.getElementById(elementId || 'siteFileBackupStatus');
    if (!el) return;
    if (!isSupported()) {
      el.textContent = '自动文件备份：' + supportMessage();
      return;
    }
    const handle = await getSavedRootHandle();
    const last = localStorage.getItem(LAST_TIME_KEY);
    el.textContent = handle
      ? '自动文件备份：已开启｜保存到 ' + describeBackupPath(handle) + (last ? '｜最近：' + new Date(last).toLocaleString('zh-CN') : '')
      : '自动文件备份：未开启，请先授权备份文件夹。';
  }

  window.sayiSiteAutoFileBackup = {
    isSupported,
    chooseBackupFolder,
    saveNow,
    schedule,
    refreshStatus,
    getBackupPayload,
    supportMessage,
    isEnabled: () => localStorage.getItem(ENABLED_KEY) === '1'
  };

  patchLocalStorage();
  window.addEventListener('storage', event => {
    if (isWatchedKey(event.key)) schedule('storage_event:' + event.key);
  });
  window.addEventListener('load', () => {
    processPendingBackup();
    dailyAutoBackup();
    refreshStatus();
  });
})();
