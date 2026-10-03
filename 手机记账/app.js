const STORAGE_KEY = "mobile-ledger:v1";
const SYNC_URL_KEY = "mobile-ledger:sync-url";
const DELETIONS_KEY = "mobile-ledger:deleted-records:v1";
const SYNC_INTERVAL_MS = 30000;
const APP_VERSION = "20260905-delete-sync";
const SYNC_CHUNK_SIZE = 200;
const SYNC_RECEIVER_PORT = "4175";
const STABLE_SYNC_BASES = [];
const XIANYU_CATEGORY = "副业-咸鱼";
const XIANYU_FEE_RATE = 0.016;

const expenseCategories = [
  ["餐饮", "food"],
  ["购物", "shopping"],
  ["日用", "daily"],
  ["交通", "transport"],
  ["蔬菜", "vegetable"],
  ["水果", "fruit"],
  ["零食", "snack"],
  ["运动", "sport"],
  ["娱乐", "entertainment"],
  ["通讯", "phone"],
  ["服饰", "clothes"],
  ["美容", "other"],
  ["住房", "home"],
  ["居家", "home"],
  ["孩子", "other"],
  ["长辈", "other"],
  ["社交", "other"],
  ["旅行", "transport"],
  ["烟酒", "other"],
  ["数码", "phone"],
  ["汽车", "transport"],
  ["医疗", "other"],
  ["书籍", "daily"],
  ["学习", "daily"],
  ["宠物", "other"],
  ["礼金", "money"],
  ["礼物", "gift"],
  ["办公", "salary"],
  ["维修", "daily"],
  ["捐赠", "gift"],
  ["彩票", "other"],
  ["亲友", "home"],
  ["其他", "other"],
];

const incomeCategories = [
  ["工资", "salary"],
  ["奖金", "money"],
  ["副业-咸鱼", "wallet"],
  ["副业-银行券商开户奖励", "wallet"],
  ["红包", "gift"],
];

const weekday = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const state = loadState();
let syncTimer = null;
let syncInFlight = false;
const chartState = {
  type: "expense",
  range: "week",
  offset: 0,
};
const entry = {
  editingId: null,
  type: "expense",
  category: "餐饮",
  icon: "food",
  expression: "",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.records)) return saved;
  } catch (error) {
    console.warn("读取本地记账失败", error);
  }
  return { records: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `ml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function setHomeLink() {
  const link = $("#homeLink");
  if (!link) return;
  link.href = location.protocol === "file:" ? "../index.html?v=20260905-delete-sync" : "/home.html?v=20260905-delete-sync";
}

function init() {
  const today = todayText();
  state.records = withoutDeleted(state.records);
  $("#monthInput").value = today.slice(0, 7);
  $("#dateInput").value = today;
  $("#syncUrlInput").value = localStorage.getItem(SYNC_URL_KEY) || "";
  setHomeLink();
  bindEvents();
  updateComputerReceiveAddress();
  render();
  registerServiceWorker();
  checkOfflineReady(false);
  migrateLegacyDataIfNeeded();
  pullFromComputer(false).finally(startAutoSync);
}

function bindEvents() {
  $("#monthInput").addEventListener("change", render);
  $("#addRecordBtn").addEventListener("click", openEntry);
  $("#cancelEntryBtn").addEventListener("click", closeEntry);
  $("#saveEntryTopBtn").addEventListener("click", saveEntry);
  $("#quickSaveEntryBtn").addEventListener("click", saveEntry);
  $("#deleteEntryBtn").addEventListener("click", deleteEditingRecord);
  $("#openExportBtn").addEventListener("click", () => openView("settingsView"));
  $("#exportJsonBtn").addEventListener("click", () => exportMonth("json"));
  $("#exportCsvBtn").addEventListener("click", () => exportMonth("csv"));
  $("#clearDataBtn").addEventListener("click", clearData);
  $("#installGuideBtn").addEventListener("click", showInstallGuide);
  $("#syncGuideBtn").addEventListener("click", showSyncGuide);
  $("#offlineCheckBtn").addEventListener("click", () => checkOfflineReady(true));
  $("#syncNowBtn").addEventListener("click", () => fullSyncNow(true));
  $("#syncTestBtn").addEventListener("click", () => testSyncConnection(true));
  $("#copyReceiveAddressBtn").addEventListener("click", copyComputerReceiveAddress);
  $("#syncUrlInput").addEventListener("input", persistSyncUrlInput);
  $("#syncUrlInput").addEventListener("change", saveSyncUrl);
  $("#modalCloseBtn").addEventListener("click", closeModal);
  $("#importFile").addEventListener("change", importJson);
  $("#dateInput").addEventListener("change", updateDateKey);
  $("#chartTypeSelect").addEventListener("change", updateChartType);

  $$(".nav-button").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.view));
  });

  $$(".range-tab").forEach((button) => {
    button.addEventListener("click", () => {
      chartState.range = button.dataset.range;
      chartState.offset = 0;
      $$(".range-tab").forEach((item) => item.classList.toggle("active", item.dataset.range === chartState.range));
      renderChart();
    });
  });

  $$(".type-tab").forEach((button) => {
    button.addEventListener("click", () => {
      entry.type = button.dataset.type;
      entry.category = entry.type === "income" ? "工资" : "餐饮";
      entry.icon = entry.type === "income" ? "salary" : "food";
      renderEntryCategories();
      updateTypeTabs();
    });
  });

  bindKeypad();

  $$(".tool-button").forEach((button) => {
    button.addEventListener("click", () => handleTool(button.dataset.open));
  });

  window.addEventListener("online", () => syncToComputer(false));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncToComputer(false);
  });
}

function render() {
  const month = $("#monthInput").value || todayText().slice(0, 7);
  const [year, monthNumber] = month.split("-");
  $("#yearLabel").textContent = `${year}年`;
  $("#monthLabel").textContent = `${Number(monthNumber)}月`;

  const rows = getMonthRows();
  const income = rows.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = rows.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  $("#incomeTotal").textContent = formatPlain(income);
  $("#expenseTotal").textContent = formatPlain(expense);

  renderDayList(rows);
  renderChart();
}

function renderDayList(rows) {
  if (!rows.length) {
    $("#dayList").innerHTML = `
      <div class="empty-ledger">
        <strong>这个月还没有记录</strong>
        <span>点底部黄色加号开始记第一笔。</span>
      </div>
    `;
    return;
  }

  const groups = rows
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .reduce((result, item) => {
      result[item.date] = result[item.date] || [];
      result[item.date].push(item);
      return result;
    }, {});

  $("#dayList").innerHTML = Object.entries(groups)
    .map(([date, items]) => {
      const totalExpense = items.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
      return `
        <section class="day-group">
          <header class="day-heading">
            <span>${formatDateHeading(date)}</span>
            <strong>支出：${trimAmount(totalExpense)}</strong>
          </header>
          ${items.map(renderRecord).join("")}
        </section>
      `;
    })
    .join("");

  $$("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openEditEntry(button.dataset.edit));
  });
}

function renderRecord(item) {
  const sign = item.type === "income" ? "" : "-";
  return `
    <button class="record-row" type="button" data-edit="${item.id}" aria-label="编辑 ${escapeHtml(item.category)} ${item.amount}">
      <span class="record-icon ${item.type === "income" ? "selected" : ""}">
        <span class="icon ${escapeHtml(item.icon || "other")}" aria-hidden="true"></span>
      </span>
      <span class="record-meta">
        <strong>${escapeHtml(item.category)}</strong>
        <small>${escapeHtml(item.note || "点此可编辑这笔记录")}</small>
      </span>
      <span class="record-amount ${item.type}">${sign}${trimAmount(item.amount)}</span>
    </button>
  `;
}

function updateChartType() {
  chartState.type = $("#chartTypeSelect").value;
  $("#chartTypeLabel").textContent = chartState.type === "income" ? "收入" : "支出";
  renderChart();
}

function renderChart() {
  const period = buildChartPeriod();
  const rows = state.records.filter((item) => item.type === chartState.type && item.date >= period.start && item.date <= period.end);
  const buckets = period.buckets.map((bucket) => ({
    ...bucket,
    total: rows.filter((item) => item.date >= bucket.start && item.date <= bucket.end).reduce((sum, item) => sum + item.amount, 0),
  }));
  const total = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
  const average = buckets.length ? total / buckets.length : 0;
  const label = chartState.type === "income" ? "收入" : "支出";

  renderPeriodTabs();
  $("#chartTotal").textContent = `总${label}：${trimAmount(total)}`;
  $("#chartAverage").textContent = `平均值：${trimAmount(average)}`;
  $("#rankingTitle").textContent = `${label}排行榜`;
  $("#lineChart").innerHTML = renderLineChartSvg(buckets, total);
  renderRanking(rows, total);
}

function renderPeriodTabs() {
  const tabs = getPeriodChoices();
  $("#periodTabs").innerHTML = tabs.map((tab) => `
    <button class="period-tab ${tab.offset === chartState.offset ? "active" : ""}" type="button" data-offset="${tab.offset}">
      ${escapeHtml(tab.label)}
    </button>
  `).join("");
  $$(".period-tab").forEach((button) => {
    button.addEventListener("click", () => {
      chartState.offset = Number(button.dataset.offset);
      renderChart();
    });
  });
}

function getPeriodChoices() {
  if (chartState.range === "week") {
    return [-3, -2, -1, 0].map((offset) => ({ offset, label: offset === 0 ? "本周" : offset === -1 ? "上周" : `${getWeekNumber(addDays(startOfWeek(new Date()), offset * 7))}周` }));
  }
  if (chartState.range === "month") {
    return [-3, -2, -1, 0].map((offset) => {
      const date = addMonths(startOfMonth(new Date()), offset);
      return { offset, label: offset === 0 ? "本月" : offset === -1 ? "上月" : `${date.getMonth() + 1}月` };
    });
  }
  return [-2, -1, 0].map((offset) => {
    const year = new Date().getFullYear() + offset;
    return { offset, label: offset === 0 ? "今年" : `${year}年` };
  });
}

function buildChartPeriod() {
  const now = new Date();
  if (chartState.range === "week") {
    const start = addDays(startOfWeek(now), chartState.offset * 7);
    return {
      start: dateText(start),
      end: dateText(addDays(start, 6)),
      buckets: Array.from({ length: 7 }, (_, index) => {
        const date = addDays(start, index);
        return { label: index === 6 && chartState.offset === 0 ? "今天" : `${date.getMonth() + 1}-${date.getDate()}`, start: dateText(date), end: dateText(date) };
      }),
    };
  }

  if (chartState.range === "month") {
    const start = addMonths(startOfMonth(now), chartState.offset);
    const end = endOfMonth(start);
    const buckets = [];
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 7)) {
      const bucketEnd = new Date(Math.min(addDays(cursor, 6).getTime(), end.getTime()));
      buckets.push({ label: `${cursor.getMonth() + 1}/${cursor.getDate()}`, start: dateText(cursor), end: dateText(bucketEnd) });
    }
    return { start: dateText(start), end: dateText(end), buckets };
  }

  const year = now.getFullYear() + chartState.offset;
  const buckets = Array.from({ length: 12 }, (_, index) => {
    const start = new Date(year, index, 1);
    return { label: `${index + 1}月`, start: dateText(start), end: dateText(endOfMonth(start)) };
  });
  return { start: `${year}-01-01`, end: `${year}-12-31`, buckets };
}

function renderLineChartSvg(buckets, total) {
  const width = 390;
  const height = 220;
  const padX = 16;
  const top = 28;
  const bottom = 42;
  const chartHeight = height - top - bottom;
  const values = buckets.map((bucket) => bucket.total);
  const max = Math.max(...values, 1);
  const avg = buckets.length ? total / buckets.length : 0;
  const points = buckets.map((bucket, index) => {
    const x = buckets.length === 1 ? width / 2 : padX + (index / (buckets.length - 1)) * (width - padX * 2);
    const y = top + chartHeight - (bucket.total / max) * chartHeight;
    return { ...bucket, x, y };
  });
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const avgY = top + chartHeight - (avg / max) * chartHeight;
  const maxLabel = trimAmount(max);
  const circles = points.map((point) => `
    <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5" class="${point.total > 0 ? "filled" : "empty"}"></circle>
  `).join("");
  const labels = points.map((point) => `
    <text x="${point.x.toFixed(1)}" y="${height - 10}" text-anchor="middle">${escapeHtml(point.label)}</text>
  `).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="收支折线图">
      <line x1="${padX}" y1="${top}" x2="${width - padX}" y2="${top}" class="grid-line"></line>
      <line x1="${padX}" y1="${(top + chartHeight).toFixed(1)}" x2="${width - padX}" y2="${(top + chartHeight).toFixed(1)}" class="axis-line"></line>
      <line x1="${padX}" y1="${avgY.toFixed(1)}" x2="${width - padX}" y2="${avgY.toFixed(1)}" class="avg-line"></line>
      <text x="${width - padX}" y="${top - 8}" text-anchor="end" class="max-label">${maxLabel}</text>
      <polyline points="${line}" class="trend-line"></polyline>
      ${circles}
      ${labels}
    </svg>
  `;
}

function renderRanking(rows, total) {
  const totals = rows.reduce((map, item) => {
    const current = map[item.category] || { total: 0, icon: item.icon || iconForCategory(item.category) };
    current.total += item.amount;
    map[item.category] = current;
    return map;
  }, {});
  const entries = Object.entries(totals).sort((a, b) => b[1].total - a[1].total);
  const max = entries[0]?.[1].total || 1;
  $("#categoryChart").innerHTML = entries.length
    ? entries.map(([category, info]) => {
      const ratio = total ? (info.total / total) * 100 : 0;
      return `
        <article class="ranking-row">
          <span class="category-icon"><span class="icon ${escapeHtml(info.icon)}" aria-hidden="true"></span></span>
          <div class="ranking-main">
            <div class="ranking-meta">
              <span><strong>${escapeHtml(category)}</strong> ${ratio.toFixed(1)}%</span>
              <strong>${trimAmount(info.total)}</strong>
            </div>
            <div class="rank-track"><div class="rank-fill" style="width:${Math.max((info.total / max) * 100, 5)}%"></div></div>
          </div>
        </article>
      `;
    }).join("")
    : `<div class="empty-chart"><span class="icon receipt" aria-hidden="true"></span><strong>暂无数据</strong></div>`;
}

function iconForCategory(category) {
  const found = [...expenseCategories, ...incomeCategories].find(([label]) => label === category);
  return found?.[1] || "other";
}

function openEntry() {
  entry.editingId = null;
  entry.type = "expense";
  entry.category = "餐饮";
  entry.icon = "food";
  entry.expression = "";
  $("#dateInput").value = todayText();
  $("#noteInput").value = "";
  $("#amountDisplay").textContent = "0.00";
  $("#deleteEntryBtn").hidden = true;
  $("#saveEntryTopBtn").textContent = "保存";
  updateDateKey();
  updateTypeTabs();
  renderEntryCategories();
  $("#entrySheet").classList.add("open");
  $("#entrySheet").setAttribute("aria-hidden", "false");
}

function openEditEntry(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  entry.editingId = id;
  entry.type = record.type;
  entry.category = record.category;
  entry.icon = record.icon || iconForCategory(record.category);
  entry.expression = trimAmount(record.type === "income" && record.category === XIANYU_CATEGORY && record.grossAmount
    ? record.grossAmount
    : record.amount);
  $("#dateInput").value = record.date || todayText();
  $("#noteInput").value = stripXianyuFeeNote(record.note || "");
  $("#amountDisplay").textContent = entry.expression || "0.00";
  $("#deleteEntryBtn").hidden = false;
  $("#saveEntryTopBtn").textContent = "保存";
  updateDateKey();
  updateTypeTabs();
  renderEntryCategories();
  $("#entrySheet").classList.add("open");
  $("#entrySheet").setAttribute("aria-hidden", "false");
}

function closeEntry() {
  $("#entrySheet").classList.remove("open");
  $("#entrySheet").setAttribute("aria-hidden", "true");
}

function updateTypeTabs() {
  $$(".type-tab").forEach((button) => button.classList.toggle("active", button.dataset.type === entry.type));
}

function renderEntryCategories() {
  const categories = entry.type === "income" ? incomeCategories : expenseCategories;
  $("#categoryGrid").classList.toggle("income-grid", entry.type === "income");
  $("#categoryGrid").innerHTML = categories.map(([label, icon]) => `
    <button class="category-button ${label === entry.category ? "active" : ""}" type="button" data-category="${label}" data-icon="${icon}">
      <span class="category-icon"><span class="icon ${icon}" aria-hidden="true"></span></span>
      <span>${label}</span>
    </button>
  `).join("");

  $$(".category-button").forEach((button) => {
    button.addEventListener("click", () => {
      entry.category = button.dataset.category;
      entry.icon = button.dataset.icon;
      renderEntryCategories();
    });
  });
}

function bindKeypad() {
  const keypad = $(".keypad");
  keypad.addEventListener("click", (event) => {
    const key = event.target.closest("button")?.dataset.key;
    if (!key || key === "date") return;
    event.preventDefault();
    handleKey(key);
  });
}

function handleKey(key) {
  if (key === "done") {
    saveEntry();
    return;
  }
  if (key === "back") {
    entry.expression = entry.expression.slice(0, -1);
  } else if (key === "." && currentNumber().includes(".")) {
    return;
  } else if ((key === "+" || key === "-") && (!entry.expression || /[+-]$/.test(entry.expression))) {
    return;
  } else if (/^\d$/.test(key) || key === "." || key === "+" || key === "-") {
    entry.expression += key;
  }
  $("#amountDisplay").textContent = entry.expression || "0.00";
}

function currentNumber() {
  return entry.expression.split(/[+-]/).pop() || "";
}

function saveEntry() {
  try {
    const enteredAmount = evaluateAmount(entry.expression);
    if (!enteredAmount) {
      showModal("还没填金额", "先输入金额，再点完成。");
      return;
    }
    const xianyuCalculation = entry.type === "income" && entry.category === XIANYU_CATEGORY
      ? calculateXianyuIncome(enteredAmount)
      : null;
    const userNote = stripXianyuFeeNote($("#noteInput").value.trim());
    const payload = {
      date: $("#dateInput").value || todayText(),
      type: entry.type,
      amount: xianyuCalculation?.result ?? enteredAmount,
      category: entry.category,
      icon: entry.icon,
      note: xianyuCalculation ? appendXianyuFeeNote(userNote, xianyuCalculation) : userNote,
      ...(xianyuCalculation ? {
        grossAmount: xianyuCalculation.gross,
        feeAmount: xianyuCalculation.fee,
        feeRate: XIANYU_FEE_RATE,
        calculation: xianyuCalculation.expression,
      } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (entry.editingId) {
      const record = state.records.find((item) => item.id === entry.editingId);
      if (record) {
        Object.assign(record, payload);
        if (!xianyuCalculation) {
          delete record.grossAmount;
          delete record.feeAmount;
          delete record.feeRate;
          delete record.calculation;
        }
      }
    } else {
      state.records.push({
        id: createId(),
        ...payload,
        createdAt: new Date().toISOString(),
      });
    }
    saveState();
    closeEntry();
    $("#monthInput").value = ($("#dateInput").value || todayText()).slice(0, 7);
    render();
    syncToComputer(false);
  } catch (error) {
    showModal("保存失败", `保存时出错：${error.message || error}`);
  }
}

function evaluateAmount(expression) {
  const clean = String(expression || "").replace(/[^\d.+-]/g, "");
  if (!clean || /[+-]$/.test(clean)) return 0;
  const parts = clean.match(/[+-]?[^+-]+/g) || [];
  const total = parts.reduce((sum, part) => sum + Number(part || 0), 0);
  return Math.round(Math.abs(total) * 100) / 100;
}

function calculateXianyuIncome(grossAmount) {
  const gross = roundMoney(grossAmount);
  const fee = roundMoney(gross * XIANYU_FEE_RATE);
  const result = roundMoney(gross - fee);
  return {
    gross,
    fee,
    result,
    expression: `¥${gross.toFixed(2)} - ¥${fee.toFixed(2)}（1.6%手续费） = ¥${result.toFixed(2)}`,
  };
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function stripXianyuFeeNote(note) {
  return String(note || "").replace(/(?:；\s*)?闲鱼成交 ¥[\d,.]+，自动扣除1\.6%手续费 ¥[\d,.]+\s*$/, "").trim();
}

function appendXianyuFeeNote(note, calculation) {
  const feeNote = `闲鱼成交 ¥${calculation.gross.toFixed(2)}，自动扣除1.6%手续费 ¥${calculation.fee.toFixed(2)}`;
  return note ? `${note}；${feeNote}` : feeNote;
}

function deleteEditingRecord() {
  if (!entry.editingId) return;
  const item = state.records.find((record) => record.id === entry.editingId);
  if (!item) return;
  const ok = confirm(`删除这笔${item.category} ${trimAmount(item.amount)}？`);
  if (!ok) return;
  markRecordDeleted(entry.editingId);
  state.records = state.records.filter((record) => record.id !== entry.editingId);
  saveState();
  closeEntry();
  render();
  syncToComputer(false);
}

function getMonthRows() {
  const month = $("#monthInput").value || todayText().slice(0, 7);
  return state.records.filter((item) => item.date?.startsWith(month));
}

function handleTool(name) {
  if (name === "export") {
    openView("settingsView");
    return;
  }
  if (name === "ledger") {
    openView("ledgerView");
    return;
  }
  if (name === "budget") {
    showModal("预算", "当前版本先保留月度统计和导出，预算入口已经预留。后续可以按分类设置每月预算。");
    return;
  }
  if (name === "assets") {
    showModal("资产管家", "日常记账数据导入“财务管理”后，可以在那边继续做资产、还款和现金流分析。");
    return;
  }
  showModal("更多", "这里可以导出、恢复数据，也可以按 Safari 的分享按钮添加到苹果手机桌面。");
}

function openView(id) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === id));
  if (id === "settingsView") {
    $$(".nav-button").forEach((button) => {
      if (button.textContent.trim() === "我的") button.classList.add("active");
    });
  }
}

function exportMonth(format) {
  const month = $("#monthInput").value || todayText().slice(0, 7);
  const rows = getMonthRows();
  if (!rows.length) {
    showModal("没有可导出的数据", "这个月份还没有记账记录。");
    return;
  }

  if (format === "csv") {
    const csv = toCsv(rows);
    download(`手机记账-${month}.csv`, csv, "text/csv;charset=utf-8");
    return;
  }

  const payload = {
    app: "手机记账",
    schema: "personal-asset-manager-compatible",
    month,
    exportedAt: new Date().toISOString(),
    transactions: rows.map((item) => ({
      date: item.date,
      type: item.type === "income" ? "收入" : "支出",
      direction: item.type === "income" ? "收入" : "支出",
      amount: item.amount,
      category: mapCategoryForFinance(item),
      merchant: item.note || item.category,
      note: item.note,
      source: "手机记账",
    })),
    records: rows,
  };
  download(`手机记账-${month}-导入财务管理.json`, JSON.stringify(payload, null, 2), "application/json");
}

function toCsv(rows) {
  const header = ["日期", "类型", "分类", "金额", "备注"];
  const body = rows.map((item) => [
    item.date,
    item.type === "income" ? "收入" : "支出",
    item.category,
    item.amount,
    item.note || "",
  ]);
  return [header, ...body].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function mapCategoryForFinance(item) {
  if (item.type === "income") {
    if (["工资", "奖金", "副业-咸鱼", "副业-银行券商开户奖励", "红包"].includes(item.category)) return item.category;
    return "其他收入";
  }
  const map = {
    蔬菜: "餐饮",
    水果: "餐饮",
    零食: "餐饮",
    日用: "购物",
    服饰: "购物",
    住房: "居住",
    居家: "居住",
    学习: "教育",
    书籍: "教育",
    长辈: "人情",
    礼金: "人情",
    礼物: "人情",
    亲友: "人情",
  };
  return map[item.category] || (["餐饮", "交通", "购物", "娱乐", "医疗", "旅行"].includes(item.category) ? item.category : "其他");
}

function download(filename, text, type) {
  const blob = new Blob(["\uFEFF", text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const rows = Array.isArray(data.records) ? data.records : [];
    const existing = new Set(state.records.map((item) => item.id));
    const incoming = rows.filter((item) => item.date && item.amount && !existing.has(item.id)).map((item) => ({
      id: item.id || createId(),
      date: item.date,
      type: item.type === "income" ? "income" : "expense",
      amount: Number(item.amount),
      category: item.category || "其他",
      icon: item.icon || "other",
      note: item.note || "",
      createdAt: item.createdAt || new Date().toISOString(),
    }));
    state.records.push(...incoming);
    saveState();
    render();
    syncToComputer(false);
    showModal("恢复完成", `新增 ${incoming.length} 条记录。`);
  } catch {
    showModal("恢复失败", "没有读取到可恢复的手机记账 JSON。");
  } finally {
    event.target.value = "";
  }
}

function clearData() {
  const ok = confirm("确定清空这台手机里的全部记账数据吗？");
  if (!ok) return;
  state.records = [];
  saveState();
  render();
  syncToComputer(false);
}

function showInstallGuide() {
  showModal("添加到苹果手机桌面", "1. 先在电脑上运行“HTTPS 同步接收器”。\n2. 第一次使用时，先用手机安装证书地址安装并完全信任证书。\n3. 用 Safari 打开 https 最新版地址。\n4. 等待几秒后到“我的”里点“离线可用”的检查。\n5. 如果显示已缓存，再点 Safari 分享按钮。\n6. 选择“添加到主屏幕”。");
}

function showSyncGuide() {
  showModal("离线和自动同步", "离线使用：只有“离线可用”显示已缓存时，离开电脑 Wi-Fi 后才能从手机桌面打开并继续记账。\n\n自动同步：电脑需要运行“同步接收器”。手机回到同一 Wi-Fi 后，只要打开这个记账网页，它会自动把本地记录上传到电脑。\n\n注意：iPhone 网页不能在完全后台长期运行，所以同步会在打开网页、回到前台、网络恢复或点“立即同步”时触发。");
}

function showModal(title, body) {
  $("#modalTitle").textContent = title;
  $("#modalBody").textContent = body;
  $("#modal").classList.add("open");
  $("#modal").setAttribute("aria-hidden", "false");
}

function closeModal() {
  $("#modal").classList.remove("open");
  $("#modal").setAttribute("aria-hidden", "true");
}

function updateDateKey() {
  const date = $("#dateInput").value;
  $(".date-key span").textContent = date === todayText() ? "今天" : `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function formatDateHeading(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return `${dateText.slice(5, 7)}月${dateText.slice(8, 10)}日  ${weekday[date.getDay()]}`;
}

function todayText() {
  const date = new Date();
  return dateText(date);
}

function dateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getWeekNumber(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date - start) / 86400000);
  return Math.ceil((days + start.getDay() + 1) / 7);
}

function formatPlain(value) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, "");
}

function trimAmount(value) {
  return Number(value || 0).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    updateOfflineStatus("这个打开方式不支持离线缓存");
    return;
  }
  navigator.serviceWorker
    .register("./sw.js?v=20260905-delete-sync")
    .then((registration) => registration.update().catch(() => {}).then(() => checkOfflineReady(false)))
    .catch(() => updateOfflineStatus("当前浏览器没有启用离线缓存"));
}

async function checkOfflineReady(manual) {
  if (!("serviceWorker" in navigator) || !("caches" in window)) {
    updateOfflineStatus("这个打开方式不支持离线缓存");
    if (manual) showModal("离线缓存不可用", "请确认当前地址是 https:// 开头，并且 iPhone 已经安装并完全信任“手机记账本地根证书”。普通 http:// 局域网页面不能稳定离线使用。");
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.update().catch(() => {});
    const keys = await caches.keys();
    const appCache = keys.find((key) => key.startsWith("mobile-ledger-v"));
    const cachedIndex = await caches.match("./index.html", { ignoreSearch: true });
    const controlled = Boolean(navigator.serviceWorker.controller);
    const ready = Boolean(appCache && cachedIndex && controlled);
    updateOfflineStatus(ready ? "已缓存，可离线打开" : "未完全接管，请保持本页打开几秒后刷新一次");
    if (manual) {
      showModal(ready ? "离线缓存已准备好" : "离线缓存还没准备好", ready ? "现在先不要用旧桌面图标。请用当前 HTTPS 页面重新添加到主屏幕，再断开 Wi-Fi 测试。记录会先保存在手机本地，回到同一 Wi-Fi 后再同步。" : "请确认当前地址是 https:// 开头；然后保持手机和电脑在同一 Wi-Fi，等待几秒，刷新本页一次，再重新点检查。");
    }
  } catch {
    updateOfflineStatus("无法读取离线缓存状态");
  }
}

function updateOfflineStatus(text) {
  const target = $("#offlineStatus");
  if (target) target.textContent = text;
}

function migrateLegacyDataIfNeeded() {
  if (location.protocol !== "file:") return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw || raw === "null" || raw === "undefined") return;
  fetch("http://localhost:4176/api/migration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "file-mobile-ledger",
      page: location.href,
      rawData: {
        [STORAGE_KEY]: raw,
        [SYNC_URL_KEY]: localStorage.getItem(SYNC_URL_KEY) || "",
      },
    }),
  }).catch(() => {});
}

function saveSyncUrl() {
  const value = persistSyncUrlInput();
  if (value) {
    $("#syncUrlInput").value = value;
  } else {
    localStorage.removeItem(SYNC_URL_KEY);
  }
  testSyncConnection(true).then((ok) => {
    if (ok) syncToComputer(true);
  });
}

function persistSyncUrlInput() {
  const input = $("#syncUrlInput");
  const value = normalizeSyncBaseUrl(input?.value || "");
  if (value) localStorage.setItem(SYNC_URL_KEY, value);
  return value;
}

function startAutoSync() {
  updateSyncStatus("等待同步");
  fullSyncNow(false);
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => fullSyncNow(false), SYNC_INTERVAL_MS);
}

async function fullSyncNow(manual) {
  await pullFromComputer(false);
  if (!state.records.length) {
    updateSyncStatus("暂无记录可同步");
    if (manual) showModal("还没有记录", "这台手机和电脑接收器里都没有可读取的记账记录。");
    return;
  }
  if (["127.0.0.1", "localhost"].includes(location.hostname)) {
    updateSyncStatus(`电脑已读取 ${state.records.length} 条`);
    if (manual) showModal("读取完成", `电脑已从同步接收器读取 ${state.records.length} 条记录。`);
    return;
  }
  await syncToComputer(manual);
}

async function pullFromComputer(manual) {
  let baseUrl = getSyncBaseUrl();
  if (!syncBaseCandidates(baseUrl).length) return;
  try {
    const connection = await findReachableSyncBase(baseUrl);
    baseUrl = connection.baseUrl;
    rememberSyncBase(baseUrl);
    const response = await fetch(`${baseUrl}/api/records`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    mergeDeletionMarkers(result.deletions);
    const recordsBeforeDeletion = state.records.length;
    state.records = withoutDeleted(state.records);
    const deletionChanged = state.records.length !== recordsBeforeDeletion;
    const incoming = withoutDeleted(Array.isArray(result.records) ? result.records : []);
    if (applyRemoteReset(result.resetAt)) {
      saveState();
      render();
      if (!incoming.length) {
        updateSyncStatus("已清空，从零开始");
        if (manual) showModal("已清空", "电脑端已经清空手机记账测试数据，这台手机也已从零开始。");
        return;
      }
    }
    const changed = mergeIncomingRecords(incoming);
    if (changed || deletionChanged) {
      saveState();
      render();
    }
    if (incoming.length) {
      updateSyncStatus(`已读取电脑 ${incoming.length} 条`);
    }
    if (manual && incoming.length) showModal("读取完成", `已从电脑同步接收器读取 ${incoming.length} 条记录。`);
  } catch (error) {
    if (manual) showModal("读取失败", `当前页面没有连上电脑同步接收器。\n\n地址：${baseUrl}\n错误：${error.message || error}`);
  }
}

function applyRemoteReset(resetAt) {
  if (!resetAt) return false;
  const resetKey = "mobile-ledger:records-reset-at";
  const lastResetAt = localStorage.getItem(resetKey) || "";
  const keptRecords = state.records.filter((record) => {
    const marker = record.updatedAt || record.createdAt || "";
    return marker > resetAt;
  });
  if (lastResetAt >= resetAt && keptRecords.length === state.records.length) return false;
  state.records = keptRecords;
  state.lastSyncAt = "";
  localStorage.setItem(resetKey, resetAt);
  return true;
}

function mergeIncomingRecords(incoming) {
  let changed = false;
  const byId = new Map(state.records.map((record) => [record.id, record]));
  incoming.forEach((item) => {
    if (!item?.date || !(Number(item.amount) > 0)) return;
    const normalized = {
      id: item.id || createId(),
      date: item.date,
      type: item.type === "income" ? "income" : "expense",
      amount: Number(item.amount),
      category: item.category || "其他",
      icon: item.icon || "other",
      note: item.note || "",
      createdAt: item.createdAt || item.updatedAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    };
    const current = byId.get(normalized.id);
    if (!current) {
      state.records.push(normalized);
      byId.set(normalized.id, normalized);
      changed = true;
      return;
    }
    const currentTime = new Date(current.updatedAt || current.createdAt || 0).getTime();
    const incomingTime = new Date(normalized.updatedAt || normalized.createdAt || 0).getTime();
    if (incomingTime > currentTime) {
      Object.assign(current, normalized);
      changed = true;
    }
  });
  return changed;
}

function loadDeletions() {
  try {
    const saved = JSON.parse(localStorage.getItem(DELETIONS_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((item) => item?.id) : [];
  } catch (_) {
    return [];
  }
}

function saveDeletions(deletions) {
  localStorage.setItem(DELETIONS_KEY, JSON.stringify(deletions));
}

function mergeDeletionMarkers(incoming = []) {
  const byId = new Map(loadDeletions().map((item) => [item.id, item]));
  (Array.isArray(incoming) ? incoming : []).forEach((item) => {
    if (!item?.id) return;
    const current = byId.get(item.id);
    if (!current || String(item.deletedAt || "") > String(current.deletedAt || "")) byId.set(item.id, item);
  });
  saveDeletions([...byId.values()]);
}

function markRecordDeleted(id) {
  mergeDeletionMarkers([{ id, deletedAt: new Date().toISOString() }]);
}

function withoutDeleted(records) {
  const deletedIds = new Set(loadDeletions().map((item) => item.id));
  return (Array.isArray(records) ? records : []).filter((item) => !deletedIds.has(item?.id));
}

async function syncToComputer(manual) {
  if (syncInFlight) return;
  state.records = withoutDeleted(state.records);
  if (!state.records.length && !loadDeletions().length) {
    updateSyncStatus("暂无记录可同步");
    return;
  }
  let baseUrl = getSyncBaseUrl();
  if (!syncBaseCandidates(baseUrl).length) {
    updateSyncStatus("请用电脑同步地址打开，或填写电脑接收地址");
    if (manual) showModal("还不能同步", "请先在电脑上运行同步接收器，然后用 Safari 打开电脑给出的手机访问地址。也可以在这里填写电脑接收地址。");
    return;
  }

  syncInFlight = true;
  updateSyncStatus("正在同步...");
  try {
    const connection = await findReachableSyncBase(baseUrl);
    baseUrl = connection.baseUrl;
    rememberSyncBase(baseUrl);
    const result = await uploadRecordsInChunks(baseUrl);
    const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    state.lastSyncAt = new Date().toISOString();
    saveState();
    updateSyncStatus(`已同步 ${result.totalRecords || state.records.length} 条，${time}`);
    if (manual) showModal("同步完成", "电脑已经收到当前手机里的记账数据，并保存为可导入财务管理的 JSON 文件。");
  } catch (error) {
    updateSyncStatus("未连接到电脑，稍后会自动重试");
    if (manual) showModal("同步失败", `同步没有完成。\n\n实际同步地址：${baseUrl}\n本机记录数：${state.records.length}\n错误：${error.message || error}\n\n如果 /api/status 能打开但这里失败，请把这段错误发给电脑端排查。`);
  } finally {
    syncInFlight = false;
  }
}

async function uploadRecordsInChunks(baseUrl) {
  const records = state.records.slice();
  const totalChunks = Math.max(1, Math.ceil(records.length / SYNC_CHUNK_SIZE));
  const syncId = `${APP_VERSION}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let lastResult = null;
  for (let index = 0; index < totalChunks; index += 1) {
    const chunk = records.slice(index * SYNC_CHUNK_SIZE, (index + 1) * SYNC_CHUNK_SIZE);
    updateSyncStatus(`正在同步 ${index + 1}/${totalChunks}...`);
    const payload = buildSyncPayload(chunk, {
      syncId,
      chunkIndex: index,
      totalChunks,
      totalRecords: records.length,
      fullSync: true,
    });
    const response = await fetchWithRetry(`${baseUrl}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, `第 ${index + 1}/${totalChunks} 块`);
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`第 ${index + 1}/${totalChunks} 块同步失败 HTTP ${response.status}${errorText ? `：${errorText.slice(0, 180)}` : ""}`);
    }
    lastResult = await response.json();
    if (!lastResult.ok) throw new Error(lastResult.error || `第 ${index + 1}/${totalChunks} 块返回失败`);
  }
  if (lastResult?.pending) throw new Error("电脑还没有收齐所有同步分块，请重新点一次立即同步");
  return lastResult || { ok: true, totalRecords: records.length };
}

async function fetchWithRetry(url, options, label) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await delay(500);
    }
  }
  throw new Error(`${label}同步请求发送失败：${lastError?.message || lastError}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSyncBaseUrl() {
  if (["http:", "https:"].includes(location.protocol) && ["127.0.0.1", "localhost"].includes(location.hostname)) {
    return normalizeSyncBaseUrl(location.origin);
  }
  const typed = normalizeSyncBaseUrl($("#syncUrlInput")?.value || "");
  if (typed) {
    localStorage.setItem(SYNC_URL_KEY, typed);
    return typed;
  }
  const saved = normalizeSyncBaseUrl(localStorage.getItem(SYNC_URL_KEY) || "");
  if (saved) return saved;
  const current = getCurrentRemoteOrigin();
  if (current) return current;
  if (location.protocol === "http:" || location.protocol === "https:") return normalizeSyncBaseUrl(location.origin);
  return "";
}

function getCurrentRemoteOrigin() {
  if (!["http:", "https:"].includes(location.protocol)) return "";
  const host = location.hostname;
  if (!host || host === "127.0.0.1" || host === "localhost") return "";
  return normalizeSyncBaseUrl(location.origin);
}

function normalizeSyncBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function syncBaseCandidates(preferred = "") {
  const input = $("#syncUrlInput")?.value || "";
  const saved = localStorage.getItem(SYNC_URL_KEY) || "";
  const current = getCurrentRemoteOrigin();
  return [...new Set([preferred, input, saved, current, ...STABLE_SYNC_BASES]
    .map(normalizeSyncBaseUrl)
    .filter(Boolean))];
}

function rememberSyncBase(baseUrl) {
  const normalized = normalizeSyncBaseUrl(baseUrl);
  if (!normalized) return;
  localStorage.setItem(SYNC_URL_KEY, normalized);
  const input = $("#syncUrlInput");
  if (input) input.value = normalized;
}

async function probeSyncBase(baseUrl) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`${baseUrl}/api/status`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "接收器未返回 ok");
    return result;
  } finally {
    window.clearTimeout(timer);
  }
}

async function findReachableSyncBase(preferred = "") {
  const candidates = syncBaseCandidates(preferred);
  let lastError = null;
  for (const baseUrl of candidates) {
    try {
      const status = await probeSyncBase(baseUrl);
      return { baseUrl, status };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`电脑接收器不可达（已尝试 ${candidates.join("、")}）：${lastError?.message || "连接失败"}`);
}

function buildReceiveAddressFromLocation() {
  if (!["http:", "https:"].includes(location.protocol)) return "";
  const host = location.hostname;
  if (!host || host === "127.0.0.1" || host === "localhost") return "";
  return `https://${host}:${SYNC_RECEIVER_PORT}`;
}

async function updateComputerReceiveAddress() {
  const target = $("#computerReceiveAddress");
  if (!target) return;
  let address = buildReceiveAddressFromLocation();
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (response.ok) {
      const status = await response.json();
      if (status.recommendedUrl) address = status.recommendedUrl;
      else if (Array.isArray(status.localUrls) && status.localUrls.length) address = status.localUrls[0];
    }
  } catch (error) {
    console.warn("读取电脑接收地址失败", error);
  }
  target.textContent = address || "请在电脑上启动同步接收器";
  target.dataset.address = address || "";
}

async function copyComputerReceiveAddress() {
  const target = $("#computerReceiveAddress");
  const address = target?.dataset.address || target?.textContent || "";
  if (!address || !address.startsWith("http")) {
    showModal("还没有地址", "请先在电脑上启动手机记账同步接收器。");
    return;
  }
  try {
    await navigator.clipboard.writeText(address);
    updateSyncStatus("已复制电脑接收地址");
    showModal("已复制", `请在手机上填写这个电脑接收地址：\n\n${address}`);
  } catch {
    showModal("电脑接收地址", `请在手机上填写：\n\n${address}`);
  }
}

async function testSyncConnection(manual) {
  let baseUrl = getSyncBaseUrl();
  if (!syncBaseCandidates(baseUrl).length) {
    updateSyncStatus("请填写电脑接收地址");
    if (manual) showModal("测试失败", "没有可用的电脑接收地址。请填 https://电脑Wi-Fi地址:4175，或直接用电脑给出的手机地址打开。");
    return false;
  }
  updateSyncStatus("正在测试连接...");
  try {
    const connection = await findReachableSyncBase(baseUrl);
    baseUrl = connection.baseUrl;
    rememberSyncBase(baseUrl);
    updateSyncStatus(`连接正常：${baseUrl}`);
    if (manual) showModal("连接正常", `手机已经连上电脑同步接收器。\n\n地址：${baseUrl}\n版本：${APP_VERSION}`);
    return true;
  } catch (error) {
    updateSyncStatus("电脑连接失败");
    if (manual) showModal("测试失败", `手机没有连上电脑同步接收器。\n\n地址：${baseUrl}\n错误：${error.message || error}`);
    return false;
  }
}

function buildSyncPayload(records = state.records, chunk = null) {
  const months = [...new Set(records.map((record) => record.date.slice(0, 7)))].sort();
  return {
    app: "手机记账",
    schema: "mobile-ledger-sync",
    appVersion: APP_VERSION,
    syncedAt: new Date().toISOString(),
    chunk,
    months,
    records,
    deletions: loadDeletions(),
    financeImports: months.map((month) => ({
      month,
      transactions: records.filter((record) => record.date.startsWith(month)).map((item) => ({
        date: item.date,
        type: item.type === "income" ? "收入" : "支出",
        direction: item.type === "income" ? "收入" : "支出",
        amount: item.amount,
        category: mapCategoryForFinance(item),
        merchant: item.note || item.category,
        note: item.note,
        source: "手机记账自动同步",
      })),
    })),
  };
}

function updateSyncStatus(text) {
  const target = $("#syncStatus");
  if (target) target.textContent = text;
}

if (new URLSearchParams(location.search).has("selftest")) {
  const calculation = calculateXianyuIncome(300);
  document.documentElement.dataset.mobileLedgerSelfTest = JSON.stringify({
    categories: incomeCategories.map(([name]) => name),
    gross: calculation.gross,
    fee: calculation.fee,
    result: calculation.result,
    passed: calculation.gross === 300 && calculation.fee === 4.8 && calculation.result === 295.2,
  });
}

init();
