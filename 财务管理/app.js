const STORAGE_KEY = "personal-asset-manager:v1";
const MOBILE_LEDGER_KEY = "mobile-ledger:v1";
const STOCK_PORTFOLIO_KEY = "stockPortfolio_v3_anime";
const STOCK_FINANCE_SYNC_KEY = "sayi_finance_asset_sync_v1";
const INVESTMENT_SYNC_ASSET_ID = "investment-toolbox-total-assets";
const LEGACY_INVESTMENT_SYNC_SOURCE = `股票${"直仓"}自动同步`;
const LEGACY_INVESTMENT_NAME = `股票${"直仓"}`;

const expenseCategories = [
  "餐饮", "交通", "日用", "购物", "娱乐", "通讯", "旅行", "学习", "医疗", "保险", "住房", "书籍", "美容", "孩子",
  "菠菜", "死妈路桥", "游戏", "彩票", "运动", "零食", "维修", "旅游", "二手买卖", "长辈", "水电", "办公",
  "服饰", "礼物", "手机险", "蔬菜", "快递", "数码", "社交", "汽车", "京东白条", "其他", "其它",
];
const incomeCategories = ["工资", "平台薅毛", "养正兼职", "礼金", "兼职", "理财", "二手买卖", "亲友", "投资收益", "副业", "退款", "其他收入", "其它"];
const categoryKeywords = [
  ["餐饮", ["餐", "饭", "咖啡", "茶", "外卖", "美团", "饿了么", "盒马", "麦当劳", "肯德基", "星巴克"]],
  ["交通", ["滴滴", "地铁", "公交", "铁路", "高铁", "机票", "加油", "停车", "打车"]],
  ["购物", ["淘宝", "天猫", "京东", "拼多多", "抖音", "小红书", "商场", "超市", "便利店"]],
  ["居住", ["房租", "物业", "水费", "电费", "燃气", "宽带", "公积金", "房贷"]],
  ["娱乐", ["电影", "游戏", "会员", "音乐", "视频", "酒吧", "演出", "ktv", "KTV"]],
  ["医疗", ["医院", "药", "医保", "体检", "诊所"]],
  ["教育", ["课程", "学费", "培训", "书", "知识", "考试"]],
  ["旅行", ["酒店", "民宿", "携程", "飞猪", "景区", "门票"]],
  ["人情", ["红包", "转账", "礼", "婚礼", "份子"]],
];

const state = loadState();
let importPreview = [];
let editingAssetId = null;
let editingDebtId = null;

const $ = (selector) => document.querySelector(selector);
const formatter = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" });

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed.transactions) && Array.isArray(parsed.debts)) {
      parsed.assets = Array.isArray(parsed.assets) ? parsed.assets : seedAssets();
      return parsed;
    }
  } catch (error) {
    console.warn("Unable to load saved data", error);
  }
  return {
    transactions: seedTransactions(),
    assets: seedAssets(),
    debts: seedDebts(),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `finance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function seedTransactions() {
  return [];
}

function seedDebts() {
  return [];
}

function seedAssets() {
  return [];
}

function tx(date, type, amount, category, merchant, note = "", source = "manual") {
  return { id: createId(), date, type, amount: Number(amount), category, merchant, note, source };
}

function init() {
  sanitizeState();
  const currentMonth = new Date().toISOString().slice(0, 7);
  $("#monthInput").value = currentMonth;
  fillCategoryOptions();
  $("#txDate").value = `${currentMonth}-${String(new Date().getDate()).padStart(2, "0")}`;
  $("#assetDate").value = new Date().toISOString().slice(0, 10);

  document.querySelectorAll(".tab-button").forEach((button) => button.addEventListener("click", switchTab));
  $("#monthInput").addEventListener("change", render);
  $("#txType").addEventListener("change", fillCategoryOptions);
  $("#assetForm").addEventListener("submit", addAsset);
  $("#transactionForm").addEventListener("submit", addTransaction);
  $("#debtForm").addEventListener("submit", addDebt);
  $("#assetCancelEditBtn").addEventListener("click", clearAssetForm);
  $("#debtCancelEditBtn").addEventListener("click", clearDebtForm);
  $("#billFile").addEventListener("change", previewBillFile);
  $("#importSource").addEventListener("change", previewBillFile);
  $("#importBtn").addEventListener("click", commitImport);
  $("#selectAllTx").addEventListener("change", toggleAllTransactions);
  $("#deleteSelectedBtn").addEventListener("click", deleteSelectedTransactions);
  $("#exportBtn").addEventListener("click", exportData);
  $("#clearBtn").addEventListener("click", clearData);
  $("#syncMobileLedgerBtn").addEventListener("click", () => syncMobileLedger({ manual: true }));
  $("#syncInvestmentAssetsBtn").addEventListener("click", () => syncInvestmentAssets({ manual: true }));
  $("#syncInvestmentAssetsBtn2").addEventListener("click", () => syncInvestmentAssets({ manual: true }));
  $("#importLegacyDataBtn").addEventListener("click", () => importLegacyMigration({ manual: true }).then(() => syncExternalData()));

  migrateLegacyDataIfNeeded();
  saveState();
  render();
  syncExternalData();
  window.setInterval(() => syncMobileLedger({ manual: false }), 30000);
  window.addEventListener("focus", () => syncMobileLedger({ manual: false }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncMobileLedger({ manual: false });
  });
}

function switchTab(event) {
  const tab = event.currentTarget.dataset.tab;
  document.querySelectorAll(".tab-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${tab}Panel`));
  const titles = { dashboard: "财务总览", assets: "资产账户管理", transactions: "支出与收入流水", liabilities: "负债账户管理", import: "账单导入分析" };
  $("#pageTitle").textContent = titles[tab];
}

function fillCategoryOptions() {
  const type = $("#txType").value;
  const categories = type === "income" ? incomeCategories : expenseCategories;
  $("#txCategory").innerHTML = categories.map((category) => `<option value="${category}">${category}</option>`).join("");
}

function addTransaction(event) {
  event.preventDefault();
  state.transactions.push(tx($("#txDate").value, $("#txType").value, $("#txAmount").value, $("#txCategory").value, $("#txMerchant").value.trim(), $("#txNote").value.trim()));
  saveState();
  event.target.reset();
  $("#txDate").value = `${$("#monthInput").value}-01`;
  fillCategoryOptions();
  render();
}

function addAsset(event) {
  event.preventDefault();
  const payload = {
    name: $("#assetName").value.trim(),
    type: $("#assetType").value,
    balance: Number($("#assetBalance").value),
    date: $("#assetDate").value,
    note: $("#assetNote").value.trim(),
  };
  if (editingAssetId) {
    const asset = state.assets.find((item) => item.id === editingAssetId);
    if (asset) Object.assign(asset, payload);
  } else {
    state.assets.push({ id: createId(), ...payload });
  }
  saveState();
  clearAssetForm();
  render();
}

function addDebt(event) {
  event.preventDefault();
  const payload = {
    name: $("#debtName").value.trim(),
    type: $("#debtType").value,
    due: Number($("#debtDue").value),
    day: Number($("#debtDay").value),
    note: $("#debtNote").value.trim(),
  };
  if (editingDebtId) {
    const debt = state.debts.find((item) => item.id === editingDebtId);
    if (debt) Object.assign(debt, payload);
  } else {
    state.debts.push({ id: createId(), ...payload, paidMonths: [] });
  }
  saveState();
  clearDebtForm();
  render();
}

function clearAssetForm() {
  editingAssetId = null;
  $("#assetForm").reset();
  $("#assetDate").value = new Date().toISOString().slice(0, 10);
  $("#assetSubmitBtn").textContent = "添加资产账户";
  $("#assetCancelEditBtn").classList.add("hidden");
}

function clearDebtForm() {
  editingDebtId = null;
  $("#debtForm").reset();
  $("#debtSubmitBtn").textContent = "添加负债";
  $("#debtCancelEditBtn").classList.add("hidden");
}

function getMonthRows() {
  const month = $("#monthInput").value;
  return state.transactions.filter((item) => item.date?.startsWith(month));
}

function render() {
  const rows = getMonthRows();
  const debtDueTotal = activeDebtTotal();
  const assetTotal = sumAssets();
  const netWorth = assetTotal - debtDueTotal;
  const debtRatio = assetTotal > 0 ? debtDueTotal / assetTotal : 0;

  $("#assetTotal").textContent = money(assetTotal);
  $("#assetCount").textContent = `${state.assets.length} 个账户`;
  setText("#netWorthTotal", money(netWorth));
  $("#debtDueTotal").textContent = money(debtDueTotal);
  $("#debtDueCount").textContent = `${state.debts.length} 项负债`;
  setText("#debtRatio", percent(debtRatio));

  const score = calculateAssetScore(assetTotal, debtDueTotal);
  $("#healthScore").textContent = `${score}`;
  renderAssetOverview(assetTotal, debtDueTotal, netWorth);
  renderAssets();
  renderTransactions(rows);
  renderDebts();
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value;
}

async function syncExternalData() {
  await importLegacyMigration({ manual: false });
  const mobile = await syncMobileLedger({ manual: false });
  const assets = syncInvestmentAssets({ manual: false });
  const parts = [];
  if (mobile.available) parts.push(`手机记账 ${mobile.count} 笔`);
  if (assets.available) parts.push(`股票持仓资产 ${money(assets.balance)}`);
  if (parts.length) updateSyncStatus(`已同步：${parts.join("；")}`);
}

function migrateLegacyDataIfNeeded() {
  if (location.protocol !== "file:") return;
  const rawData = {};
  [STORAGE_KEY, MOBILE_LEDGER_KEY, STOCK_PORTFOLIO_KEY, STOCK_FINANCE_SYNC_KEY].forEach((key) => {
    const value = localStorage.getItem(key);
    if (value && value !== "null" && value !== "undefined") rawData[key] = value;
  });
  if (!Object.keys(rawData).length) return;
  fetch("http://localhost:4176/api/migration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "file-finance-manager", page: location.href, rawData }),
  }).catch(() => {});
}

async function importLegacyMigration({ manual }) {
  if (location.protocol === "file:") return { available: false };
  try {
    const response = await fetch(`/api/migration/latest?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return { available: false };
    const data = await response.json();
    const rawData = data.rawData && typeof data.rawData === "object" ? data.rawData : {};
    let changed = false;

    const finance = parseStoredJson(rawData[STORAGE_KEY]);
    if (finance && Array.isArray(finance.transactions)) {
      changed = mergeStateArray("transactions", withoutGarbageRows(finance.transactions), transactionKey) || changed;
      changed = mergeStateArray("assets", withoutGarbageRows(finance.assets || []), assetKey) || changed;
      changed = mergeStateArray("debts", withoutGarbageRows(finance.debts || []), debtKey) || changed;
    }

    [MOBILE_LEDGER_KEY, STOCK_PORTFOLIO_KEY, STOCK_FINANCE_SYNC_KEY].forEach((key) => {
      if (rawData[key] && !localStorage.getItem(key)) {
        localStorage.setItem(key, rawData[key]);
        changed = true;
      }
    });

    if (changed) {
      sanitizeState();
      saveState();
      render();
      if (manual) updateSyncStatus("旧入口里的本地数据已搬到新版入口，示例垃圾数据已跳过。");
    }
    return { available: changed };
  } catch (error) {
    console.warn("读取旧数据迁移失败", error);
    return { available: false };
  }
}

function parseStoredJson(raw) {
  if (!raw || raw === "null" || raw === "undefined") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sanitizeState() {
  state.transactions = withoutGarbageRows(state.transactions);
  state.assets = withoutGarbageRows(state.assets).map((asset) => {
    if (asset.id === INVESTMENT_SYNC_ASSET_ID || asset.source === LEGACY_INVESTMENT_SYNC_SOURCE) {
      return {
        ...asset,
        name: String(asset.name || "").replaceAll(LEGACY_INVESTMENT_NAME, "股票持仓"),
        source: "股票持仓自动同步",
      };
    }
    return asset;
  });
  state.debts = withoutGarbageRows(state.debts);
}

function withoutGarbageRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((item) => item && item.note !== "示例数据");
}

function mergeStateArray(field, incoming, keyFn) {
  if (!Array.isArray(incoming) || !incoming.length) return false;
  const current = Array.isArray(state[field]) ? state[field] : [];
  const seen = new Set(current.map(keyFn));
  let changed = false;
  incoming.forEach((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return;
    current.push(item);
    seen.add(key);
    changed = true;
  });
  state[field] = current;
  return changed;
}

function assetKey(item) {
  return item.id || [item.name, item.type, item.balance, item.date].join("|");
}

function debtKey(item) {
  return item.id || [item.name, item.type, item.due, item.day].join("|");
}

async function syncMobileLedger({ manual }) {
  const sources = [];
  const fileResult = await readMobileLedgerFromFiles();
  const resetAt = fileResult?.resetAt || "";
  if (fileResult?.records) sources.push(...fileResult.records);
  const localRecords = readMobileLedgerFromLocalStorage();
  if (localRecords) {
    sources.push(...localRecords.filter((record) => {
      if (!resetAt) return true;
      const marker = record.updatedAt || record.createdAt || "";
      return marker > resetAt;
    }));
  }

  if (resetAt && !sources.length) {
    state.transactions = state.transactions.filter((item) => item.source !== "手机记账自动同步" && item.source !== "手机记账");
    localStorage.setItem("mobile-ledger:finance-reset-at", resetAt);
    saveState();
    render();
    if (manual) updateSyncStatus("手机记账已清空，财务管理中的手机记账流水也已清除。");
    return { available: true, count: 0, resetAt };
  }

  if (!sources.length) {
    if (manual) updateSyncStatus("没有读取到手机记账数据。请先打开手机同步接收器，并在手机端同步一次。");
    return { available: false, count: 0 };
  }

  const normalized = uniqueTransactions(sources.map(normalizeMobileLedgerRecord).filter(Boolean));
  state.transactions = state.transactions.filter((item) => item.source !== "手机记账自动同步" && item.source !== "手机记账" && item.note !== "示例数据");
  state.transactions.push(...normalized);
  saveState();
  render();
  if (manual) updateSyncStatus(`手机记账已同步：${normalized.length} 笔收入/支出。`);
  return { available: true, count: normalized.length };
}

function syncInvestmentAssets({ manual }) {
  const syncData = readInvestmentAssetSync();
  if (!syncData || !(Number(syncData.balance) >= 0)) {
    if (manual) updateSyncStatus("没有读取到股票持仓总资产。请先在股票持仓里保存或记录一次总资产。");
    return { available: false, balance: 0 };
  }

  const asset = {
    id: INVESTMENT_SYNC_ASSET_ID,
    name: "股票持仓总资产",
    type: "investment",
    balance: Number(syncData.balance),
    date: syncData.date || new Date().toISOString().slice(0, 10),
    note: `来自洒一投资工具箱${syncData.updatedAt ? `，同步于 ${formatDateTime(syncData.updatedAt)}` : ""}`,
    source: "股票持仓自动同步",
  };
  state.assets = state.assets.filter((item) => item.id !== INVESTMENT_SYNC_ASSET_ID && item.source !== LEGACY_INVESTMENT_SYNC_SOURCE && item.source !== "股票持仓自动同步" && item.note !== "示例数据");
  state.assets.push(asset);
  saveState();
  render();
  if (manual) updateSyncStatus(`股票持仓总资产已同步：${money(asset.balance)}。`);
  return { available: true, balance: asset.balance };
}

function readMobileLedgerFromLocalStorage() {
  try {
    const data = JSON.parse(localStorage.getItem(MOBILE_LEDGER_KEY) || "null");
    if (data && Array.isArray(data.records)) return data.records;
  } catch (error) {
    console.warn("读取手机记账本地数据失败", error);
  }
  return null;
}

async function readMobileLedgerFromFiles() {
  const month = $("#monthInput").value || new Date().toISOString().slice(0, 7);
  let resetAt = "";
  const urls = [
    "./手机记账同步/手机记账-重置标记.json",
    "./手机记账同步/手机记账-全部同步.json",
    `./手机记账同步/手机记账-${month}-导入财务管理.json`,
  ];
  const rows = [];
  for (const url of urls) {
    try {
      const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) continue;
      const data = await response.json();
      if (data.schema === "mobile-ledger-reset" && data.resetAt) {
        resetAt = data.resetAt;
      } else if (Array.isArray(data.records) && data.records.length) {
        rows.push(...data.records);
      } else if (Array.isArray(data.transactions)) {
        rows.push(...data.transactions);
      }
    } catch (error) {
      console.warn("读取手机记账同步文件失败", url, error);
    }
  }
  return rows.length || resetAt ? { records: rows, resetAt } : null;
}

function normalizeMobileLedgerRecord(item) {
  const date = normalizeDate(item.date || item.time || item.transactionTime);
  const type = item.type === "income" || item.type === "收入" || item.direction === "收入" ? "income" : "expense";
  const amount = normalizeAmount(item.amount || item.money || item.value);
  if (!date || !amount) return null;
  const category = item.category || inferCategory(`${item.merchant || ""}${item.note || ""}`, type);
  const merchant = item.merchant || item.name || category || "手机记账";
  return {
    id: `mobile-${item.id || transactionKey({ date, type, amount, category, merchant })}`,
    date,
    type,
    amount,
    category,
    merchant,
    note: item.note || "",
    source: "手机记账自动同步",
  };
}

function uniqueTransactions(rows) {
  const seen = new Set();
  const result = [];
  rows.forEach((item) => {
    const key = item.id || transactionKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
}

function readInvestmentAssetSync() {
  try {
    const sync = JSON.parse(localStorage.getItem(STOCK_FINANCE_SYNC_KEY) || "null");
    if (sync && Number(sync.totalAssets) >= 0) {
      return { balance: Number(sync.totalAssets), date: sync.date, updatedAt: sync.updatedAt };
    }
  } catch (error) {
    console.warn("读取股票持仓同步数据失败", error);
  }

  try {
    const portfolio = JSON.parse(localStorage.getItem(STOCK_PORTFOLIO_KEY) || "null");
    if (portfolio && Number(portfolio.totalAssets) >= 0) {
      return { balance: Number(portfolio.totalAssets), date: portfolio.timestamp?.slice(0, 10), updatedAt: portfolio.timestamp };
    }
  } catch (error) {
    console.warn("读取股票持仓本地数据失败", error);
  }
  return null;
}

function updateSyncStatus(message) {
  const summary = $("#syncSummary");
  const detail = $("#syncDetail");
  if (summary) summary.textContent = "已更新";
  if (detail) detail.textContent = message;
}

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString("zh-CN");
  } catch {
    return value;
  }
}

function sumAssets() {
  return state.assets.reduce((total, asset) => total + Number(asset.balance || 0), 0);
}

function activeDebtTotal() {
  const month = $("#monthInput").value;
  return state.debts
    .filter((debt) => !debt.paidMonths?.includes(month))
    .reduce((total, debt) => total + Number(debt.due || 0), 0);
}

function renderAssetOverview(assetTotal, debtTotal, netWorth) {
  const assetGroups = summarizeAssetGroups();
  const liabilityGroups = summarizeLiabilityGroups();
  const topAsset = assetGroups[0];

  setText("#compositionSummary", assetTotal ? `${assetGroups.length} 类资产` : "等待资产");
  setText("#assetMixSummary", topAsset ? `最高：${topAsset.label}` : "暂无数据");
  setText("#liabilitySummary", debtTotal ? `${state.debts.length} 项负债` : "暂无负债");
  setText("#balanceSummary", `净资产 ${money(netWorth)}`);

  $("#assetFlow").innerHTML = assetTotal || debtTotal
    ? buildAssetFlowHtml(assetGroups, liabilityGroups, assetTotal, debtTotal, netWorth)
    : `<div class="empty-state">同步股票持仓资产或新增账户后显示资产组成。</div>`;

  $("#assetMixBars").innerHTML = assetGroups.length
    ? assetGroups.map((item) => visualBar(item, assetTotal, "asset")).join("")
    : `<div class="empty-state">还没有资产账户。股票持仓总资产会保留在这里。</div>`;

  $("#liabilityBars").innerHTML = liabilityGroups.length
    ? liabilityGroups.map((item) => visualBar(item, debtTotal, "liability")).join("")
    : `<div class="empty-state">还没有负债记录。</div>`;

  $("#balanceBars").innerHTML = buildBalanceBars(assetTotal, debtTotal, netWorth);
}

function summarizeAssetGroups() {
  const totals = state.assets.reduce((result, asset) => {
    const label = assetClassLabel(asset.type);
    result[label] = (result[label] || 0) + Number(asset.balance || 0);
    return result;
  }, {});
  return Object.entries(totals)
    .map(([label, value]) => ({ label, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function summarizeLiabilityGroups() {
  const month = $("#monthInput").value;
  const totals = state.debts.reduce((result, debt) => {
    if (debt.paidMonths?.includes(month)) return result;
    const label = debt.type === "credit" ? "信用卡" : "贷款";
    result[label] = (result[label] || 0) + Number(debt.due || 0);
    return result;
  }, {});
  return Object.entries(totals)
    .map(([label, value]) => ({ label, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function buildAssetFlowHtml(assetGroups, liabilityGroups, assetTotal, debtTotal, netWorth) {
  const safeAssetTotal = Math.max(assetTotal, 1);
  const assetTargets = assetGroups.length ? assetGroups : [{ label: "暂无资产", value: 0 }];
  const sourceFlows = [
    { label: "净资产", value: Math.max(netWorth, 0), y: 166, color: "#18ad8d" },
    { label: "总负债", value: debtTotal, y: 76, color: "#8f8b98" },
  ].filter((item) => item.value > 0);
  const flowWidth = (value) => Math.max(6, Math.min(38, value / safeAssetTotal * 34));
  const sourcePaths = sourceFlows.map((item) => curvedPath(174, item.y, 328, 126, flowWidth(item.value), item.color, 0.42)).join("");
  const targetYs = distributeYs(assetTargets.length, 68, 190);
  const targetPaths = assetTargets.map((item, index) => {
    const palette = ["#7367d8", "#c9753a", "#60aec0", "#b89a42"];
    return curvedPath(432, 126, 614, targetYs[index], flowWidth(item.value), palette[index % palette.length], 0.48);
  }).join("");
  const sourceLabels = sourceFlows.map((item) => flowLabel(42, item.y, item.label, item.value, item.color, "left")).join("");
  const targetLabels = assetTargets.map((item, index) => flowLabel(644, targetYs[index], item.label, item.value, index === 0 ? "#7367d8" : index === 1 ? "#c9753a" : "#60aec0", "right")).join("");
  const debtNote = debtTotal ? `<div class="sankey-note"><span>负债率</span><strong>${percent(debtTotal / safeAssetTotal)}</strong></div>` : "";

  return `
    <div class="sankey-card">
      <svg class="sankey-svg" viewBox="0 0 760 240" role="img" aria-label="家庭资产组成桑基图">
        <defs>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .28 0" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <line class="sankey-axis" x1="328" y1="56" x2="328" y2="196"></line>
        <line class="sankey-axis asset" x1="432" y1="56" x2="432" y2="196"></line>
        ${sourcePaths}
        ${targetPaths}
        <rect class="sankey-node total" x="338" y="76" width="84" height="100" rx="14"></rect>
        <text class="sankey-total-label" x="380" y="118" text-anchor="middle">总资产</text>
        <text class="sankey-total-value" x="380" y="146" text-anchor="middle">${compactMoney(assetTotal)}</text>
        ${sourceLabels}
        ${targetLabels}
      </svg>
      <div class="sankey-footer">
        <div><span>净资产</span><strong>${money(netWorth)}</strong></div>
        <div><span>资产分类</span><strong>${assetGroups.length} 类</strong></div>
        ${debtNote}
      </div>
    </div>
  `;
}

function curvedPath(x1, y1, x2, y2, width, color, opacity) {
  const c1 = x1 + (x2 - x1) * 0.42;
  const c2 = x1 + (x2 - x1) * 0.62;
  return `<path class="sankey-flow" d="M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}" stroke="${color}" stroke-width="${width}" opacity="${opacity}" filter="url(#softGlow)"></path>`;
}

function flowLabel(x, y, label, value, color, anchor) {
  const align = anchor === "right" ? "start" : "start";
  const dotX = anchor === "right" ? x - 13 : x - 13;
  return `
    <circle cx="${dotX}" cy="${y}" r="4" fill="${color}"></circle>
    <text class="sankey-label" x="${x}" y="${y - 7}" text-anchor="${align}">${escapeHtml(label)}</text>
    <text class="sankey-value" x="${x}" y="${y + 18}" text-anchor="${align}">${compactMoney(value)}</text>
  `;
}

function distributeYs(count, start, end) {
  if (count <= 1) return [(start + end) / 2];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + step * index);
}

function visualBar(item, total, tone) {
  const ratio = total ? item.value / total : 0;
  return `
    <div class="bar-row ${tone}">
      <div class="bar-meta"><strong>${escapeHtml(item.label)}</strong><span>${money(item.value)} · ${percent(ratio)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(ratio * 100, 4)}%"></div></div>
    </div>
  `;
}

function buildBalanceBars(assetTotal, debtTotal, netWorth) {
  const basis = Math.max(assetTotal, debtTotal, Math.abs(netWorth), 1);
  const rows = [
    ["总资产", assetTotal, "asset"],
    ["总负债", debtTotal, "liability"],
    ["净资产", netWorth, netWorth >= 0 ? "net" : "negative"],
  ];
  return rows.map(([label, value, tone]) => `
    <div class="balance-row ${tone}">
      <div class="bar-meta"><strong>${label}</strong><span>${money(value)}</span></div>
      <div class="balance-track"><div style="width:${Math.max(Math.abs(value) / basis * 100, value ? 4 : 0)}%"></div></div>
    </div>
  `).join("");
}

function renderTransactions(rows) {
  $("#selectAllTx").checked = false;
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  $("#transactionTable").innerHTML = sorted.length
    ? sorted.map((item) => `
      <tr>
        <td><input class="tx-check" type="checkbox" value="${item.id}" aria-label="选择流水" /></td>
        <td>${escapeHtml(item.date)}</td>
        <td><span class="pill ${item.type}">${item.type === "income" ? "收入" : "支出"}</span></td>
        <td>${escapeHtml(item.category)}</td>
        <td>${escapeHtml(item.merchant)}</td>
        <td>${escapeHtml(item.note || "")}</td>
        <td class="amount">${money(item.amount)}</td>
      </tr>
    `).join("")
    : `<tr><td class="empty-state" colspan="7">本月暂无流水。</td></tr>`;
}

function renderAssets() {
  const total = sumAssets();
  const groups = {
    liquid: state.assets.filter((asset) => assetClassKey(asset.type) === "liquid"),
    investment: state.assets.filter((asset) => assetClassKey(asset.type) === "investment"),
    fixed: state.assets.filter((asset) => assetClassKey(asset.type) === "fixed"),
  };
  renderAssetGroup("liquid", groups.liquid);
  renderAssetGroup("investment", groups.investment);
  renderAssetGroup("fixed", groups.fixed);
  renderAssetPieAnalysis();

  document.querySelectorAll("[data-remove-asset]").forEach((button) => button.addEventListener("click", removeAsset));
  document.querySelectorAll("[data-edit-asset]").forEach((button) => button.addEventListener("click", editAsset));
}

function renderAssetGroup(group, assets) {
  const total = assets.reduce((sum, asset) => sum + Number(asset.balance || 0), 0);
  const summaryMap = {
    liquid: "#liquidAssetSummary",
    investment: "#investmentAssetSummary",
    fixed: "#fixedAssetSummary",
  };
  const listMap = {
    liquid: "#liquidAssetList",
    investment: "#investmentAssetList",
    fixed: "#fixedAssetList",
  };
  const emptyMap = {
    liquid: "添加银行卡、现金或微信/支付宝后显示流动性资产。",
    investment: "点击同步后，股票持仓总资产会显示在这里。",
    fixed: "添加房产、汽车后显示固定资产。",
  };
  setText(summaryMap[group], assets.length ? `${money(total)} · ${assets.length} 项` : "暂无");
  $(listMap[group]).innerHTML = assets.length
    ? assets.map((asset) => `
      <article class="debt-item">
        <strong>${escapeHtml(asset.name)} · ${money(asset.balance)}</strong>
        <p>${assetTypeLabel(asset.type)}｜更新于 ${escapeHtml(asset.date || "-")}${asset.note ? `｜${escapeHtml(asset.note)}` : ""}</p>
        <div class="debt-actions">
          <button class="ghost-button compact" type="button" data-edit-asset="${asset.id}">编辑</button>
          ${asset.source === "股票持仓自动同步" ? "" : `<button class="ghost-button compact" type="button" data-remove-asset="${asset.id}">删除</button>`}
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">${emptyMap[group]}</div>`;
}

function assetTypeLabel(type) {
  return {
    bank: "银行卡",
    cash: "现金",
    wallet: "微信 / 支付宝",
    "liquid-other": "其他流动资金",
    investment: "股票持仓",
    "fixed-house": "房产",
    "fixed-car": "汽车",
    "fixed-other": "其他固定资产",
    other: "其他流动资金",
  }[type] || "其他";
}

function assetClassLabel(type) {
  return {
    liquid: "流动性资产",
    investment: "投资资产",
    fixed: "固定资产",
  }[assetClassKey(type)];
}

function assetClassKey(type) {
  if (type === "investment") return "investment";
  if (String(type || "").startsWith("fixed-")) return "fixed";
  return "liquid";
}

function removeAsset(event) {
  const id = event.currentTarget.dataset.removeAsset;
  const index = state.assets.findIndex((item) => item.id === id);
  if (index >= 0) state.assets.splice(index, 1);
  saveState();
  render();
}

function editAsset(event) {
  const asset = state.assets.find((item) => item.id === event.currentTarget.dataset.editAsset);
  if (!asset) return;
  editingAssetId = asset.id;
  $("#assetName").value = asset.name || "";
  $("#assetType").value = asset.type || "bank";
  $("#assetBalance").value = Number(asset.balance || 0);
  $("#assetDate").value = asset.date || new Date().toISOString().slice(0, 10);
  $("#assetNote").value = asset.note || "";
  $("#assetSubmitBtn").textContent = "保存资产修改";
  $("#assetCancelEditBtn").classList.remove("hidden");
  $("#assetForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderDebts() {
  const month = $("#monthInput").value;
  const total = activeDebtTotal();
  $("#repaymentSummary").textContent = `${money(total)} 总负债`;
  $("#debtList").innerHTML = state.debts.length
    ? state.debts.map((debt) => {
      const paid = debt.paidMonths?.includes(month);
      return `
        <article class="debt-item ${paid ? "" : "warning"}">
          <strong>${escapeHtml(debt.name)} · ${money(debt.due)}</strong>
          <p>${debt.type === "credit" ? "信用卡" : "贷款"}｜每月 ${debt.day} 日｜${paid ? "已结清，不计入总负债" : "计入总负债"}${debt.note ? `｜${escapeHtml(debt.note)}` : ""}</p>
          <div class="debt-actions">
            <button class="ghost-button compact" type="button" data-edit-debt="${debt.id}">编辑</button>
            <button class="ghost-button compact" type="button" data-pay="${debt.id}">${paid ? "重新计入" : "标记结清"}</button>
            <button class="ghost-button compact" type="button" data-remove-debt="${debt.id}">删除</button>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="empty-state">添加信用卡或贷款后显示负债清单。</div>`;

  document.querySelectorAll("[data-pay]").forEach((button) => button.addEventListener("click", toggleDebtPaid));
  document.querySelectorAll("[data-remove-debt]").forEach((button) => button.addEventListener("click", removeDebt));
  document.querySelectorAll("[data-edit-debt]").forEach((button) => button.addEventListener("click", editDebt));
  renderDebtPieAnalysis();
}

function renderAssetPieAnalysis() {
  const entries = summarizeAssetGroups();
  renderPieAnalysis({
    entries,
    total: entries.reduce((sum, item) => sum + item.value, 0),
    containerSelector: "#assetPieAnalysis",
    summarySelector: "#assetPieSummary",
    emptyText: "添加资产后显示资产结构饼图。",
    largestPrefix: "最大资产",
  });
}

function renderDebtPieAnalysis() {
  const entries = summarizeLiabilityGroups();
  renderPieAnalysis({
    entries,
    total: entries.reduce((sum, item) => sum + item.value, 0),
    containerSelector: "#debtPieAnalysis",
    summarySelector: "#debtPieSummary",
    emptyText: "添加负债后显示负债结构饼图。",
    largestPrefix: "最大负债",
  });
}

function renderPieAnalysis({ entries, total, containerSelector, summarySelector, emptyText, largestPrefix }) {
  const container = $(containerSelector);
  if (!container) return;
  if (!entries.length || !total) {
    setText(summarySelector, "暂无数据");
    container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }
  const palette = ["#5c55e6", "#00a7a7", "#f0b93a", "#ec255a", "#8a63d2", "#2f9b72"];
  let cursor = 0;
  const stops = entries.map((item, index) => {
    const start = cursor;
    const end = cursor + (item.value / total) * 100;
    cursor = end;
    return `${palette[index % palette.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  }).join(", ");
  const largest = entries[0];
  setText(summarySelector, `${largest.label} ${percent(largest.value / total)}`);
  container.innerHTML = `
    <div class="pie-chart" style="background: conic-gradient(${stops});">
      <span>${percent(largest.value / total)}</span>
    </div>
    <div class="pie-copy">
      <strong>${largestPrefix}：${escapeHtml(largest.label)}</strong>
      <p>${escapeHtml(largest.label)}占 ${percent(largest.value / total)}，金额 ${money(largest.value)}。</p>
      <div class="pie-legend">
        ${entries.map((item, index) => `
          <div class="pie-legend-row">
            <i style="background:${palette[index % palette.length]}"></i>
            <span>${escapeHtml(item.label)}</span>
            <strong>${money(item.value)} · ${percent(item.value / total)}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function toggleDebtPaid(event) {
  const month = $("#monthInput").value;
  const debt = state.debts.find((item) => item.id === event.currentTarget.dataset.pay);
  if (!debt) return;
  debt.paidMonths = debt.paidMonths || [];
  if (debt.paidMonths.includes(month)) {
    debt.paidMonths = debt.paidMonths.filter((item) => item !== month);
  } else {
    debt.paidMonths.push(month);
  }
  saveState();
  render();
}

function removeDebt(event) {
  const id = event.currentTarget.dataset.removeDebt;
  const index = state.debts.findIndex((item) => item.id === id);
  if (index >= 0) state.debts.splice(index, 1);
  saveState();
  render();
}

function editDebt(event) {
  const debt = state.debts.find((item) => item.id === event.currentTarget.dataset.editDebt);
  if (!debt) return;
  editingDebtId = debt.id;
  $("#debtName").value = debt.name || "";
  $("#debtType").value = debt.type || "credit";
  $("#debtDue").value = Number(debt.due || 0);
  $("#debtDay").value = Number(debt.day || 1);
  $("#debtNote").value = debt.note || "";
  $("#debtSubmitBtn").textContent = "保存负债修改";
  $("#debtCancelEditBtn").classList.remove("hidden");
  $("#debtForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function toggleAllTransactions(event) {
  document.querySelectorAll(".tx-check").forEach((box) => {
    box.checked = event.target.checked;
  });
}

function deleteSelectedTransactions() {
  const selected = [...document.querySelectorAll(".tx-check:checked")].map((box) => box.value);
  if (!selected.length) return;
  state.transactions = state.transactions.filter((item) => !selected.includes(item.id));
  saveState();
  render();
}

async function previewBillFile() {
  const files = [...$("#billFile").files];
  importPreview = [];
  if (!files.length) {
    renderPreview();
    $("#importStatus").textContent = "尚未选择文件。";
    return;
  }

  try {
    const source = $("#importSource").value;
    const batches = await Promise.all(files.map(async (file) => parseBill(await readBillFileText(file), source)));
    importPreview = uniqueTransactions(batches.flat());
    renderPreview();
    $("#importStatus").textContent = importPreview.length
      ? `已从 ${files.length} 个文件识别 ${importPreview.length} 条流水，确认后可导入。`
      : "没有识别到可导入流水。请确认文件是鲨鱼记账、支付宝或微信导出的 CSV/TXT。";
  } catch (error) {
    $("#importStatus").textContent = "读取文件失败。";
    console.error(error);
  }
}

async function readBillFileText(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  const hasUtf16Zeros = bytes.slice(0, Math.min(bytes.length, 200)).some((byte, index) => index % 2 === 1 && byte === 0);
  if (hasUtf16Zeros) return new TextDecoder("utf-16le").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

function commitImport() {
  if (!importPreview.length) {
    $("#importStatus").textContent = "没有可导入的账单。";
    return;
  }
  const known = new Set(state.transactions.map(transactionKey));
  const newRows = importPreview.filter((item) => !known.has(transactionKey(item)));
  state.transactions.push(...newRows);
  saveState();
  $("#importStatus").textContent = `导入完成：新增 ${newRows.length} 条，跳过 ${importPreview.length - newRows.length} 条重复记录。`;
  importPreview = [];
  $("#billFile").value = "";
  renderPreview();
  render();
}

function parseBill(text, source) {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r/g, "");
  if (clean.trim().startsWith("{") || clean.trim().startsWith("[")) return parseJsonBill(clean);
  const rows = parseDelimited(clean);
  return rows.map((row) => normalizeBillRow(row, source)).filter(Boolean);
}

function parseJsonBill(text) {
  try {
    const data = JSON.parse(text);
    const rows = Array.isArray(data) ? data : data.transactions || [];
    return rows.map((item) => tx(
      normalizeDate(item.date || item.time || item.transactionTime),
      normalizeType(item.type || item.direction || item.inOut),
      normalizeAmount(item.amount || item.money || item.value),
      item.category || inferCategory(`${item.merchant || ""}${item.note || ""}`, item.type),
      item.merchant || item.name || item.counterparty || "未知商户",
      item.note || "",
      item.source || "json",
    )).filter((item) => item.date && item.amount > 0);
  } catch {
    return [];
  }
}

function parseDelimited(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const dataLines = lines.filter((line) => !line.startsWith("#") && !line.includes("-----"));
  const headerIndex = dataLines.findIndex((line) => /交易时间|交易创建时间|付款时间|时间|日期/.test(line) && /金额|收\/支|收支|商品|交易对方|交易类型/.test(line));
  if (headerIndex < 0) return [];
  const delimiter = detectDelimiter(dataLines[headerIndex]);
  const headers = splitLine(dataLines[headerIndex], delimiter).map(normalizeHeader);
  return dataLines.slice(headerIndex + 1).map((line) => {
    const values = splitLine(line, delimiter);
    if (values.length < 3) return null;
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  }).filter(Boolean);
}

function detectDelimiter(line) {
  const candidates = [",", "\t"];
  return candidates.sort((a, b) => line.split(b).length - line.split(a).length)[0];
}

function splitLine(line, delimiter) {
  if (delimiter === "\t") return line.split("\t").map((value) => value.trim());
  const result = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((value) => value.replace(/^"|"$/g, "").trim());
}

function normalizeBillRow(row, source) {
  const date = normalizeDate(pick(row, ["交易时间", "交易创建时间", "付款时间", "时间", "日期"]));
  const rawType = pick(row, ["收/支", "收支", "收支类型", "交易类型", "资金流向", "类型"]);
  const amount = normalizeAmount(pick(row, ["金额(元)", "金额", "交易金额", "收入金额", "支出金额", "人民币金额"]));
  const note = pick(row, ["备注", "说明", "交易备注", "账单备注"]);
  const account = pick(row, ["账户", "支付账户", "资金账户"]);
  const category = pick(row, ["类别", "交易分类", "分类", "账单分类"]) || "";
  const merchant = pick(row, ["交易对方", "商品", "商品说明", "商户", "对方", "交易说明"])
    || (account && account !== "未关联" ? account : "")
    || note
    || category
    || "未知商户";
  const type = normalizeType(rawType || inferTypeFromRow(row));
  const normalizedCategory = category || inferCategory(`${merchant}${note}`, type);
  if (!date || !amount || !type) return null;
  return tx(date, type, amount, normalizedCategory, merchant, note, source);
}

function normalizeHeader(header) {
  return header.replace(/\s/g, "").replace(/"/g, "");
}

function pick(row, keys) {
  for (const key of keys) {
    const normalized = normalizeHeader(key);
    if (row[normalized]) return row[normalized].trim();
  }
  return "";
}

function normalizeDate(value) {
  if (!value) return "";
  const match = String(value).match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function normalizeAmount(value) {
  if (value === undefined || value === null) return 0;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  return Math.abs(Number(cleaned)) || 0;
}

function normalizeType(value) {
  const text = String(value || "");
  if (/收入|入账|收款|退款|\+/.test(text)) return "income";
  if (/支出|付款|消费|还款|转出|-/.test(text)) return "expense";
  return "expense";
}

function inferTypeFromRow(row) {
  const values = Object.values(row).join(" ");
  return /收入|入账|收款|退款|\+/.test(values) ? "income" : "expense";
}

function inferCategory(text, type) {
  if (type === "income") return incomeCategories.find((item) => text.includes(item)) || "其他收入";
  const hit = categoryKeywords.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)));
  return hit ? hit[0] : "其他";
}

function renderPreview() {
  $("#previewCount").textContent = `${importPreview.length} 条`;
  $("#previewTable").innerHTML = importPreview.length
    ? importPreview.slice(0, 80).map((item) => `
      <tr>
        <td>${escapeHtml(item.date)}</td>
        <td><span class="pill ${item.type}">${item.type === "income" ? "收入" : "支出"}</span></td>
        <td>${escapeHtml(item.category)}</td>
        <td>${escapeHtml(item.merchant)}</td>
        <td>${escapeHtml(item.note || "")}</td>
        <td class="amount">${money(item.amount)}</td>
      </tr>
    `).join("")
    : `<tr><td class="empty-state" colspan="6">选择文件后显示预览。</td></tr>`;
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `资产管理-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearData() {
  const ok = confirm("确定清空所有本地数据吗？此操作不可恢复。");
  if (!ok) return;
  state.transactions = [];
  state.assets = [];
  state.debts = [];
  saveState();
  render();
}

function calculateAssetScore(assetTotal, debtTotal) {
  if (!assetTotal && !debtTotal) return 60;
  if (!assetTotal) return 20;
  const debtRatio = debtTotal / assetTotal;
  const score = 100 - debtRatio * 70;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function groupTotals(rows, key) {
  return rows.reduce((totals, item) => {
    const label = item[key] || "其他";
    totals[label] = (totals[label] || 0) + Number(item.amount || 0);
    return totals;
  }, {});
}

function sum(rows) {
  return rows.reduce((total, item) => total + Number(item.amount || 0), 0);
}

function money(value) {
  return formatter.format(Number(value || 0));
}

function compactMoney(value) {
  const number = Number(value || 0);
  const sign = number < 0 ? "-" : "";
  const abs = Math.abs(number);
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(abs >= 100000 ? 1 : 2)}万`;
  return `${sign}${Math.round(abs).toLocaleString("zh-CN")}`;
}

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function transactionKey(item) {
  return [item.date, item.type, item.amount, item.category, item.merchant, item.note || ""].join("|");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
