const STORAGE_KEY = "personal-asset-manager:v1";
const MOBILE_LEDGER_KEY = "mobile-ledger:v1";

// 图表配色
const chartColors = [
  "#e74c3c", "#9b59b6", "#3498db", "#1abc9c",
  "#f39c12", "#e91e63", "#00bcd4", "#8bc34a",
  "#ff5722", "#3f51b5", "#009688", "#795548"
];

let pieChart = null;
let trendChart = null;

const $ = (selector) => document.querySelector(selector);
const moneyFormatter = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" });

let periodMode = "week";
let transactions = [];
let analysisText = "";
let detailState = { month: new Date().toISOString().slice(0, 7), type: "all" };

function init() {
  $("#periodInput").value = new Date().toISOString().slice(0, 10);

  // 周期切换
  document.querySelectorAll(".segment-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      periodMode = btn.dataset.period;
      document.querySelectorAll(".segment-btn").forEach((item) => item.classList.toggle("active", item === btn));
      render();
    });
  });

  $("#periodInput").addEventListener("change", render);
  $("#detailMonthInput").value = detailState.month;
  $("#detailMonthInput").addEventListener("change", (event) => {
    if (!/^\d{4}-\d{2}$/.test(event.target.value)) return;
    detailState.month = event.target.value;
    renderTable();
  });
  $("#detailPrevMonth").addEventListener("click", () => shiftDetailMonth(-1));
  $("#detailNextMonth").addEventListener("click", () => shiftDetailMonth(1));
  document.querySelectorAll("[data-transaction-type]").forEach((button) => {
    button.addEventListener("click", () => {
      detailState.type = button.dataset.transactionType;
      renderTable();
    });
  });
  $("#syncBtn").addEventListener("click", () => syncExternalData({ manual: true }));
  $("#analysisBtn").addEventListener("click", generateAnalysisPayload);
  $("#sendAnalysisBtn").addEventListener("click", sendAnalysisToWorkspace);
  $("#copyAnalysisBtn").addEventListener("click", copyAnalysisPayload);

  loadTransactions();
  render();
  syncExternalData({ manual: false });
  window.setInterval(() => syncExternalData({ manual: false }), 30000);
  window.addEventListener("focus", () => syncExternalData({ manual: false }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncExternalData({ manual: false });
  });
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed && Array.isArray(parsed.transactions)) return parsed;
  } catch (error) {
    console.warn("读取财务管理数据失败", error);
  }
  return { transactions: [], assets: [], debts: [] };
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadTransactions() {
  transactions = loadState().transactions || [];
}

async function syncExternalData({ manual }) {
  const rows = [];
  const fileRows = await readMobileLedgerFiles();
  if (fileRows.length) rows.push(...fileRows);
  const localRows = readMobileLedgerLocal();
  if (localRows.length) rows.push(...localRows);

  if (!rows.length) {
    if (manual) alert("没有读取到手机记账同步数据。");
    return;
  }

  const state = loadState();
  const normalized = uniqueTransactions(rows.map(normalizeRecord).filter(Boolean));
  state.transactions = [
    ...(state.transactions || []).filter((item) =>
      item.source !== "手机记账自动同步" &&
      item.source !== "手机记账" &&
      item.source !== "鲨鱼记账"
    ),
    ...normalized,
  ];
  saveState(state);
  loadTransactions();
  render();
  if (manual) alert(`已同步 ${normalized.length} 条流水。`);
}

async function readMobileLedgerFiles() {
  const rows = [];
  const month = ($("#periodInput").value || new Date().toISOString().slice(0, 10)).slice(0, 7);
  const urls = [
    "../财务管理/手机记账同步/手机记账-全部同步.json",
    `../财务管理/手机记账同步/手机记账-${month}-导入财务管理.json`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) continue;
      const data = await response.json();
      if (Array.isArray(data.records) && data.records.length) {
        rows.push(...data.records);
      } else if (Array.isArray(data.transactions)) {
        rows.push(...data.transactions);
      }
    } catch (error) {
      console.warn("读取同步文件失败", url, error);
    }
  }
  return rows;
}

function readMobileLedgerLocal() {
  try {
    const data = JSON.parse(localStorage.getItem(MOBILE_LEDGER_KEY) || "null");
    if (data && Array.isArray(data.records)) return data.records;
  } catch (error) {
    console.warn("读取手机记账本地数据失败", error);
  }
  return [];
}

function normalizeRecord(item) {
  const date = normalizeDate(item.date || item.time || item.transactionTime);
  const type = item.type === "income" || item.type === "收入" || item.direction === "收入" ? "income" : "expense";
  const amount = normalizeAmount(item.amount || item.money || item.value);
  if (!date || !amount) return null;
  const category = item.category || item.类别 || (type === "income" ? "其他收入" : "其他");
  const merchant = item.merchant || item.account || item.账户 || item.name || item.note || category;
  return {
    id: item.id || transactionKey({ date, type, amount, category, merchant, note: item.note || "" }),
    date,
    type,
    amount,
    category,
    merchant,
    note: item.note || "",
    source: item.source || "手机记账自动同步",
  };
}

function render() {
  loadTransactions();
  const range = getSelectedRange();
  const current = rowsInRange(transactions, range);
  const previous = rowsInRange(transactions, getPreviousRange(range));
  const yearAgo = rowsInRange(transactions, getYearAgoRange(range));
  const summary = summarize(current);
  const previousSummary = summarize(previous);
  const yearAgoSummary = summarize(yearAgo);

  // 更新标题和日期范围
  $("#periodTitle").textContent = `${periodLabel()}流水分析`;
  // 顶部不需要显示日期范围，但为了保持功能完整性保留

  // 更新指标卡片
  $("#incomeTotal").textContent = money(summary.income);
  $("#incomeCount").textContent = `${summary.incomeCount} 笔`;
  $("#expenseTotal").textContent = money(summary.expense);
  $("#expenseCount").textContent = `${summary.expenseCount} 笔`;
  $("#balanceTotal").textContent = money(summary.income - summary.expense);

  // 计算财务健康度
  const healthScore = calculateHealthScore(summary, previousSummary);
  $("#healthScore").textContent = healthScore;

  // 最大支出项
  const categoryEntries = categoryTotals(current.filter((item) => item.type === "expense"));
  const top = categoryEntries[0];
  $("#topExpenseMetric").textContent = top ? top.label : "--";
  $("#topExpenseAmount").textContent = top
    ? `${money(top.value)} · ${percent(top.value / Math.max(summary.expense, 1))}`
    : "暂无";

  // 渲染图表
  renderPieChart(categoryEntries, summary.expense);
  renderTrendChart(current);
  renderRank(categoryEntries, summary.expense);
  renderComparisons(summary, previousSummary, yearAgoSummary, categoryEntries, categoryTotals(previous.filter((item) => item.type === "expense")));
  renderInsights(summary, previousSummary, yearAgoSummary, categoryEntries);
  renderTable();
}

function calculateHealthScore(current, previous) {
  if (!current.expense && !current.income) return "--";

  const savingsRate = current.income > 0 ? (current.income - current.expense) / current.income : 0;
  let score = 50;

  // 储蓄率评分 (0-30分)
  score += Math.min(30, Math.max(0, savingsRate * 100));

  // 环比评分 (0-20分)
  if (previous.expense > 0) {
    const expenseChange = (current.expense - previous.expense) / previous.expense;
    if (expenseChange < 0) score += 20;
    else if (expenseChange < 0.1) score += 10;
  }

  return Math.min(100, Math.round(score));
}

function getSelectedRange() {
  const date = parseLocalDate($("#periodInput").value || new Date().toISOString().slice(0, 10));
  if (periodMode === "year") {
    return { start: `${date.getFullYear()}-01-01`, end: `${date.getFullYear()}-12-31` };
  }
  if (periodMode === "month") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { start: formatDate(start), end: formatDate(end) };
  }
  const day = date.getDay() || 7;
  const start = addDays(date, 1 - day);
  const end = addDays(start, 6);
  return { start: formatDate(start), end: formatDate(end) };
}

function getPreviousRange(range) {
  const start = parseLocalDate(range.start);
  const end = parseLocalDate(range.end);
  const days = Math.round((end - start) / 86400000) + 1;
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, 1 - days);
  return { start: formatDate(previousStart), end: formatDate(previousEnd) };
}

function getYearAgoRange(range) {
  const start = parseLocalDate(range.start);
  const end = parseLocalDate(range.end);
  start.setFullYear(start.getFullYear() - 1);
  end.setFullYear(end.getFullYear() - 1);
  return { start: formatDate(start), end: formatDate(end) };
}

function rowsInRange(rows, range) {
  return rows.filter((item) => item.date >= range.start && item.date <= range.end);
}

function summarize(rows) {
  const incomeRows = rows.filter((item) => item.type === "income");
  const expenseRows = rows.filter((item) => item.type === "expense");
  return {
    income: sum(incomeRows),
    expense: sum(expenseRows),
    incomeCount: incomeRows.length,
    expenseCount: expenseRows.length,
  };
}

function categoryTotals(rows) {
  const totals = rows.reduce((result, item) => {
    const label = item.category || "其他";
    result[label] = (result[label] || 0) + Number(item.amount || 0);
    return result;
  }, {});
  return Object.entries(totals)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// ===== 本地图表渲染 =====
function renderPieChart(entries, total) {
  const canvas = $("#expensePieChart");
  const legendContainer = $("#expenseLegend");
  const centerText = $("#pieCenterText");

  if (!entries.length || !total) {
    $("#pieSummary").textContent = "暂无数据";
    centerText.textContent = "--";
    legendContainer.innerHTML = `<div class="empty-state">本周期还没有支出。</div>`;
    clearCanvas(canvas);
    return;
  }

  const top = entries[0];
  $("#pieSummary").textContent = `${top.label} ${percent(top.value / total)}`;
  centerText.textContent = percent(top.value / total);

  const labels = entries.map((e) => e.label);
  const data = entries.map((e) => e.value);
  const colors = entries.map((_, i) => chartColors[i % chartColors.length]);

  drawDonut(canvas, data, colors);

  // 渲染图例
  legendContainer.innerHTML = entries.slice(0, 8).map((item, index) => `
    <div class="legend-item">
      <span class="legend-color" style="background: ${colors[index]}"></span>
      <span class="legend-label">${escapeHtml(item.label)}</span>
      <span class="legend-value">${money(item.value)}<span class="legend-percent">${percent(item.value / total)}</span></span>
    </div>
  `).join("");
}

function renderTrendChart(currentRows) {
  const canvas = $("#trendChart");

  // 按日期分组统计收入和支出
  const dailyData = {};
  currentRows.forEach((item) => {
    if (!dailyData[item.date]) {
      dailyData[item.date] = { income: 0, expense: 0 };
    }
    dailyData[item.date][item.type] += item.amount;
  });

  const dates = Object.keys(dailyData).sort();

  // 如果没有数据，显示空状态
  if (dates.length === 0) {
    clearCanvas(canvas);
    return;
  }

  const incomeData = dates.map((d) => dailyData[d].income);
  const expenseData = dates.map((d) => dailyData[d].expense);

  // 格式化日期显示
  const labels = dates.map((d) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });

  drawTrendBars(canvas, labels, incomeData, expenseData);
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function clearCanvas(canvas) {
  const { ctx, width, height } = prepareCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
}

function drawDonut(canvas, values, colors) {
  const { ctx, width, height } = prepareCanvas(canvas);
  const total = values.reduce((sumValue, value) => sumValue + value, 0);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.42;
  const innerRadius = radius * 0.62;
  let start = -Math.PI / 2;

  values.forEach((value, index) => {
    const angle = (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.arc(cx, cy, innerRadius, start + angle, start, true);
    ctx.closePath();
    ctx.fillStyle = colors[index];
    ctx.fill();
    start += angle;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius - 1, 0, Math.PI * 2);
  ctx.fillStyle = "#fffdf9";
  ctx.fill();
}

function drawTrendBars(canvas, labels, incomeData, expenseData) {
  const { ctx, width, height } = prepareCanvas(canvas);
  const padding = { top: 28, right: 18, bottom: 36, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...incomeData, ...expenseData, 1);
  const rows = 4;

  ctx.font = "11px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "#eee8dd";
  ctx.fillStyle = "#8b7d9a";

  for (let i = 0; i <= rows; i += 1) {
    const y = padding.top + (plotHeight / rows) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    const value = maxValue * (1 - i / rows);
    ctx.fillText(compactMoney(value), 8, y);
  }

  const groupWidth = plotWidth / labels.length;
  const barWidth = Math.min(16, groupWidth * 0.28);

  labels.forEach((label, index) => {
    const x = padding.left + groupWidth * index + groupWidth / 2;
    drawBar(ctx, x - barWidth - 2, padding.top, plotHeight, barWidth, incomeData[index], maxValue, "#27ae60");
    drawBar(ctx, x + 2, padding.top, plotHeight, barWidth, expenseData[index], maxValue, "#e74c3c");

    if (labels.length <= 12 || index % Math.ceil(labels.length / 12) === 0) {
      ctx.fillStyle = "#8b7d9a";
      ctx.textAlign = "center";
      ctx.fillText(label, x, height - 16);
    }
  });

  ctx.textAlign = "left";
  drawLegendDot(ctx, width - 128, 14, "#27ae60", "收入");
  drawLegendDot(ctx, width - 72, 14, "#e74c3c", "支出");
}

function drawBar(ctx, x, top, plotHeight, width, value, maxValue, color) {
  const height = Math.max(3, (value / maxValue) * plotHeight);
  const y = top + plotHeight - height;
  ctx.fillStyle = color;
  roundRect(ctx, x, y, width, height, 4);
  ctx.fill();
}

function drawLegendDot(ctx, x, y, color, label) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b5b7a";
  ctx.font = "12px PingFang SC, Microsoft YaHei, sans-serif";
  ctx.fillText(label, x + 8, y + 1);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function renderRank(entries, total) {
  $("#rankSummary").textContent = entries.length ? `前 ${Math.min(entries.length, 10)} 项` : "暂无数据";
  $("#expenseRank").innerHTML = entries.length
    ? entries.slice(0, 10).map((item, index) => `
      <div class="rank-item">
        <span class="rank-number">${index + 1}</span>
        <div class="rank-info">
          <div class="rank-name">${escapeHtml(item.label)}</div>
          <div class="rank-percent">占支出 ${percent(item.value / Math.max(total, 1))}</div>
        </div>
        <span class="rank-amount">${money(item.value)}</span>
      </div>
    `).join("")
    : `<div class="empty-state">本周期还没有支出。</div>`;
}

function renderComparisons(current, previous, yearAgo, categoryEntries, previousCategoryEntries) {
  const expenseMoM = diffRatio(current.expense, previous.expense);
  const expenseYoY = diffRatio(current.expense, yearAgo.expense);
  const incomeMoM = diffRatio(current.income, previous.income);
  const top = categoryEntries[0];
  const previousMap = Object.fromEntries(previousCategoryEntries.map((item) => [item.label, item.value]));
  const topChange = top ? diffRatio(top.value, previousMap[top.label] || 0) : null;

  $("#comparisonList").innerHTML = [
    comparisonItem("支出环比", `${money(current.expense)}，较上一周期${formatDiff(expenseMoM)}`, getTrendIcon(expenseMoM, true)),
    comparisonItem("支出同比", `${money(current.expense)}，较去年同期${formatDiff(expenseYoY)}`, getTrendIcon(expenseYoY, true)),
    comparisonItem("收入环比", `${money(current.income)}，较上一周期${formatDiff(incomeMoM)}`, getTrendIcon(incomeMoM, false)),
    top ? comparisonItem(`${top.label}变化`, `${top.label}本期 ${money(top.value)}，较上一周期${formatDiff(topChange)}`, getTrendIcon(topChange, true)) : "",
  ].filter(Boolean).join("");
}

function comparisonItem(title, desc, icon) {
  const level = title.includes("支出") || title.includes("变化") ? "danger" : "success";
  return `
    <div class="insight-item ${level}">
      <span class="insight-icon">${icon}</span>
      <div class="insight-content">
        <div class="insight-title">${escapeHtml(title)}</div>
        <div class="insight-desc">${escapeHtml(desc)}</div>
      </div>
    </div>
  `;
}

function getTrendIcon(value, higherIsBad) {
  if (value === null || !Number.isFinite(value) || Math.abs(value) < 0.005) return "➡️";
  if (higherIsBad) {
    return value > 0 ? "📈" : "📉";
  }
  return value > 0 ? "📈" : "📉";
}

function renderInsights(current, previous, yearAgo, categoryEntries) {
  const insights = [];
  const top = categoryEntries[0];

  if (!current.expense && !current.income) {
    insights.push(insightItem("暂无流水", "当前周期还没有同步到收入或支出。", "info", "ℹ️"));
  } else {
    if (top && top.value / Math.max(current.expense, 1) >= 0.35) {
      insights.push(insightItem("支出集中", `${top.label}占比达到 ${percent(top.value / current.expense)}，建议先检查这个分类是否有一次性大额或高频小额。`, "danger", "⚠️"));
    }

    const expenseMoM = diffRatio(current.expense, previous.expense);
    if (expenseMoM > 0.25) {
      insights.push(insightItem("支出明显变高", `本周期支出较上一周期增加 ${percent(expenseMoM)}，优先复盘排行前 3 的分类。`, "warning", "📊"));
    }

    const incomeMoM = diffRatio(current.income, previous.income);
    if (incomeMoM < -0.2) {
      insights.push(insightItem("收入偏低", `本周期收入较上一周期减少 ${percent(Math.abs(incomeMoM))}，需要确认工资、兼职、投资收益是否延迟入账。`, "warning", "💰"));
    }

    if (current.income - current.expense < 0) {
      insights.push(insightItem("结余为负", `本周期缺口 ${money(Math.abs(current.income - current.expense))}，建议先压缩非必要消费，并核对是否有一次性支出。`, "danger", "🚨"));
    }

    if (!insights.length) {
      insights.push(insightItem("状态平稳", "本周期没有发现明显异常，继续保持分类记账。", "success", "✅"));
    }
  }

  $("#insightList").innerHTML = insights.join("");
  $("#insightSummary").textContent = `${insights.length} 条建议`;
}

function insightItem(title, body, level, icon) {
  return `
    <div class="insight-item ${level}">
      <span class="insight-icon">${icon}</span>
      <div class="insight-content">
        <div class="insight-title">${escapeHtml(title)}</div>
        <div class="insight-desc">${escapeHtml(body)}</div>
      </div>
    </div>
  `;
}

function renderTable() {
  const monthRows = transactions.filter((item) => String(item.date || "").startsWith(detailState.month));
  const rows = monthRows.filter((item) => detailState.type === "all" || item.type === detailState.type);
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const expenseRows = rows.filter((item) => item.type === "expense");
  const incomeRows = rows.filter((item) => item.type === "income");

  $("#detailMonthInput").value = detailState.month;
  $("#detailMonthLabel").textContent = formatDetailMonth(detailState.month);
  $("#detailNextMonth").disabled = detailState.month >= new Date().toISOString().slice(0, 7);
  document.querySelectorAll("[data-transaction-type]").forEach((button) => {
    button.classList.toggle("active", button.dataset.transactionType === detailState.type);
  });
  $("#transactionSummary").textContent = `${rows.length} 条`;
  const summaryParts = [];
  if (detailState.type !== "income") summaryParts.push(`支出 ${expenseRows.length} 笔 · ${money(sum(expenseRows))}`);
  if (detailState.type !== "expense") summaryParts.push(`收入 ${incomeRows.length} 笔 · ${money(sum(incomeRows))}`);
  $("#transactionAmountSummary").textContent = summaryParts.join("   |   ");

  $("#transactionTable").innerHTML = sorted.length
    ? sorted.map((item) => `
      <tr>
        <td>${escapeHtml(item.date)}</td>
        <td><span class="pill ${item.type}">${item.type === "income" ? "收入" : "支出"}</span></td>
        <td>${escapeHtml(item.category)}</td>
        <td>${escapeHtml(item.merchant)}</td>
        <td>${escapeHtml(item.note || "")}</td>
        <td class="amount-col">${money(item.amount)}</td>
      </tr>
    `).join("")
    : `<tr><td class="empty-state" colspan="6">${formatDetailMonth(detailState.month)}暂无对应流水。</td></tr>`;
}

function shiftDetailMonth(amount) {
  const [year, month] = detailState.month.split("-").map(Number);
  const target = new Date(year, month - 1 + amount, 1);
  const nextMonth = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (nextMonth > currentMonth) return;
  detailState.month = nextMonth;
  renderTable();
}

function formatDetailMonth(month) {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

function generateAnalysisPayload() {
  const payload = buildAnalysisPayload();
  const currentCount = payload.transactions.length;
  analysisText = JSON.stringify(payload, null, 2);
  $("#analysisPayload").value = analysisText;
  $("#analysisStatus").textContent = `${payload.periodName} · ${currentCount} 条流水`;
  setAnalysisHint(`已生成${payload.periodName}分析包，范围 ${payload.range.start} 至 ${payload.range.end}，共 ${currentCount} 条流水。`, "success");
  $("#analysisSection").scrollIntoView({ behavior: "smooth", block: "start" });
  $("#analysisPayload").focus();
  $("#analysisPayload").select();
  return payload;
}

function buildAnalysisPayload() {
  const range = getSelectedRange();
  const current = rowsInRange(transactions, range);
  const previousRange = getPreviousRange(range);
  const yearAgoRange = getYearAgoRange(range);
  const previousRows = rowsInRange(transactions, previousRange);
  const yearAgoRows = rowsInRange(transactions, yearAgoRange);
  return {
    task: "请分析这份支出与收入流水，找出异常偏高的支出分类、偏低的收入项，并给出优化建议。",
    schema: "codex-cashflow-analysis:v1",
    generatedAt: new Date().toISOString(),
    periodMode,
    periodName: periodLabel(),
    scope: `${periodLabel()}全部流水，不是最近若干条`,
    range,
    previousRange,
    yearAgoRange,
    currentSummary: summarize(current),
    previousSummary: summarize(previousRows),
    yearAgoSummary: summarize(yearAgoRows),
    currentExpenseCategories: categoryTotals(current.filter((item) => item.type === "expense")),
    previousExpenseCategories: categoryTotals(previousRows.filter((item) => item.type === "expense")),
    currentIncomeCategories: categoryTotals(current.filter((item) => item.type === "income")),
    currentTopExpenses: [...current]
      .filter((item) => item.type === "expense")
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
      .slice(0, 20),
    transactions: current,
  };
}

async function sendAnalysisToWorkspace() {
  const payload = analysisText ? JSON.parse(analysisText) : generateAnalysisPayload();
  try {
    const response = await fetch("/api/codex-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "保存失败");
    $("#analysisStatus").textContent = "已发送到 Codex 工作区";
    setAnalysisHint(`已发送。Codex 可直接读取：${result.latestFile}`, "success");
  } catch (error) {
    setAnalysisHint(`发送失败：${error.message}。我已选中文本，可先复制。`, "warning");
    $("#analysisPayload").focus();
    $("#analysisPayload").select();
  }
}

async function copyAnalysisPayload() {
  if (!analysisText) generateAnalysisPayload();
  try {
    await navigator.clipboard.writeText($("#analysisPayload").value);
    $("#analysisStatus").textContent = "已复制";
    setAnalysisHint("已复制。现在可以直接粘贴给 Codex，让它分析异常支出和优化建议。", "success");
    setTimeout(() => {
      $("#analysisStatus").textContent = `${rowsInRange(transactions, getSelectedRange()).length} 条流水`;
    }, 2000);
  } catch {
    const copied = copyBySelection($("#analysisPayload"));
    $("#analysisStatus").textContent = copied ? "已复制" : "请手动复制";
    setAnalysisHint(
      copied ? "已复制。现在可以直接粘贴给 Codex。" : "浏览器拦截了自动复制，我已经选中文本，请按 Command+C。",
      copied ? "success" : "warning",
    );
  }
}

function copyBySelection(element) {
  element.focus();
  element.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

function setAnalysisHint(message, level = "") {
  const hint = $("#analysisHint");
  hint.textContent = message;
  hint.classList.toggle("success", level === "success");
  hint.classList.toggle("warning", level === "warning");
}

// ===== 工具函数 =====
function diffRatio(current, base) {
  if (!base && !current) return 0;
  if (!base) return current ? 1 : 0;
  return (current - base) / base;
}

function formatDiff(value) {
  if (value === null || !Number.isFinite(value)) return "无可比数据";
  if (Math.abs(value) < 0.005) return "基本持平";
  return `${value > 0 ? "增加" : "减少"} ${percent(Math.abs(value))}`;
}

function periodLabel() {
  return { week: "本周", month: "本月", year: "本年" }[periodMode];
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day || 1);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeDate(value) {
  if (!value) return "";
  const match = String(value).match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function normalizeAmount(value) {
  const number = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Math.abs(number) || 0;
}

function sum(rows) {
  return rows.reduce((total, item) => total + Number(item.amount || 0), 0);
}

function money(value) {
  return moneyFormatter.format(Number(value || 0));
}

function compactMoney(value) {
  const number = Number(value || 0);
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
  if (number >= 1000) return `${Math.round(number / 1000)}k`;
  return Math.round(number).toString();
}

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function uniqueTransactions(rows) {
  const seenIds = new Set();
  const seenContent = new Set();
  const result = [];
  rows.forEach((item) => {
    const idKey = item.id || "";
    if (idKey) {
      if (seenIds.has(idKey)) return;
      seenIds.add(idKey);
      result.push(item);
      return;
    }
    const contentKey = transactionContentKey(item);
    if (seenContent.has(contentKey)) return;
    seenContent.add(contentKey);
    result.push(item);
  });
  return result;
}

function transactionKey(item) {
  return [item.date, item.type, item.amount, item.category, item.merchant, item.note || ""].join("|");
}

function transactionContentKey(item) {
  return [
    item.date,
    item.type,
    Number(item.amount || 0).toFixed(2),
    String(item.merchant || "").trim(),
    String(item.note || "").trim(),
  ].join("|");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// 初始化
init();
