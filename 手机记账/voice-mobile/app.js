const STORAGE_KEY = "mobile-ledger:voice-mobile-test:v1";
const COMPUTER_SNAPSHOT_KEY = "mobile-ledger:voice-mobile-computer-snapshot:v1";
const SYNC_URL_KEY = "mobile-ledger:voice-mobile-sync-url:v1";
const LAST_SYNC_KEY = "mobile-ledger:voice-mobile-last-sync:v1";

const categoryRules = [
  ["餐饮", ["餐饮", "吃饭", "吃早饭", "吃早餐", "吃午饭", "吃晚饭", "早饭", "午饭", "晚饭", "早餐", "夜宵", "外卖", "饭钱", "包子", "馒头", "面包", "米粉", "面条", "快餐", "火锅", "烧烤", "餐厅", "饭店"]],
  ["交通", ["交通", "坐地铁", "坐公交", "坐公交车", "地铁", "公交", "公交车", "打车", "打的", "出租车", "网约车", "滴滴", "共享单车", "骑车", "高铁", "火车", "机票", "停车", "停车费", "加油", "油费", "过路费", "高速费"]],
  ["购物", ["购物", "买东西", "淘宝", "京东", "拼多多", "商场"]],
  ["日用", ["日用", "生活用品", "超市"]],
  ["蔬菜", ["蔬菜", "买菜", "菜市场"]],
  ["水果", ["水果"]],
  ["零食", ["零食", "饮料", "奶茶", "咖啡"]],
  ["娱乐", ["娱乐", "电影", "唱歌", "游戏"]],
  ["通讯", ["通讯", "话费", "网费", "流量"]],
  ["服饰", ["服饰", "衣服", "鞋子", "裤子"]],
  ["住房", ["住房", "房租", "物业", "水费", "电费", "燃气"]],
  ["旅行", ["旅行", "旅游", "酒店", "民宿"]],
  ["医疗", ["医疗", "医院", "看病", "药", "体检"]],
  ["学习", ["学习", "课程", "培训", "学费"]],
  ["宠物", ["宠物", "猫粮", "狗粮"]],
  ["工资", ["工资", "薪水", "薪资"]],
  ["奖金", ["奖金", "年终奖"]],
  ["副业", ["副业", "兼职"]],
  ["投资收益", ["投资收益", "利息", "分红"]],
  ["退款", ["退款", "退货"]],
  ["红包", ["红包"]],
];

const incomeCategories = new Set(["工资", "奖金", "副业", "投资收益", "退款", "红包"]);
const iconMap = {
  "餐饮": "🍜", "交通": "🚇", "购物": "🛍", "日用": "🧻", "蔬菜": "🥬", "水果": "🍎",
  "零食": "🍪", "娱乐": "🎤", "通讯": "📱", "服饰": "👕", "住房": "🏠", "旅行": "✈️",
  "医疗": "🩺", "学习": "📚", "宠物": "🐾", "工资": "💼", "奖金": "🎁", "副业": "💻",
  "投资收益": "📈", "退款": "↩", "红包": "🧧", "其他": "＋", "其他收入": "＋",
};

const voiceButton = document.querySelector("#voiceButton");
const voiceButtonText = document.querySelector("#voiceButtonText");
const voiceStatus = document.querySelector("#voiceStatus");
const liveTranscript = document.querySelector("#liveTranscript");
const listeningBars = document.querySelector("#listeningBars");
const previewPanel = document.querySelector("#previewPanel");
const saveVoiceButton = document.querySelector("#saveVoiceButton");
const parseWarning = document.querySelector("#parseWarning");
const testRecordList = document.querySelector("#testRecordList");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isListening = false;
let currentDraft = null;
let toastTimer = null;
let computerRecords = [];

async function init() {
  bindEvents();
  registerMobileServiceWorker();
  initializeSettings();
  computerRecords = loadComputerSnapshot();
  renderDashboard();
  await loadComputerRecords();
  renderDashboard();
  checkOfflineReady(false);
  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceButtonText.textContent = "浏览器不支持";
    voiceStatus.textContent = "当前浏览器不支持网页语音识别，请改用最新版 Safari 或 Google Chrome。";
  }
}

function registerMobileServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
  navigator.serviceWorker.register("./sw.js?v=mobile-2").catch((error) => console.warn("手机测试版离线缓存注册失败", error));
}

function bindEvents() {
  voiceButton.addEventListener("click", toggleListening);
  document.querySelector("#retryButton").addEventListener("click", startListening);
  saveVoiceButton.addEventListener("click", saveDraft);
  document.querySelector("#clearTestButton").addEventListener("click", clearTestRecords);
  document.querySelector("#voiceShortcut").addEventListener("click", () => openDashboardView("voiceView"));
  document.querySelectorAll(".workspace-tab").forEach((button) => {
    button.addEventListener("click", () => openDashboardView(button.dataset.view));
  });
  document.querySelectorAll("[data-demo]").forEach((button) => {
    button.addEventListener("click", () => processTranscript(button.dataset.demo));
  });
  document.querySelector("#syncNowBtn").addEventListener("click", () => syncVoiceRecords(true));
  document.querySelector("#syncTestBtn").addEventListener("click", () => testComputerConnection(true));
  document.querySelector("#copyReceiveAddressBtn").addEventListener("click", copyReceiveAddress);
  document.querySelector("#offlineCheckBtn").addEventListener("click", () => checkOfflineReady(true));
  document.querySelector("#exportJsonBtn").addEventListener("click", () => exportCurrentMonth("json"));
  document.querySelector("#exportCsvBtn").addEventListener("click", () => exportCurrentMonth("csv"));
  document.querySelector("#syncUrlInput").addEventListener("change", saveSyncUrl);
  window.addEventListener("online", () => syncVoiceRecords(false));
}

function createRecognition() {
  const instance = new SpeechRecognition();
  instance.lang = "zh-CN";
  instance.continuous = false;
  instance.interimResults = true;
  instance.maxAlternatives = 3;

  instance.onstart = () => setListening(true);
  instance.onspeechend = () => instance.stop();
  instance.onresult = (event) => {
    let interim = "";
    let finalText = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const text = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalText += text;
      else interim += text;
    }
    liveTranscript.textContent = finalText || interim || "正在听…";
    if (finalText) processTranscript(finalText);
  };
  instance.onerror = (event) => {
    setListening(false);
    const messages = {
      "not-allowed": "麦克风权限未开启，请在地址栏左侧允许麦克风。",
      "no-speech": "没有听到声音，请靠近麦克风再试一次。",
      "audio-capture": "没有找到可用麦克风。",
      "network": "语音识别服务连接失败，请确认电脑已联网。",
    };
    voiceStatus.textContent = messages[event.error] || `识别失败：${event.error}`;
  };
  instance.onend = () => setListening(false);
  return instance;
}

function toggleListening() {
  if (isListening && recognition) {
    recognition.stop();
    return;
  }
  startListening();
}

function startListening() {
  if (!SpeechRecognition) return;
  openDashboardView("voiceView");
  previewPanel.hidden = true;
  currentDraft = null;
  liveTranscript.textContent = "正在听…";
  voiceStatus.textContent = "请说出日期、科目、收支、金额和备注。";
  recognition = createRecognition();
  try {
    recognition.start();
  } catch (error) {
    voiceStatus.textContent = "麦克风正在启动，请稍后再试。";
  }
}

function setListening(value) {
  isListening = value;
  voiceButton.classList.toggle("listening", value);
  listeningBars.classList.toggle("active", value);
  voiceButtonText.textContent = value ? "正在聆听" : "开始说话";
  if (!value && !currentDraft && liveTranscript.textContent === "正在听…") {
    liveTranscript.textContent = "等待你的声音";
  }
}

function processTranscript(rawText) {
  const transcript = normalizeSpeech(rawText);
  liveTranscript.textContent = transcript;
  currentDraft = parseLedgerSpeech(transcript);
  renderPreview(currentDraft);
  previewPanel.hidden = false;
  previewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  voiceStatus.textContent = currentDraft.amount ? "识别完成，请检查后保存。" : "没有听清金额，请重新说一次。";
}

function parseLedgerSpeech(transcript) {
  const category = detectCategory(transcript);
  const type = detectType(transcript, category);
  const amount = extractAmount(transcript);
  const date = extractDate(transcript);
  const note = extractNote(transcript, category, amount);
  const warnings = [];
  if (!amount) warnings.push("没有识别到有效金额");
  if (category.startsWith("其他")) warnings.push("没有匹配到明确科目，暂记为其他");
  return { id: crypto.randomUUID?.() || `voice-${Date.now()}`, transcript, type, category, amount, date, note, warnings, createdAt: new Date().toISOString() };
}

function detectCategory(text) {
  for (const [category, words] of categoryRules) {
    if (words.some((word) => text.includes(word))) return category;
  }
  return /(收入|收到|进账|赚了)/.test(text) ? "其他收入" : "其他";
}

function detectType(text, category) {
  if (/(收入|收到|进账|到账|赚了|发工资|报销到账)/.test(text) || incomeCategories.has(category)) return "income";
  return "expense";
}

function extractAmount(text) {
  const arabic = text.match(/(?:人民币|金额|花了|消费|支出|收入|收到|进账|到账)?\s*(\d+(?:\.\d+)?)\s*(?:元|块钱|块|圆|人民币)/);
  if (arabic) return Number(arabic[1]);
  const looseArabic = text.match(/\d+(?:\.\d+)?/);
  if (looseArabic) return Number(looseArabic[0]);

  const chinese = text.match(/([零〇一二两三四五六七八九十百千万点]+)(?:元|块钱|块|圆)/);
  if (!chinese) return 0;
  let value = chineseNumber(chinese[1]);
  const colloquialDecimal = text.slice((chinese.index || 0) + chinese[0].length).match(/^([零一二三四五六七八九])(?:毛|角)?/);
  if (colloquialDecimal && !chinese[1].includes("点")) value += chineseDigit(colloquialDecimal[1]) / 10;
  return Number(value.toFixed(2));
}

function chineseNumber(text) {
  if (text.includes("点")) {
    const [integer, decimal = ""] = text.split("点");
    const fraction = decimal.split("").map(chineseDigit).join("");
    return chineseInteger(integer) + Number(`0.${fraction || 0}`);
  }
  return chineseInteger(text);
}

function chineseInteger(text) {
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let total = 0;
  let section = 0;
  let number = 0;
  for (const char of text) {
    if (char in digits) {
      number = digits[char];
    } else if (char in units) {
      const unit = units[char];
      if (unit === 10000) {
        section = (section + number) * unit;
        total += section;
        section = 0;
      } else {
        section += (number || 1) * unit;
      }
      number = 0;
    }
  }
  return total + section + number;
}

function chineseDigit(char) {
  return ({ 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 })[char] || 0;
}

function extractDate(text) {
  const today = new Date();
  if (text.includes("前天")) return dateText(addDays(today, -2));
  if (text.includes("昨天") || text.includes("昨日")) return dateText(addDays(today, -1));
  const match = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/);
  if (match) return dateText(new Date(Number(match[1] || today.getFullYear()), Number(match[2]) - 1, Number(match[3])));
  return dateText(today);
}

function extractNote(text, category, amount) {
  let note = text;
  const removals = ["今天", "今日", "昨天", "昨日", "前天", "支出", "收入", "消费", "花了", "花费", "收到", "进账", "到账", category];
  removals.forEach((word) => { note = note.replaceAll(word, " "); });
  note = note
    .replace(/(?:人民币|金额)?\s*\d+(?:\.\d+)?\s*(?:元|块钱|块|圆|人民币)?/g, " ")
    .replace(/[零〇一二两三四五六七八九十百千万点]+(?:元|块钱|块|圆)(?:[零一二三四五六七八九](?:毛|角)?)?/g, " ")
    .replace(/[，。,.、]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return note || `${category}${amount ? ` ${formatAmount(amount)} 元` : ""}`;
}

function renderPreview(draft) {
  const isIncome = draft.type === "income";
  const typeNode = document.querySelector("#previewType");
  typeNode.textContent = isIncome ? "收入" : "支出";
  typeNode.className = `type-chip ${isIncome ? "income" : "expense"}`;
  document.querySelector("#previewAmount").textContent = `¥${formatAmount(draft.amount)}`;
  document.querySelector("#previewCategory").textContent = draft.category;
  document.querySelector("#previewDate").textContent = formatDate(draft.date);
  document.querySelector("#previewNote").textContent = draft.note;
  document.querySelector("#previewTranscript").textContent = draft.transcript;
  document.querySelector("#confidenceBadge").textContent = draft.warnings.length ? "需要确认" : "识别完整";
  parseWarning.hidden = !draft.warnings.length;
  parseWarning.textContent = draft.warnings.join("；");
  saveVoiceButton.disabled = !draft.amount;
}

function saveDraft() {
  if (!currentDraft || !currentDraft.amount) return;
  const records = loadRecords();
  records.unshift(currentDraft);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 100)));
  renderDashboard();
  showToast("测试记录已保存");
  currentDraft = null;
  previewPanel.hidden = true;
  liveTranscript.textContent = "等待你的下一句话";
  voiceStatus.textContent = "点击麦克风继续记下一笔。";
  openDashboardView("detailsView");
  syncVoiceRecords(false);
}

function loadRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch (_) {
    return [];
  }
}

function renderRecords() {
  const testRecords = loadRecords();
  const testIds = new Set(testRecords.map((record) => record.id));
  const records = [...testRecords, ...computerRecords]
    .filter((record) => record && record.date)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if (!records.length) {
    testRecordList.innerHTML = '<div class="empty-state">还没有账目，点“语音记一笔”开始记录。</div>';
    return;
  }
  const grouped = new Map();
  records.forEach((record) => {
    if (!grouped.has(record.date)) grouped.set(record.date, []);
    grouped.get(record.date).push(record);
  });
  testRecordList.innerHTML = [...grouped.entries()].slice(0, 24).map(([date, rows]) => {
    const dayExpense = rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const dayIncome = rows.filter((row) => row.type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return `
      <section class="day-group">
        <header class="day-heading">
          <span>${formatDayHeading(date)}</span>
          <div><strong>支出 ¥${formatAmount(dayExpense)}</strong>${dayIncome ? `<small>收入 ¥${formatAmount(dayIncome)}</small>` : ""}</div>
        </header>
        <div class="day-records">
          ${rows.map((record) => `
            <article class="record-row">
              <span class="record-icon">${iconMap[record.category] || "＋"}</span>
              <span class="record-meta"><strong>${escapeHtml(record.category)}${testIds.has(record.id) ? '<em class="record-source">语音测试</em>' : ""}</strong><small>${escapeHtml(record.note || "无备注")}${record.transcript ? ` · “${escapeHtml(record.transcript)}”` : ""}</small></span>
              <strong class="record-amount ${record.type}">${record.type === "expense" ? "−" : "+"}¥${formatAmount(record.amount)}</strong>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }).join("");
}

function clearTestRecords() {
  if (!loadRecords().length) return;
  if (!window.confirm("只清空语音测试记录，不影响正式账本。确定清空吗？")) return;
  localStorage.removeItem(STORAGE_KEY);
  renderDashboard();
  showToast("测试记录已清空");
}

async function loadComputerRecords() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2200);
  try {
    const response = await fetch("/api/records", { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    computerRecords = Array.isArray(payload.records) ? payload.records : [];
    localStorage.setItem(COMPUTER_SNAPSHOT_KEY, JSON.stringify(computerRecords));
  } catch (error) {
    computerRecords = loadComputerSnapshot();
    console.warn("读取电脑同步账本失败", error);
  } finally {
    clearTimeout(timer);
  }
}

function loadComputerSnapshot() {
  try {
    const records = JSON.parse(localStorage.getItem(COMPUTER_SNAPSHOT_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch (_) {
    return [];
  }
}

function getDashboardRecords() {
  const map = new Map();
  [...computerRecords, ...loadRecords()].forEach((record) => {
    if (!record || !record.id || !record.date || !Number.isFinite(Number(record.amount))) return;
    map.set(record.id, { ...record, amount: Number(record.amount) });
  });
  return [...map.values()];
}

function renderDashboard() {
  const records = getDashboardRecords();
  const now = new Date();
  const today = dateText(now);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const expense = records.filter((record) => record.type === "expense");
  const income = records.filter((record) => record.type === "income");
  const sum = (rows) => rows.reduce((total, record) => total + Number(record.amount || 0), 0);

  document.querySelector("#summaryDate").textContent = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  document.querySelector("#todayExpense").textContent = `¥${formatAmount(sum(expense.filter((record) => record.date === today)))}`;
  document.querySelector("#monthExpense").textContent = `¥${formatAmount(sum(expense.filter((record) => record.date.startsWith(month))))}`;
  document.querySelector("#yearExpense").textContent = `¥${formatAmount(sum(expense.filter((record) => record.date.startsWith(year))))}`;
  document.querySelector("#monthIncome").textContent = `¥${formatAmount(sum(income.filter((record) => record.date.startsWith(month))))}`;

  renderRecords();
  renderCategorySummary(records, month);
  renderTrendChart(records);
}

function renderCategorySummary(records, month) {
  const monthExpenses = records.filter((record) => record.type === "expense" && record.date.startsWith(month));
  const grouped = groupCategories(monthExpenses);
  const markup = categoryMarkup(grouped, 6);
  document.querySelector("#categorySummary").innerHTML = markup;
  document.querySelector("#categoryRanking").innerHTML = markup;
}

function groupCategories(records) {
  const totals = new Map();
  records.forEach((record) => totals.set(record.category || "其他", (totals.get(record.category || "其他") || 0) + Number(record.amount || 0)));
  return [...totals.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}

function categoryMarkup(rows, limit) {
  if (!rows.length) return '<div class="category-empty">本月还没有支出数据。</div>';
  const max = rows[0].amount || 1;
  return rows.slice(0, limit).map((row) => `
    <div class="category-item">
      <span class="category-name"><i></i>${escapeHtml(row.name)}</span>
      <strong>¥${formatAmount(row.amount)}</strong>
      <span class="category-bar"><span style="width:${Math.max(3, row.amount / max * 100).toFixed(1)}%"></span></span>
    </div>
  `).join("");
}

function renderTrendChart(records) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const buckets = days.map((day) => {
    const date = dateText(day);
    const total = records.filter((record) => record.type === "expense" && record.date === date).reduce((sum, record) => sum + Number(record.amount || 0), 0);
    return { date, label: `${day.getMonth() + 1}/${day.getDate()}`, total };
  });
  const weekTotal = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
  document.querySelector("#weekExpense").textContent = `¥${formatAmount(weekTotal)}`;
  document.querySelector("#trendChart").innerHTML = buildTrendSvg(buckets);
}

function buildTrendSvg(buckets) {
  const width = 720;
  const height = 300;
  const left = 34;
  const right = 18;
  const top = 30;
  const bottom = 44;
  const graphWidth = width - left - right;
  const graphHeight = height - top - bottom;
  const max = Math.max(...buckets.map((bucket) => bucket.total), 1);
  const points = buckets.map((bucket, index) => ({
    ...bucket,
    x: left + graphWidth * (index / Math.max(1, buckets.length - 1)),
    y: top + graphHeight - (bucket.total / max) * graphHeight,
  }));
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${left},${top + graphHeight} ${line} ${left + graphWidth},${top + graphHeight}`;
  const grid = [0, .5, 1].map((ratio) => `<line class="chart-grid" x1="${left}" y1="${top + graphHeight * ratio}" x2="${left + graphWidth}" y2="${top + graphHeight * ratio}"></line>`).join("");
  const dots = points.map((point) => `
    <circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="5"></circle>
    <text class="chart-value" x="${point.x}" y="${Math.max(14, point.y - 11)}" text-anchor="middle">${point.total ? trimChartAmount(point.total) : "0"}</text>
    <text class="chart-label" x="${point.x}" y="${height - 13}" text-anchor="middle">${point.label}</text>
  `).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="近七天支出折线图">${grid}<polygon class="chart-area" points="${area}"></polygon><polyline class="chart-line" points="${line}"></polyline>${dots}</svg>`;
}

function trimChartAmount(value) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}千`;
  return Number(value.toFixed(2)).toString();
}

function initializeSettings() {
  const input = document.querySelector("#syncUrlInput");
  input.value = localStorage.getItem(SYNC_URL_KEY) || location.origin;
  updateReceiveAddress();
  const lastSync = localStorage.getItem(LAST_SYNC_KEY);
  document.querySelector("#syncStatus").textContent = lastSync ? `上次同步 ${formatSyncTime(lastSync)}` : "尚未同步";
}

function saveSyncUrl() {
  const input = document.querySelector("#syncUrlInput");
  const normalized = normalizeSyncBase(input.value);
  if (normalized) localStorage.setItem(SYNC_URL_KEY, normalized);
  else localStorage.removeItem(SYNC_URL_KEY);
  input.value = normalized || location.origin;
  updateReceiveAddress();
}

function normalizeSyncBase(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, location.href).origin;
  } catch (_) {
    return raw.replace(/\/+$/, "");
  }
}

function syncBase() {
  return normalizeSyncBase(localStorage.getItem(SYNC_URL_KEY) || location.origin);
}

function updateReceiveAddress() {
  document.querySelector("#computerReceiveAddress").textContent = `${syncBase()}/api/voice-test-sync`;
}

async function syncVoiceRecords(manual) {
  const status = document.querySelector("#syncStatus");
  if (!navigator.onLine) {
    status.textContent = "当前离线，记录已留在手机";
    if (manual) showToast("当前离线，联网后再同步");
    return false;
  }
  status.textContent = "正在同步…";
  try {
    const response = await fetchWithTimeout(`${syncBase()}/api/voice-test-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app: "手机语音记账测试版",
        syncedAt: new Date().toISOString(),
        records: loadRecords(),
      }),
    }, 5000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "同步失败");
    const now = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_KEY, now);
    status.textContent = `已同步 ${result.saved ?? loadRecords().length} 条，${formatSyncTime(now)}`;
    if (manual) showToast("已同步到电脑");
    return true;
  } catch (error) {
    status.textContent = "暂时无法连接电脑，数据仍在手机";
    if (manual) showToast("连接失败，请确认电脑接收器已打开");
    console.warn("语音测试记录同步失败", error);
    return false;
  }
}

async function testComputerConnection(manual) {
  const status = document.querySelector("#syncStatus");
  status.textContent = "正在测试电脑连接…";
  try {
    const response = await fetchWithTimeout(`${syncBase()}/api/status`, { cache: "no-store" }, 4000);
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error("receiver unavailable");
    status.textContent = `电脑已连接 · 接收器 ${result.version || "正常"}`;
    if (manual) showToast("电脑连接正常");
    return true;
  } catch (error) {
    status.textContent = "电脑未连接，请打开同步接收器";
    if (manual) showToast("没有找到电脑同步接收器");
    return false;
  }
}

async function copyReceiveAddress() {
  const value = `${syncBase()}/api/voice-test-sync`;
  try {
    await navigator.clipboard.writeText(value);
  } catch (_) {
    const input = document.createElement("textarea");
    input.value = value;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  showToast("电脑接收地址已复制");
}

async function checkOfflineReady(manual) {
  const status = document.querySelector("#offlineStatus");
  if (!("serviceWorker" in navigator) || location.protocol !== "https:") {
    status.textContent = "需要使用 HTTPS 手机网址";
    if (manual) showToast("当前网址不支持离线安装");
    return false;
  }
  try {
    await navigator.serviceWorker.ready;
    const cached = await caches.match("./index.html", { ignoreSearch: true });
    const ready = Boolean(cached || navigator.serviceWorker.controller);
    status.textContent = ready ? "已缓存，可离线打开" : "正在缓存，请稍后再检查";
    if (manual) showToast(ready ? "离线缓存正常" : "正在准备离线缓存");
    return ready;
  } catch (_) {
    status.textContent = "缓存检查失败，请联网刷新一次";
    if (manual) showToast("请联网刷新页面后重试");
    return false;
  }
}

function exportCurrentMonth(format) {
  const month = dateText(new Date()).slice(0, 7);
  const records = getDashboardRecords()
    .filter((record) => String(record.date || "").startsWith(month))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (format === "json") {
    const payload = {
      app: "手机语音记账测试版",
      schema: "mobile-voice-ledger-export-v1",
      month,
      exportedAt: new Date().toISOString(),
      records,
    };
    downloadBlob(`手机语音记账-${month}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  } else {
    const rows = [["日期", "类型", "科目", "金额", "备注", "来源"]];
    records.forEach((record) => rows.push([
      record.date,
      record.type === "income" ? "收入" : "支出",
      record.category || "其他",
      Number(record.amount || 0).toFixed(2),
      record.note || "",
      record.transcript ? "语音测试" : "电脑同步",
    ]));
    const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    downloadBlob(`手机语音记账-${month}.csv`, csv, "text/csv;charset=utf-8");
  }
  showToast(`已生成本月 ${format.toUpperCase()}`);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadBlob(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function formatSyncTime(value) {
  const date = new Date(value);
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function openDashboardView(viewId) {
  document.querySelectorAll(".dashboard-view").forEach((view) => {
    const active = view.id === viewId;
    view.hidden = !active;
    view.classList.toggle("active", active);
  });
  document.querySelectorAll(".workspace-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  document.querySelector(".workspace-tabs").scrollIntoView({ behavior: "smooth", block: "start" });
}

function normalizeSpeech(text) {
  return String(text || "").replace(/\s+/g, "").replace(/块五毛/g, "块五").trim();
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDayHeading(value) {
  const date = new Date(`${value}T00:00:00`);
  const today = dateText(new Date());
  const yesterday = dateText(addDays(new Date(), -1));
  const relative = value === today ? "今天" : value === yesterday ? "昨天" : "";
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日 ${relative || weekdays[date.getDay()]}`;
}

function dateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value || "");
  return div.innerHTML;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 1800);
}

init();
