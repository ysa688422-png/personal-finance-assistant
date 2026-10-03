const STORAGE_KEY = "mobile-ledger:v1";
const COMPUTER_SNAPSHOT_KEY = "mobile-ledger:voice-formal-computer-snapshot:v1";
const SYNC_URL_KEY = "mobile-ledger:sync-url";
const SYNC_URL_MANUAL_KEY = "mobile-ledger:sync-url-manual";
const LAST_SYNC_KEY = "mobile-ledger:voice-formal-last-sync:v1";
const TEST_STORAGE_KEY = "mobile-ledger:voice-mobile-test:v1";
const MIGRATION_BACKUP_KEY = "mobile-ledger:voice-formal-pre-migration-backup:v1";
const MIGRATED_AT_KEY = "mobile-ledger:voice-formal-migrated-at:v1";
const DELETIONS_KEY = "mobile-ledger:deleted-records:v1";
const APP_VERSION = "unified-mobile-ledger-recognition-fix-20261002";
const SYNC_CHUNK_SIZE = 200;
const SYNC_INTERVAL_MS = 30000;
const DESKTOP_REFRESH_INTERVAL_MS = 5000;
const SPEECH_PAUSE_MS = 2500;
const MAX_RECORDING_MS = 30000;
const XIANYU_CATEGORY = "副业-咸鱼";
const XIANYU_FEE_RATE = 0.016;

const categoryRules = [
  ["餐饮", ["餐饮", "吃饭", "吃早饭", "吃早餐", "吃午饭", "吃晚饭", "早饭", "午饭", "晚饭", "早餐", "夜宵", "外卖", "饭钱", "包子", "馒头", "面包", "米粉", "面条", "快餐", "火锅", "烧烤", "餐厅", "饭店"]],
  ["交通", ["交通", "坐地铁", "坐公交", "坐公交车", "地铁", "公交", "公交车", "打车", "打的", "出租车", "网约车", "滴滴", "共享单车", "骑车", "高铁", "火车", "机票", "停车", "停车费", "加油", "油费", "过路费", "高速费"]],
  ["购物", ["购物", "买东西", "淘宝", "京东", "拼多多", "商场"]],
  ["日用", ["日用", "生活用品", "超市"]],
  ["蔬菜", ["蔬菜", "买菜", "菜市场"]],
  ["水果", ["水果"]],
  ["零食", ["零食", "饮料", "奶茶", "咖啡"]],
  ["运动", ["运动", "健身", "游泳", "羽毛球", "篮球", "足球", "瑜伽"]],
  ["娱乐", ["娱乐", "电影", "唱歌", "游戏"]],
  ["通讯", ["通讯", "话费", "网费", "流量"]],
  ["服饰", ["服饰", "衣服", "鞋子", "裤子"]],
  ["美容", ["美容", "理发", "护肤", "化妆", "美甲"]],
  ["住房", ["住房", "房租", "物业", "水费", "电费", "燃气"]],
  ["居家", ["居家", "家具", "家电", "床品"]],
  ["孩子", ["孩子", "儿童", "奶粉", "玩具"]],
  ["长辈", ["长辈", "父母", "老人"]],
  ["社交", ["社交", "聚会", "请客", "应酬"]],
  ["旅行", ["旅行", "旅游", "酒店", "民宿"]],
  ["烟酒", ["烟酒", "香烟", "白酒", "啤酒", "红酒"]],
  ["数码", ["数码", "手机", "电脑", "耳机", "相机"]],
  ["汽车", ["汽车", "修车", "保养", "车险", "洗车"]],
  ["医疗", ["医疗", "医院", "看病", "药", "体检"]],
  ["书籍", ["书籍", "买书", "图书"]],
  ["学习", ["学习", "课程", "培训", "学费"]],
  ["宠物", ["宠物", "猫粮", "狗粮"]],
  ["礼金", ["礼金", "随礼", "份子钱", "发红包"]],
  ["礼物", ["礼物", "送礼"]],
  ["办公", ["办公", "打印", "文具"]],
  ["维修", ["维修", "修理"]],
  ["捐赠", ["捐赠", "捐款"]],
  ["彩票", ["彩票", "双色球", "大乐透"]],
  ["亲友", ["亲友", "朋友", "亲戚"]],
  ["工资", ["工资", "薪水", "薪资"]],
  ["奖金", ["奖金", "年终奖"]],
  ["副业-咸鱼", ["闲鱼", "咸鱼", "卖券", "出售闲置"]],
  ["副业-银行券商开户奖励", ["开户奖励", "开户收益", "银行开户", "券商开户", "开户链接"]],
  ["红包", ["红包"]],
];

const incomeCategories = new Set(["工资", "奖金", "副业-咸鱼", "副业-银行券商开户奖励", "红包"]);
const iconMap = {
  "餐饮": "🍜", "交通": "🚇", "购物": "🛍", "日用": "🧻", "蔬菜": "🥬", "水果": "🍎",
  "零食": "🍪", "娱乐": "🎤", "通讯": "📱", "服饰": "👕", "住房": "🏠", "旅行": "✈️",
  "运动": "🏃", "美容": "✂️", "居家": "🛋", "孩子": "🧸", "长辈": "👪", "社交": "☕", "烟酒": "🍷",
  "数码": "💻", "汽车": "🚗", "书籍": "📖", "礼金": "🧧", "礼物": "🎁", "办公": "💼", "维修": "🔧",
  "捐赠": "❤", "彩票": "🎫", "亲友": "👥", "医疗": "🩺", "学习": "📚", "宠物": "🐾", "工资": "💼", "奖金": "🎁",
  "副业-咸鱼": "🐟", "副业-银行券商开户奖励": "🏦", "红包": "🧧", "其他": "＋", "其他收入": "＋",
};
const manualExpenseCategories = ["餐饮", "购物", "日用", "交通", "蔬菜", "水果", "零食", "运动", "娱乐", "通讯", "服饰", "美容", "住房", "居家", "孩子", "长辈", "社交", "旅行", "烟酒", "数码", "汽车", "医疗", "书籍", "学习", "宠物", "礼金", "礼物", "办公", "维修", "捐赠", "彩票", "亲友", "其他"];
const manualIncomeCategories = ["工资", "奖金", "副业-咸鱼", "副业-银行券商开户奖励", "红包"];

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
let syncInFlight = false;
let syncTimer = null;
let speechPauseTimer = null;
let recordingLimitTimer = null;
let manualEntry = { editingId: null, type: "expense", category: "餐饮", expression: "" };
let reportState = { type: "expense", range: "week", offset: 0 };
let detailsState = { month: dateText(new Date()).slice(0, 7), type: "all" };
let detailSearchState = { filters: null, error: null };
let detailSearchRecognition = null;
let detailSearchPauseTimer = null;
let detailSearchLimitTimer = null;
const DETAIL_SEARCH_HINT = "可查时间、金额、科目和备注；未说日期时查所选月份。文字搜索可离线使用，语音识别需要联网。";

async function init() {
  bindEvents();
  registerMobileServiceWorker();
  if (await ensureLatestVersion()) return;
  initializeSettings();
  const activeRecords = withoutDeleted(loadRecords());
  if (activeRecords.length !== loadRecords().length) saveRecords(activeRecords);
  refreshDesktopReceiverAddresses(false);
  migrateExistingData();
  initializeManualEntry();
  computerRecords = [];
  renderDashboard();
  await loadComputerRecords();
  renderDashboard();
  checkOfflineReady(false);
  startAutoSync();
  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceButtonText.textContent = "浏览器不支持";
    voiceStatus.textContent = "当前浏览器不支持网页语音识别，请改用最新版 Safari 或 Google Chrome。";
    document.querySelector("#detailVoiceSearchButton").disabled = true;
    document.querySelector("#detailVoiceSearchStatus").textContent = "此浏览器暂不支持语音搜索，可以输入条件搜索。文字搜索可离线使用。";
  }
}

function migrateExistingData() {
  if (localStorage.getItem(MIGRATED_AT_KEY)) return;
  const officialRaw = localStorage.getItem(STORAGE_KEY);
  const testRaw = localStorage.getItem(TEST_STORAGE_KEY);
  localStorage.removeItem(COMPUTER_SNAPSHOT_KEY);
  const backedUpAt = new Date().toISOString();
  try {
    localStorage.setItem(MIGRATION_BACKUP_KEY, JSON.stringify({ backedUpAt, officialRaw, testRaw }));
  } catch (_) {
    try {
      localStorage.setItem(MIGRATION_BACKUP_KEY, JSON.stringify({
        backedUpAt,
        officialRecordCount: loadRecords().length,
        testRaw,
        note: "正式账本原数据未删除；因浏览器容量限制，只保存测试记录原文和正式记录数量。",
      }));
    } catch (_) {}
  }
  let testRecords = [];
  try {
    const parsed = JSON.parse(testRaw || "[]");
    testRecords = Array.isArray(parsed) ? parsed : [];
  } catch (_) {}
  if (testRecords.length) {
    testRecords.forEach((record) => {
      record.source = record.source || "语音记账";
      record.updatedAt = record.updatedAt || record.createdAt || new Date().toISOString();
    });
    const merged = mergeRecords(loadRecords(), testRecords);
    saveRecords(merged.records);
  }
  localStorage.setItem(MIGRATED_AT_KEY, new Date().toISOString());
}

function registerMobileServiceWorker() {
  const localSecureContext = ["127.0.0.1", "localhost"].includes(location.hostname);
  if (!("serviceWorker" in navigator) || (location.protocol !== "https:" && !localSecureContext)) return;
  navigator.serviceWorker.register("./sw.js?v=recognition-fix-20261002").catch((error) => console.warn("手机记账离线缓存注册失败", error));
}

async function ensureLatestVersion() {
  if (!["http:", "https:"].includes(location.protocol)) return false;
  try {
    const response = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
    const latest = await response.json();
    if (!latest.version || latest.version === APP_VERSION) return false;
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter((registration) => registration.scope.includes("/voice-ledger")).map((registration) => registration.update()));
    }
    location.replace(`./index.html?v=${encodeURIComponent(latest.version)}&updated=${Date.now()}`);
    return true;
  } catch (_) {
    return false;
  }
}

function bindEvents() {
  voiceButton.addEventListener("click", toggleListening);
  document.querySelector("#retryButton").addEventListener("click", startListening);
  saveVoiceButton.addEventListener("click", saveDraft);
  document.querySelector("#refreshRecordsButton").addEventListener("click", refreshRecords);
  document.querySelector("#detailPrevMonth").addEventListener("click", () => shiftDetailMonth(-1));
  document.querySelector("#detailNextMonth").addEventListener("click", () => shiftDetailMonth(1));
  document.querySelector("#detailMonthPickerButton").addEventListener("click", openDetailMonthCalendar);
  document.querySelector("#detailCalendarClose").addEventListener("click", () => document.querySelector("#detailMonthCalendar").close());
  document.querySelector("#detailCalendarYear").addEventListener("change", renderDetailCalendarMonths);
  document.querySelector("#detailCalendarMonths").addEventListener("click", (event) => {
    const button = event.target.closest("[data-calendar-month]");
    if (button && !button.disabled) chooseDetailMonth(button.dataset.calendarMonth);
  });
  document.querySelector("#detailCalendarToday").addEventListener("click", () => chooseDetailMonth(dateText(new Date()).slice(0, 7)));
  document.querySelector("#detailMonthCalendar").addEventListener("click", (event) => {
    const dialog = event.currentTarget;
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  document.querySelectorAll("[data-detail-type]").forEach((button) => button.addEventListener("click", () => {
    clearDetailSearch(false);
    detailsState.type = button.dataset.detailType;
    renderDashboard();
  }));
  document.querySelector("#detailSearchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    cancelDetailVoiceSearch();
    applyDetailSearch();
  });
  document.querySelector("#detailSearchClear").addEventListener("click", () => clearDetailSearch());
  document.querySelector("#detailSearchInput").addEventListener("input", (event) => {
    if (!event.target.value && (detailSearchState.filters || detailSearchState.error)) { clearDetailSearch(); return; }
    document.querySelector("#detailSearchClear").hidden = !event.target.value && !detailSearchState.filters && !detailSearchState.error;
    if (detailSearchState.filters && event.target.value.trim() !== detailSearchState.filters.query) document.querySelector("#detailVoiceSearchStatus").textContent = "搜索条件已修改，点击“搜索”更新结果。";
  });
  document.querySelector("#detailVoiceSearchButton").addEventListener("click", startDetailVoiceSearch);
  window.addEventListener("pagehide", () => { cancelDetailVoiceSearch(); cancelVoiceEntry(); });
  document.querySelector("#voiceShortcut").addEventListener("click", () => {
    openDashboardView("voiceView");
    openEntryMode("voiceEntryMode");
  });
  document.querySelectorAll(".workspace-tab").forEach((button) => {
    button.addEventListener("click", () => openDashboardView(button.dataset.view));
  });
  document.querySelectorAll("[data-demo]").forEach((button) => {
    button.addEventListener("click", () => processTranscript(button.dataset.demo));
  });
  document.querySelectorAll("[data-entry-mode]").forEach((button) => button.addEventListener("click", () => openEntryMode(button.dataset.entryMode)));
  document.querySelectorAll("[data-manual-type]").forEach((button) => button.addEventListener("click", () => setManualType(button.dataset.manualType)));
  document.querySelector("#manualCategoryGrid").addEventListener("click", handleManualCategoryClick);
  document.querySelector(".manual-keypad").addEventListener("click", handleManualKeypadClick);
  document.querySelector("#saveManualEntryBtn").addEventListener("click", saveManualEntry);
  document.querySelector("#resetManualEntryBtn").addEventListener("click", () => resetManualEntry(true));
  document.querySelector("#deleteManualEntryBtn").addEventListener("click", deleteManualEntry);
  document.querySelector("#editVoiceDraftButton").addEventListener("click", editVoiceDraftManually);
  document.querySelector("#chartTypeSelect").addEventListener("change", (event) => {
    reportState.type = event.target.value;
    renderAdvancedReport(getDashboardRecords());
  });
  document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
    reportState.range = button.dataset.range;
    reportState.offset = 0;
    document.querySelectorAll("[data-range]").forEach((tab) => tab.classList.toggle("active", tab === button));
    renderAdvancedReport(getDashboardRecords());
  }));
  document.querySelector("#syncNowBtn").addEventListener("click", () => {
    if (!applyTypedSyncUrl(false)) return;
    fullSyncNow(true);
  });
  document.querySelector("#syncTestBtn").addEventListener("click", () => {
    if (!applyTypedSyncUrl(false)) return;
    testComputerConnection(true);
  });
  document.querySelector("#copyReceiveAddressBtn").addEventListener("click", copyReceiveAddress);
  document.querySelector("#offlineCheckBtn").addEventListener("click", () => checkOfflineReady(true));
  document.querySelector("#exportJsonBtn").addEventListener("click", () => exportCurrentMonth("json"));
  document.querySelector("#exportCsvBtn").addEventListener("click", () => exportCurrentMonth("csv"));
  document.querySelector("#importFile").addEventListener("change", importJson);
  document.querySelector("#installGuideBtn").addEventListener("click", showInstallGuide);
  document.querySelector("#syncGuideBtn").addEventListener("click", showSyncGuide);
  document.querySelector("#clearLocalBtn").addEventListener("click", clearLocalData);
  document.querySelector("#modalCloseBtn").addEventListener("click", closeModal);
  document.querySelector("#desktopReceiverRefreshBtn").addEventListener("click", () => refreshDesktopReceiverAddresses(true));
  document.querySelectorAll("[data-copy-desktop]").forEach((button) => {
    button.addEventListener("click", () => copyDesktopReceiverAddress(button.dataset.copyDesktop));
  });
  document.querySelector("#applySyncUrlBtn").addEventListener("click", () => applyTypedSyncUrl(true));
  document.querySelector("#resetSyncUrlBtn").addEventListener("click", resetSyncUrl);
  document.querySelector("#syncUrlInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyTypedSyncUrl(true);
    }
  });
  window.addEventListener("online", () => fullSyncNow(false));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelDetailVoiceSearch(); cancelVoiceEntry(); }
    else fullSyncNow(false);
  });
}

function createRecognition() {
  const instance = new SpeechRecognition();
  instance.lang = "zh-CN";
  instance.continuous = true;
  instance.interimResults = true;
  instance.maxAlternatives = 3;
  let finalTranscript = "", interimTranscript = "";
  let resultSegments = [];
  let recognitionFailed = false;

  instance.onstart = () => {
    if (recognition !== instance) return;
    setListening(true);
    clearTimeout(recordingLimitTimer);
    recordingLimitTimer = setTimeout(() => { try { instance.stop(); } catch (_) { cancelVoiceEntry(); } }, MAX_RECORDING_MS);
  };
  instance.onspeechstart = () => { if (recognition === instance) clearTimeout(speechPauseTimer); };
  instance.onspeechend = () => { if (recognition === instance) scheduleRecognitionStop(instance); };
  instance.onresult = (event) => {
    if (recognition !== instance) return;
    const collected = collectRecognitionText(event, resultSegments);
    resultSegments = collected.segments;
    finalTranscript = collected.finalTranscript;
    interimTranscript = collected.interimTranscript;
    liveTranscript.textContent = `${finalTranscript}${interimTranscript}` || "正在听…";
    scheduleRecognitionStop(instance);
  };
  instance.onerror = (event) => {
    if (recognition !== instance) return;
    recognitionFailed = true;
    cancelVoiceEntry();
    const messages = {
      "not-allowed": "麦克风权限未开启，请在地址栏左侧允许麦克风。",
      "no-speech": "没有听到声音，请靠近麦克风再试一次。",
      "audio-capture": "没有找到可用麦克风。",
      "network": "语音识别服务连接失败，请确认手机已联网，也可以改用手动记账。",
      "aborted": "录音已取消，可以重新说或改用手动记账。",
    };
    voiceStatus.textContent = messages[event.error] || `识别失败：${event.error}`;
  };
  instance.onend = () => {
    if (recognition !== instance) return;
    clearRecognitionTimers();
    setListening(false);
    recognition = null;
    const text = `${finalTranscript}${interimTranscript}`.trim();
    if (!recognitionFailed && text) processTranscript(text);
    else if (!recognitionFailed) voiceStatus.textContent = "没有识别到记账内容，请再说一次或改用手动记账。";
  };
  return instance;
}

function collectRecognitionText(event, previousSegments = []) {
  // SpeechRecognition results is a cumulative list. Replace changed entries
  // instead of appending finalized text again when the browser replays them.
  const segments = Array.isArray(previousSegments) ? previousSegments.slice() : [];
  segments.length = event.results.length;
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    segments[index] = { text:event.results[index][0].transcript, final:Boolean(event.results[index].isFinal) };
  }
  return {
    segments,
    finalTranscript:segments.filter((item) => item?.final).map((item) => item.text).join(""),
    interimTranscript:segments.filter((item) => item && !item.final).map((item) => item.text).join(""),
  };
}

function scheduleRecognitionStop(instance) {
  clearTimeout(speechPauseTimer);
  speechPauseTimer = setTimeout(() => {
    if (recognition !== instance) return;
    try { instance.stop(); } catch (_) { cancelVoiceEntry(); }
  }, SPEECH_PAUSE_MS);
}

function clearRecognitionTimers() {
  clearTimeout(speechPauseTimer);
  clearTimeout(recordingLimitTimer);
  speechPauseTimer = null;
  recordingLimitTimer = null;
}

function toggleListening() {
  if (recognition) {
    try { recognition.stop(); } catch (_) { cancelVoiceEntry(); }
    return;
  }
  startListening();
}

function startListening() {
  if (!SpeechRecognition) return;
  if (recognition) return;
  cancelDetailVoiceSearch();
  openDashboardView("voiceView");
  openEntryMode("voiceEntryMode");
  previewPanel.hidden = true;
  currentDraft = null;
  liveTranscript.textContent = "正在听…";
  voiceStatus.textContent = "可以连续说多笔金额；说完停顿两秒，或再次点击结束。";
  try {
    recognition = createRecognition();
    setListening(true);
    recognition.start();
  } catch (error) {
    cancelVoiceEntry();
    voiceStatus.textContent = "录音暂时无法启动，请稍后再试，也可以改用手动记账。";
  }
}

function cancelVoiceEntry() {
  const instance = recognition;
  recognition = null;
  clearRecognitionTimers();
  setListening(false);
  if (instance) {
    instance.onstart = instance.onresult = instance.onspeechstart = instance.onspeechend = instance.onerror = instance.onend = null;
    try { instance.abort(); } catch (_) {}
    voiceStatus.textContent = "录音已取消，可以重新说或改用手动记账。";
  }
}

function setListening(value) {
  isListening = value;
  voiceButton.classList.toggle("listening", value);
  listeningBars.classList.toggle("active", value);
  voiceButtonText.textContent = value ? "结束录制" : "开始说话";
  if (!value && !currentDraft && liveTranscript.textContent === "正在听…") {
    liveTranscript.textContent = "等待你的声音";
  }
}

function processTranscript(rawText) {
  cancelVoiceEntry();
  const transcript = normalizeSpeech(rawText);
  liveTranscript.textContent = transcript;
  currentDraft = parseLedgerSpeech(transcript);
  renderPreview(currentDraft);
  previewPanel.hidden = false;
  previewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  voiceStatus.textContent = currentDraft.amount ? "识别完成，请检查后保存。" : "没有听清金额，请重新说一次。";
}

function parseLedgerSpeech(transcript) {
  transcript = normalizeSpeech(transcript);
  let category = detectCategory(transcript);
  const type = detectType(transcript, category);
  if (type === "expense" && incomeCategories.has(category)) category = category === XIANYU_CATEGORY ? "购物" : "其他";
  let calculation = type === "income" ? calculateNetIncome(transcript) || calculateIncomeTotal(transcript) : calculateExpenseTotal(transcript);
  let amount = calculation?.result ?? extractAmount(transcript);
  if (category === XIANYU_CATEGORY && !calculation && amount > 0) {
    calculation = calculateXianyuIncome(amount);
    amount = calculation.result;
  }
  const date = extractDate(transcript);
  const note = buildLedgerNote(transcript, category, amount, calculation);
  const warnings = [];
  if (!amount) warnings.push("没有识别到有效金额");
  if (!date) warnings.push("日期没有识别清楚，请手动选择日期后再保存");
  const rawAmounts = extractExpenseValues(transcript);
  if (rawAmounts.some((value) => value !== roundMoney(value))) warnings.push("金额包含超过两位小数，请核对后手动修改");
  if (category.startsWith("其他")) warnings.push("没有匹配到明确科目，暂记为其他");
  return {
    id: crypto.randomUUID?.() || `voice-${Date.now()}`,
    transcript,
    type,
    category,
    amount,
    date,
    note,
    grossAmount: calculation?.gross,
    deductions: calculation?.deductions || [],
    lineItems: calculation?.values || [],
    calculation: calculation?.expression || "",
    calculationKind: calculation?.kind || "",
    warnings,
    createdAt: new Date().toISOString(),
  };
}

function detectCategory(text) {
  const xianyuPurchase = /(闲鱼|咸鱼)/.test(text) && /(购买|买入|买了|买)/.test(text) && !/(卖了|卖出|出售|售出)/.test(text);
  if (/(工资|薪水|薪资)/.test(text)) return "工资";
  if (/(奖金|年终奖)/.test(text)) return "奖金";
  if (/(收到红包|红包收入)/.test(text)) return "红包";
  if (/(开户奖励|开户收益|银行开户|券商开户|开户链接)/.test(text)) return "副业-银行券商开户奖励";
  if (/(卖券|出售闲置|卖了|卖出|出售|售出)/.test(text) || (/(闲鱼|咸鱼)/.test(text) && !/(买|购买|支出|付款|花了|花费|消费)/.test(text))) return XIANYU_CATEGORY;
  for (const [category, words] of categoryRules) {
    if (category === XIANYU_CATEGORY && xianyuPurchase) continue;
    if (words.some((word) => text.includes(word))) return category;
  }
  if (xianyuPurchase) return "购物";
  return /(收入|收到|进账|到账|赚了|收益|退款|返现|报销)/.test(text) ? "其他收入" : "其他";
}

function detectType(text, category) {
  if (/(支出|付款|花了|花费|消费|购买|买入|买了|买|发红包|给.*红包)/.test(text) && !/(退款|返现|报销|收入|收到|进账|到账|赚了|卖了|卖出|出售|售出)/.test(text)) return "expense";
  if (/(收入|收到|进账|到账|赚了|发工资|报销到账|退款|返现|卖了|卖出|出售|售出)/.test(text) || incomeCategories.has(category)) return "income";
  return "expense";
}

function calculateXianyuIncome(grossAmount) {
  const gross = roundMoney(grossAmount);
  const fee = roundMoney(gross * XIANYU_FEE_RATE);
  const result = roundMoney(gross - fee);
  return {
    kind: "xianyu-auto-fee",
    gross,
    deductions: [fee],
    values: [gross],
    result,
    expression: `¥${formatAmount(gross)} - ¥${formatAmount(fee)}（1.6%手续费） = ¥${formatAmount(result)}`,
  };
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function moneyTokenPattern() {
  const number = "(?:[0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?[万千百]?|[零〇一二两三四五六七八九十百千万点]+)";
  const digit = "[0-9零〇一二两三四五六七八九]";
  const fraction = `(?:${digit}(?:毛|角)(?:${digit}分?)?|${digit}分|${digit}{1,2}(?![0-9零〇一二两三四五六七八九十百千万点]*(?:元|块|圆)))`;
  return new RegExp(`(?:[¥￥]\\s*${number}(?:\\s*(?:元|块钱|块|圆|人民币)(?:\\s*${fraction})?)?|${number}\\s*(?:元|块钱|块|圆|人民币)(?:\\s*${fraction})?|${number}\\s*(?:毛|角)(?:\\s*${digit}分)?|${number}\\s*分)`, "g");
}

function parseMoneyNumber(value) {
  const text = String(value || "").replaceAll(",", "");
  if (/^\d+(?:\.\d+)?[万千百]?$/.test(text)) return parseFloat(text) * ({ 万:10000, 千:1000, 百:100 }[text.at(-1)] || 1);
  return chineseNumber(text);
}

function parseSpokenMoney(token) {
  const text = token.replace(/[¥￥\s]/g, "");
  const yuan = text.match(/^(.*?)(?:元|块钱|块|圆|人民币)(.*)$/);
  if (!yuan) {
    const fraction = text.match(/^(.*?)(?:毛|角)(?:([0-9零〇一二两三四五六七八九])分)?$/);
    if (fraction) return parseMoneyNumber(fraction[1]) / 10 + (fraction[2] ? moneyDigit(fraction[2]) / 100 : 0);
    if (text.endsWith("分")) return parseMoneyNumber(text.slice(0,-1)) / 100;
    return parseMoneyNumber(text);
  }
  let value = parseMoneyNumber(yuan[1]);
  const fraction = yuan[2];
  if (!fraction || /[.点]/.test(yuan[1])) return value;
  const jiao = fraction.match(/^([0-9零〇一二两三四五六七八九])(?:毛|角)(?:([0-9零〇一二两三四五六七八九])分?)?$/);
  if (jiao) return value + moneyDigit(jiao[1]) / 10 + (jiao[2] ? moneyDigit(jiao[2]) / 100 : 0);
  const fen = fraction.match(/^([0-9零〇一二两三四五六七八九])分$/);
  if (fen) return value + moneyDigit(fen[1]) / 100;
  const digits = [...fraction].map(moneyDigit).join("");
  return value + Number(`0.${digits}`);
}

function stripSpeechDatesAndCounts(text) {
  const number = "[0-9零〇一二两三四五六七八九十百千]+";
  return String(text).replace(new RegExp(`(?:(?:${number})年)?${number}月(?:${number}[日号]?)?`, "g"), " ")
    .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g, " ")
    .replace(new RegExp(`(?:${number})年|(?:${number})[日号]|(?:${number})时(?:${number}分)?|(?:${number})点(?:${number}分|半|整|钟)`, "g"), " ")
    .replace(new RegExp(`(?:上午|下午|晚上|早上|中午|凌晨)${number}点`, "g"), " ")
    .replace(/\d{1,2}[:：]\d{2}(?::\d{2})?/g, " ")
    .replace(new RegExp(`${number}\\s*(?:笔|个|件|份|张|次|公里|人|路|号线|折)`, "g"), " ")
    .replace(/[\d.]+\s*(?:%|％|百分比)/g, " ");
}

function extractAmount(text) {
  const clean = stripSpeechDatesAndCounts(text);
  const moneyValues = extractMoneyValues(clean);
  if (moneyValues.length) return roundMoney(moneyValues[0]);
  const contextual = clean.match(/(?:金额|花了|花费|消费|支出|收入|收到|进账|到账|卖了|卖出|售出)\s*[¥￥]?\s*([\d,]+(?:\.\d+)?[万千百]?|[零〇一二两三四五六七八九十百千万点]+)/);
  if (contextual) return roundMoney(parseMoneyNumber(contextual[1]));
  const standalone = [...clean.matchAll(/(?:^|[^\d])([0-9]+(?:,[0-9]{3})*(?:\.\d+)?)(?=$|[^\d])/g)];
  return standalone.length ? roundMoney(parseArabicAmount(standalone.at(-1)[1])) : 0;
}

function extractMoneyValues(text) {
  return [...String(text).matchAll(moneyTokenPattern())].map((match) => parseSpokenMoney(match[0])).filter(Number.isFinite);
}

function parseArabicAmount(value) {
  return Number(String(value || "").replaceAll(",", "")) || 0;
}

function extractExpenseValues(text) {
  let clean = stripSpeechDatesAndCounts(text);
  const values = [];
  for (const match of clean.matchAll(moneyTokenPattern())) values.push({ index:match.index, value:parseSpokenMoney(match[0]) });
  clean = clean.replace(moneyTokenPattern(), (match) => " ".repeat(match.length));
  for (const match of clean.matchAll(/[0-9]+(?:,[0-9]{3})*(?:\.\d+)?[万千百]?/g)) values.push({ index:match.index, value:parseMoneyNumber(match[0]) });
  return values.sort((a,b) => a.index-b.index).map((item) => item.value).filter((value) => Number.isFinite(value) && value > 0);
}

function moneyDigit(value) {
  if (/^\d$/.test(value)) return Number(value);
  return chineseDigit(value);
}

function calculateNetIncome(text) {
  if (!/(扣掉|扣除|减去|服务费|手续费|平台费|软件服务费)/.test(text)) return null;
  const values = extractExpenseValues(text);
  if (values.length < 2) return null;
  const gross = values[0];
  const deductions = values.slice(1);
  const net = Number(Math.max(0, gross - deductions.reduce((sum, value) => sum + value, 0)).toFixed(2));
  return {
    kind: "income-net",
    gross,
    deductions,
    net,
    result: net,
    values,
    expression: `${formatAmount(gross)} - ${deductions.map(formatAmount).join(" - ")} = ${formatAmount(net)}`,
  };
}

function calculateIncomeTotal(text) {
  const values = extractExpenseValues(text);
  if (values.length < 2) return null;
  const final = text.match(/(?:合计|一共|总共)(.*)$/);
  const finalValues = final ? extractExpenseValues(final[1]) : [];
  const result = finalValues.length === 1 ? roundMoney(finalValues[0]) : roundMoney(values.reduce((sum,value) => sum+value,0));
  return { kind:"income-sum", result, values, expression:finalValues.length === 1 ? `按合计金额 = ${formatAmount(result)}` : `${values.map(formatAmount).join(" + ")} = ${formatAmount(result)}` };
}

function calculateExpenseTotal(text) {
  const values = extractExpenseValues(text);
  if (values.length < 2) return null;

  const finalMarker = text.match(/(?:实付|实际支付|最终支付|最后付了|合计|一共|总共)(.*)$/);
  if (finalMarker) {
    const finalValues = extractExpenseValues(finalMarker[1]);
    const isExplicitFinal = /(实付|实际支付|最终支付|最后付了)/.test(finalMarker[0]);
    if (finalValues.length === 1 || (isExplicitFinal && finalValues.length)) {
      const result = finalValues.at(-1);
      return {
        kind: "expense-final",
        result,
        values,
        expression: `按实付金额 = ${formatAmount(result)}`,
      };
    }
  }

  if (/(优惠|减免|满减|折扣|抵扣|代金券)/.test(text)) {
    const gross = values[0];
    const deductions = values.slice(1);
    const result = Number(Math.max(0, gross - deductions.reduce((sum, value) => sum + value, 0)).toFixed(2));
    return {
      kind: "expense-discount",
      gross,
      deductions,
      result,
      values,
      expression: `${formatAmount(gross)} - ${deductions.map(formatAmount).join(" - ")} = ${formatAmount(result)}`,
    };
  }

  const result = Number(values.reduce((sum, value) => sum + value, 0).toFixed(2));
  return {
    kind: "expense-sum",
    result,
    values,
    expression: `${values.map(formatAmount).join(" + ")} = ${formatAmount(result)}`,
  };
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
  if (/^[零〇一二两三四五六七八九]+$/.test(text)) return Number([...text].map((char) => digits[char]).join(""));
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
  return ({ 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 })[char] || 0;
}

function extractDate(text) {
  const today = new Date();
  const normalized = String(text).replace(/([零〇一二两三四五六七八九十百千]+)(?=年|月|日|号)/g, (value) => String(chineseInteger(value)));
  const explicit = normalized.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/) || normalized.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (explicit) {
    const year = explicit[1] ? Number(explicit[1]) : today.getFullYear() - (/前年/.test(normalized) ? 2 : /去年/.test(normalized) ? 1 : 0);
    return validDateOrToday(year,Number(explicit[2]),Number(explicit[3]),today);
  }
  const monthDay = normalized.match(/(上个月|上月|本月|这个月|这月)?(\d{1,2})[日号]/);
  if (monthDay) {
    const month = new Date(today.getFullYear(),today.getMonth() - (/上/.test(monthDay[1] || "") ? 1 : 0),1);
    return validDateOrToday(month.getFullYear(),month.getMonth()+1,Number(monthDay[2]),today);
  }
  // An explicit but incomplete/invalid date must be corrected, never silently
  // booked to today's date.
  if (/\d+年|\d+月|\d+[日号]|\d{4}[-/.]\d/.test(normalized)) return "";
  const weekday = normalized.match(/(上周|本周|这周|周|星期)([一二三四五六日天])/);
  if (weekday) {
    const target = { 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 日:7, 天:7 }[weekday[2]];
    const monday = addDays(today,1-(today.getDay() || 7));
    return dateText(addDays(monday,target-1-(/上/.test(weekday[1]) ? 7 : 0)));
  }
  if (text.includes("前天")) return dateText(addDays(today, -2));
  if (text.includes("昨天") || text.includes("昨日")) return dateText(addDays(today, -1));
  if (text.includes("明天")) return dateText(addDays(today, 1));
  return dateText(today);
}

function validDateOrToday(year, month, day, today) {
  const candidate = new Date(year, month - 1, day);
  if (year < 1900 || year > 9999 || candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return "";
  return dateText(candidate);
}

function extractNote(text, category, amount) {
  let note = text;
  const removals = ["今天", "今日", "昨天", "昨日", "前天", "支出", "收入", "消费", "花了", "花费", "收到", "进账", "到账", category];
  removals.forEach((word) => { note = note.replaceAll(word, " "); });
  note = note
    .replace(/(?:(?:\d{4})年)?\d{1,2}月\d{1,2}[日号]?/g, " ")
    .replace(/[¥￥]\s*[\d,]+(?:\.\d+)?/g, " ")
    .replace(/(?:人民币|金额)?\s*[\d,]+(?:\.\d+)?\s*(?:元|块钱|块|圆|人民币)?/g, " ")
    .replace(/[零〇一二两三四五六七八九十百千万点]+(?:元|块钱|块|圆)(?:[零一二三四五六七八九](?:毛|角)?)?/g, " ")
    .replace(/[，。,.、]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return note || "无备注";
}

function buildLedgerNote(text, category, amount, calculation) {
  const base = extractNote(text, category, amount);
  if (!calculation) return base;
  if (calculation.kind === "expense-sum" || calculation.kind === "income-sum") {
    const prefix = base === "无备注" ? "" : `${base}；`;
    return `${prefix}${calculation.values.length}笔合计；${calculation.expression}`;
  }
  if (calculation.kind === "expense-discount") {
    const prefix = base === "无备注" ? "" : `${base}；`;
    return `${prefix}优惠后实付；${calculation.expression}`;
  }
  if (calculation.kind === "expense-final") {
    const prefix = base === "无备注" ? "" : `${base}；`;
    return `${prefix}${calculation.expression}`;
  }
  const saleSubject = text
    .replace(/^(今天|今日|昨天|昨日|前天)/, "")
    .split(/(?:然后|，|,)?\s*(?:扣掉|扣除|减去)/)[0]
    .replace(/(?:卖了|收入|收到|进账|到账)?\s*\d+(?:\.\d+)?\s*(?:元|块钱|块|圆|人民币)(?:\s*[0-9零〇一二两三四五六七八九]\s*(?:毛|角)?(?:\s*[0-9零〇一二两三四五六七八九]\s*分?)?)?/, "")
    .trim();
  return `${saleSubject || base}；净收入 ${calculation.expression}`;
}

function renderPreview(draft) {
  const isIncome = draft.type === "income";
  const typeNode = document.querySelector("#previewType");
  typeNode.textContent = isIncome ? "收入" : "支出";
  typeNode.className = `type-chip ${isIncome ? "income" : "expense"}`;
  document.querySelector("#previewAmount").textContent = `¥${formatAmount(draft.amount)}`;
  document.querySelector("#previewCategory").textContent = draft.category;
  document.querySelector("#previewDate").textContent = draft.date ? formatDate(draft.date) : "请手动选择日期";
  const calculationRow = document.querySelector("#previewCalculationRow");
  calculationRow.hidden = !draft.calculation;
  document.querySelector("#previewCalculation").textContent = draft.calculation || "—";
  document.querySelector("#previewNote").textContent = draft.note;
  document.querySelector("#previewTranscript").textContent = draft.transcript;
  document.querySelector("#confidenceBadge").textContent = draft.warnings.length ? "需要确认" : "识别完整";
  parseWarning.hidden = !draft.warnings.length;
  parseWarning.textContent = draft.warnings.join("；");
  saveVoiceButton.disabled = !(draft.amount > 0) || !draft.date || draft.warnings.some((warning) => warning.includes("超过两位小数"));
}

function saveDraft() {
  if (!currentDraft || !(currentDraft.amount > 0) || !currentDraft.date || currentDraft.warnings.some((warning) => warning.includes("超过两位小数"))) return;
  const records = loadRecords();
  currentDraft.source = "语音记账";
  currentDraft.updatedAt = currentDraft.createdAt;
  records.unshift(currentDraft);
  try {
    saveRecords(records);
  } catch (error) {
    showModal("保存失败", "这台手机的浏览器存储空间不足。请先立即同步或导出 JSON，再清理浏览器空间后重试。");
    return;
  }
  renderDashboard();
  showToast("记录已保存");
  currentDraft = null;
  previewPanel.hidden = true;
  liveTranscript.textContent = "等待你的下一句话";
  voiceStatus.textContent = "点击麦克风继续记下一笔。";
  openDashboardView("voiceView");
  openEntryMode("voiceEntryMode");
  syncToComputer(false);
}

function loadRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.records)) return saved.records;
    return Array.isArray(saved) ? saved : [];
  } catch (_) {
    return [];
  }
}

function saveRecords(records) {
  let state = {};
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && !Array.isArray(saved) && typeof saved === "object") state = saved;
  } catch (_) {}
  state.records = records;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function initializeManualEntry() {
  document.querySelector("#manualDateInput").value = dateText(new Date());
  renderManualEntry();
}

function openEntryMode(modeId) {
  if (modeId !== "voiceEntryMode") cancelVoiceEntry();
  document.querySelectorAll(".entry-mode").forEach((panel) => {
    const active = panel.id === modeId;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-entry-mode]").forEach((button) => button.classList.toggle("active", button.dataset.entryMode === modeId));
}

function setManualType(type) {
  manualEntry.type = type === "income" ? "income" : "expense";
  const allowed = manualEntry.type === "income" ? manualIncomeCategories : manualExpenseCategories;
  if (!allowed.includes(manualEntry.category)) manualEntry.category = allowed[0];
  renderManualEntry();
}

function renderManualEntry() {
  document.querySelectorAll("[data-manual-type]").forEach((button) => button.classList.toggle("active", button.dataset.manualType === manualEntry.type));
  document.querySelector("#manualAmountDisplay").textContent = manualEntry.expression || "0.00";
  const categories = manualEntry.type === "income" ? manualIncomeCategories : manualExpenseCategories;
  const categoryGrid = document.querySelector("#manualCategoryGrid");
  categoryGrid.classList.toggle("income-grid", manualEntry.type === "income");
  categoryGrid.innerHTML = categories.map((category) => `
    <button class="manual-category-button ${category === manualEntry.category ? "active" : ""}" type="button" data-manual-category="${escapeHtml(category)}">
      <span>${iconMap[category] || "＋"}</span><small>${escapeHtml(category)}</small>
    </button>
  `).join("");
  document.querySelector("#deleteManualEntryBtn").hidden = !manualEntry.editingId;
  const dateValue = document.querySelector("#manualDateInput").value || dateText(new Date());
  document.querySelector("[data-manual-key='date']").textContent = dateValue === dateText(new Date()) ? "今天" : formatDate(dateValue);
}

function handleManualCategoryClick(event) {
  const button = event.target.closest("[data-manual-category]");
  if (!button) return;
  manualEntry.category = button.dataset.manualCategory;
  renderManualEntry();
}

function handleManualKeypadClick(event) {
  const key = event.target.closest("[data-manual-key]")?.dataset.manualKey;
  if (!key || key === "date") return;
  event.preventDefault();
  if (key === "done") {
    saveManualEntry();
    return;
  }
  if (key === "back") {
    manualEntry.expression = manualEntry.expression.slice(0, -1);
  } else if (key === "." && currentManualNumber().includes(".")) {
    return;
  } else if ((key === "+" || key === "-") && (!manualEntry.expression || /[+-]$/.test(manualEntry.expression))) {
    return;
  } else if (/^\d$/.test(key) || [".", "+", "-"].includes(key)) {
    if (/^\d$/.test(key) && /\.\d{2}$/.test(currentManualNumber())) return;
    manualEntry.expression += key;
  }
  document.querySelector("#manualAmountDisplay").textContent = manualEntry.expression || "0.00";
}

function currentManualNumber() {
  return manualEntry.expression.split(/[+-]/).pop() || "";
}

function evaluateManualAmount(expression) {
  const clean = String(expression || "").replace(/[^\d.+-]/g, "");
  if (!clean || /[+-]$/.test(clean)) return 0;
  const parts = clean.match(/[+-]?[^+-]+/g) || [];
  const amount = parts.reduce((sum, part) => sum + Number(part || 0), 0);
  return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
}

function saveManualEntry() {
  const enteredAmount = evaluateManualAmount(manualEntry.expression);
  if (!(enteredAmount > 0)) {
    showModal("还没填金额", "先输入金额，再点完成或保存本笔。");
    return;
  }
  const records = loadRecords();
  const now = new Date().toISOString();
  const originalRecord = records.find((record) => record.id === manualEntry.editingId);
  const calculationDraft = manualEntry.voiceDraft || originalRecord;
  const retainedSpeechCalculation = calculationDraft?.category === XIANYU_CATEGORY
    && manualEntry.type === "income" && manualEntry.category === XIANYU_CATEGORY
    && calculationDraft.calculation && enteredAmount === calculationDraft.amount;
  const xianyuCalculation = manualEntry.type === "income" && manualEntry.category === XIANYU_CATEGORY && !retainedSpeechCalculation
    ? calculateXianyuIncome(enteredAmount) : null;
  const userNote = stripXianyuFeeNote(document.querySelector("#manualNoteInput").value.trim());
  const payload = {
    type: manualEntry.type,
    category: manualEntry.category,
    amount: xianyuCalculation?.result ?? enteredAmount,
    date: document.querySelector("#manualDateInput").value || dateText(new Date()),
    note: xianyuCalculation ? appendXianyuFeeNote(userNote, xianyuCalculation) : userNote,
    ...(xianyuCalculation ? {
      grossAmount: xianyuCalculation.gross,
      feeAmount: xianyuCalculation.deductions[0],
      feeRate: XIANYU_FEE_RATE,
      calculation: xianyuCalculation.expression,
    } : {}),
    updatedAt: now,
  };
  if (manualEntry.editingId) {
    const record = records.find((item) => item.id === manualEntry.editingId);
    if (record) {
      Object.assign(record, payload);
      if (!xianyuCalculation && !retainedSpeechCalculation) {
        delete record.grossAmount;
        delete record.feeAmount;
        delete record.feeRate;
        delete record.calculation;
        delete record.calculationKind;
        delete record.deductions;
      }
    } else { showModal("未找到原记录", "请返回明细重新选择要修改的记录。"); return; }
  } else {
    const newRecord = {
      id: crypto.randomUUID?.() || `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
      ...(manualEntry.voiceDraft || {}),
      ...payload,
      source: manualEntry.voiceDraft ? "语音记账" : "手动记账",
      createdAt: manualEntry.voiceDraft?.createdAt || now,
    };
    if (!xianyuCalculation && !retainedSpeechCalculation) {
      delete newRecord.grossAmount; delete newRecord.feeAmount; delete newRecord.feeRate; delete newRecord.calculation; delete newRecord.calculationKind; delete newRecord.deductions;
    }
    records.unshift(newRecord);
  }
  try {
    saveRecords(records);
  } catch (_) {
    showModal("保存失败", "手机存储空间不足。请先同步或导出 JSON 后再试。");
    return;
  }
  currentDraft = null;
  previewPanel.hidden = true;
  resetManualEntry(false);
  renderDashboard();
  showToast("这笔记录已保存");
  syncToComputer(false);
}

function stripXianyuFeeNote(note) {
  return String(note || "").replace(/(?:；\s*)?闲鱼成交 ¥[\d,.]+，自动扣除1\.6%手续费 ¥[\d,.]+\s*$/, "").trim();
}

function appendXianyuFeeNote(note, calculation) {
  const feeNote = `闲鱼成交 ¥${formatAmount(calculation.gross)}，自动扣除1.6%手续费 ¥${formatAmount(calculation.deductions[0])}`;
  return note ? `${note}；${feeNote}` : feeNote;
}

function resetManualEntry(announce) {
  manualEntry = { editingId: null, type: "expense", category: "餐饮", expression: "", voiceDraft: null };
  document.querySelector("#manualDateInput").value = dateText(new Date());
  document.querySelector("#manualNoteInput").value = "";
  renderManualEntry();
  if (announce) showToast("已清空当前输入");
}

function openManualEdit(id) {
  const dashboardRecord = getDashboardRecords().find((item) => item.id === id);
  if (!dashboardRecord) return;
  const records = loadRecords();
  if (!records.some((item) => item.id === id)) {
    records.unshift({ ...dashboardRecord });
    saveRecords(records);
  }
  manualEntry = {
    editingId: id,
    type: dashboardRecord.type === "income" ? "income" : "expense",
    category: dashboardRecord.category || "其他",
    expression: Number(dashboardRecord.feeRate ? dashboardRecord.grossAmount : dashboardRecord.amount || 0).toString(),
    voiceDraft: null,
  };
  document.querySelector("#manualDateInput").value = dashboardRecord.date || dateText(new Date());
  document.querySelector("#manualNoteInput").value = stripXianyuFeeNote(dashboardRecord.note || "");
  openDashboardView("voiceView");
  openEntryMode("manualEntryMode");
  renderManualEntry();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteManualEntry() {
  if (!manualEntry.editingId) return;
  const record = loadRecords().find((item) => item.id === manualEntry.editingId);
  if (!record || !confirm(`删除这笔${record.category} ¥${formatAmount(record.amount)}？`)) return;
  markRecordDeleted(manualEntry.editingId);
  saveRecords(loadRecords().filter((item) => item.id !== manualEntry.editingId));
  computerRecords = computerRecords.filter((item) => item.id !== manualEntry.editingId);
  resetManualEntry(false);
  renderDashboard();
  showToast("记录已删除");
  syncToComputer(false);
}

function editVoiceDraftManually() {
  if (!currentDraft) return;
  manualEntry = {
    editingId: null,
    type: currentDraft.type,
    category: currentDraft.category,
    expression: Number(currentDraft.amount || 0).toString(),
    voiceDraft: { ...currentDraft },
  };
  document.querySelector("#manualDateInput").value = currentDraft.date || dateText(new Date());
  document.querySelector("#manualNoteInput").value = currentDraft.note || "";
  currentDraft = null;
  previewPanel.hidden = true;
  openEntryMode("manualEntryMode");
  renderManualEntry();
  showToast("识别结果可以继续手动修改");
}

function renderRecords() {
  const localRecords = loadRecords();
  const voiceIds = new Set(localRecords.filter((record) => record.source === "语音记账" || record.transcript).map((record) => record.id));
  const records = getDetailRecords(getDashboardRecords())
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  renderDetailControls(records);
  renderDetailSearch(records);
  if (!records.length) {
    const typeLabel = detailsState.type === "expense" ? "支出" : detailsState.type === "income" ? "收入" : "收支";
    const empty = detailSearchState.error ? "修改上面的搜索条件后再试一次。" : detailSearchState.filters ? "没有找到符合条件的记录，可调整时间、金额或关键词。" : `${formatDetailMonth(detailsState.month)}暂无${typeLabel}记录。`;
    testRecordList.innerHTML = `<div class="empty-state">${empty}</div>`;
    return;
  }
  const grouped = new Map();
  records.forEach((record) => {
    if (!grouped.has(record.date)) grouped.set(record.date, []);
    grouped.get(record.date).push(record);
  });
  testRecordList.innerHTML = [...grouped.entries()].map(([date, rows]) => {
    const dayExpense = rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const dayIncome = rows.filter((row) => row.type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return `
      <section class="day-group">
        <header class="day-heading">
          <span>${formatDayHeading(date, Boolean(detailSearchState.filters))}</span>
          <div><strong>支出 ¥${formatAmount(dayExpense)}</strong>${dayIncome ? `<small>收入 ¥${formatAmount(dayIncome)}</small>` : ""}</div>
        </header>
        <div class="day-records">
          ${rows.map((record) => `
            <button class="record-row" type="button" data-edit-record="${escapeHtml(record.id)}" aria-label="编辑 ${escapeHtml(record.category)} ¥${formatAmount(record.amount)}">
              <span class="record-icon">${iconMap[record.category] || "＋"}</span>
              <span class="record-meta"><strong>${escapeHtml(record.category)}${voiceIds.has(record.id) ? '<em class="record-source">语音</em>' : ""}</strong><small>${record.time ? `${escapeHtml(record.time)} · ` : ""}${escapeHtml(record.note || "无备注")}${record.transcript ? ` · “${escapeHtml(record.transcript)}”` : ""}</small></span>
              <strong class="record-amount ${record.type}">${record.type === "expense" ? "−" : "+"}¥${formatAmount(record.amount)}</strong>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }).join("");
  testRecordList.querySelectorAll("[data-edit-record]").forEach((button) => button.addEventListener("click", () => openManualEdit(button.dataset.editRecord)));
}

function renderDetailControls(records) {
  document.querySelector("#detailMonthLabel").textContent = formatDetailMonth(detailsState.month);
  document.querySelector("#detailMonthPickerButton").setAttribute("aria-label", `选择明细月份，当前${formatDetailMonth(detailsState.month)}`);
  const searching = detailSearchState.filters || detailSearchState.error;
  document.querySelector("#testLedgerTitle").textContent = searching ? "明细搜索结果" : `${formatDetailMonth(detailsState.month)}明细`;
  document.querySelector("#detailMonthSummary").hidden = Boolean(searching);
  document.querySelectorAll("[data-detail-type]").forEach((button) => button.classList.toggle("active", button.dataset.detailType === detailsState.type));

  const expense = records.filter((record) => record.type === "expense").reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const income = records.filter((record) => record.type === "income").reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const parts = [`${records.length} 笔`];
  if (detailsState.type !== "income") parts.push(`支出 ¥${formatAmount(expense)}`);
  if (detailsState.type !== "expense") parts.push(`收入 ¥${formatAmount(income)}`);
  document.querySelector("#detailMonthSummary").textContent = parts.join(" · ");

  const currentMonth = dateText(new Date()).slice(0, 7);
  document.querySelector("#detailNextMonth").disabled = detailsState.month >= currentMonth;
}

function getDetailRecords(records) {
  if (detailSearchState.error) return [];
  if (detailSearchState.filters) return window.LedgerSearch.filterRecords(records, detailSearchState.filters);
  return records.filter((record) => record?.date && record.date.startsWith(detailsState.month) && (detailsState.type === "all" || record.type === detailsState.type));
}

function applyDetailSearch() {
  const query = document.querySelector("#detailSearchInput").value.trim();
  if (!query) { clearDetailSearch(); return; }
  try {
    const filters = window.LedgerSearch.parse(query, { month:detailsState.month, type:detailsState.type });
    detailSearchState = { filters, error:null };
    if (filters.scope.month && filters.scope.month <= dateText(new Date()).slice(0,7)) detailsState.month = filters.scope.month;
    detailsState.type = filters.type;
    document.querySelector("#detailVoiceSearchStatus").textContent = filters.defaultLargeAmount ? "大额按 ¥1,000 及以上筛选；可以补充具体金额后重新搜索。" : "条件已识别，可以在下方逐笔核对，也可以修改文字后重新搜索。";
  } catch (error) {
    detailSearchState = { filters:null, error:error.message };
    document.querySelector("#detailVoiceSearchStatus").textContent = "请核对搜索语句后再试一次。";
  }
  renderDashboard();
}

function clearDetailSearch(render = true) {
  cancelDetailVoiceSearch();
  detailSearchState = { filters:null, error:null };
  document.querySelector("#detailSearchInput").value = "";
  document.querySelector("#detailVoiceSearchStatus").textContent = SpeechRecognition ? DETAIL_SEARCH_HINT : "此浏览器暂不支持语音搜索，可以输入条件搜索。文字搜索可离线使用。";
  if (render) renderDashboard();
}

function renderDetailSearch(records) {
  const { filters, error } = detailSearchState;
  const conditions = document.querySelector("#detailSearchConditions");
  const summary = document.querySelector("#detailSearchSummary");
  conditions.hidden = !filters;
  conditions.innerHTML = filters ? filters.conditions.map((condition) => `<span>${escapeHtml(condition)}</span>`).join("") : "";
  summary.hidden = !filters && !error;
  summary.classList.toggle("error", Boolean(error));
  const expense = records.filter((record) => record.type === "expense").reduce((sum,row) => sum + Number(row.amount || 0),0);
  const income = records.filter((record) => record.type === "income").reduce((sum,row) => sum + Number(row.amount || 0),0);
  summary.textContent = error || `找到 ${records.length} 笔${filters?.type !== "income" ? ` · 支出合计 ¥${formatAmount(expense)}` : ""}${filters?.type !== "expense" ? ` · 收入合计 ¥${formatAmount(income)}` : ""}`;
  document.querySelector("#detailSearchClear").hidden = !filters && !error && !document.querySelector("#detailSearchInput").value;
}

function setDetailSearchListening(listening) {
  const button = document.querySelector("#detailVoiceSearchButton");
  button.classList.toggle("listening", listening);
  button.setAttribute("aria-pressed", String(listening));
  document.querySelector("#detailVoiceSearchLabel").textContent = listening ? "结束录音并搜索" : "语音搜索";
}

function clearDetailSearchTimers() {
  clearTimeout(detailSearchPauseTimer);
  clearTimeout(detailSearchLimitTimer);
  detailSearchPauseTimer = detailSearchLimitTimer = null;
}

function cancelDetailVoiceSearch() {
  const wasListening = Boolean(detailSearchRecognition);
  clearDetailSearchTimers();
  if (detailSearchRecognition) {
    const instance = detailSearchRecognition;
    detailSearchRecognition = null;
    instance.onstart = instance.onresult = instance.onspeechstart = instance.onspeechend = instance.onend = instance.onerror = null;
    try { instance.abort(); } catch (_) {}
  }
  setDetailSearchListening(false);
  if (wasListening) document.querySelector("#detailVoiceSearchStatus").textContent = "录音已取消，可以重新说或输入条件。";
}

function startDetailVoiceSearch() {
  if (detailSearchRecognition) {
    try { detailSearchRecognition.stop(); } catch (_) { cancelDetailVoiceSearch(); }
    return;
  }
  if (!SpeechRecognition) return;
  cancelVoiceEntry();
  let instance;
  try { instance = new SpeechRecognition(); }
  catch (_) { document.querySelector("#detailVoiceSearchStatus").textContent = "录音暂时无法启动，请稍后再试，也可以输入条件搜索。"; return; }
  detailSearchRecognition = instance;
  instance.lang = "zh-CN";
  instance.continuous = true;
  instance.interimResults = true;
  instance.maxAlternatives = 1;
  let finalText = "", interimText = "", failed = false, resultSegments = [];
  const stopAfterPause = () => {
    clearTimeout(detailSearchPauseTimer);
    detailSearchPauseTimer = setTimeout(() => { if (detailSearchRecognition !== instance) return; try { instance.stop(); } catch (_) { cancelDetailVoiceSearch(); } }, SPEECH_PAUSE_MS);
  };
  instance.onstart = () => {
    if (detailSearchRecognition !== instance) return;
    setDetailSearchListening(true);
    document.querySelector("#detailVoiceSearchStatus").textContent = "正在听…说完停顿两秒，或点击“结束录音并搜索”。";
    detailSearchLimitTimer = setTimeout(() => { if (detailSearchRecognition !== instance) return; try { instance.stop(); } catch (_) { cancelDetailVoiceSearch(); } }, MAX_RECORDING_MS);
  };
  instance.onspeechstart = () => { if (detailSearchRecognition === instance) clearTimeout(detailSearchPauseTimer); };
  instance.onspeechend = () => { if (detailSearchRecognition === instance) stopAfterPause(); };
  instance.onresult = (event) => {
    if (detailSearchRecognition !== instance) return;
    const collected = collectRecognitionText(event, resultSegments);
    resultSegments = collected.segments;
    finalText = collected.finalTranscript;
    interimText = collected.interimTranscript;
    document.querySelector("#detailSearchInput").value = `${finalText}${interimText}`.trim();
    document.querySelector("#detailSearchClear").hidden = false;
    stopAfterPause();
  };
  instance.onerror = (event) => {
    if (detailSearchRecognition !== instance) return;
    failed = true;
    cancelDetailVoiceSearch();
    const messages = {
      "not-allowed":"麦克风权限未开启，请在浏览器允许麦克风，或直接输入搜索条件。",
      "no-speech":"没有听到声音，请再说一次，也可以直接输入条件。",
      "audio-capture":"没有找到可用麦克风，可以输入条件搜索。",
      "network":"语音识别未能连接网络；输入文字仍可搜索已保存的记录。",
      "aborted":"录音已取消，可以重新说或输入条件。",
    };
    document.querySelector("#detailVoiceSearchStatus").textContent = messages[event.error] || "语音没有识别成功，可以输入条件搜索。";
  };
  instance.onend = () => {
    if (detailSearchRecognition !== instance) return;
    clearDetailSearchTimers();
    setDetailSearchListening(false);
    detailSearchRecognition = null;
    const text = `${finalText}${interimText}`.trim();
    if (!failed && text) {
      document.querySelector("#detailSearchInput").value = text;
      applyDetailSearch();
    } else if (!failed) document.querySelector("#detailVoiceSearchStatus").textContent = "没有识别到搜索条件，请再说一次或直接输入。";
  };
  setDetailSearchListening(true);
  try { instance.start(); }
  catch (_) {
    cancelDetailVoiceSearch();
    document.querySelector("#detailVoiceSearchStatus").textContent = "录音暂时无法启动，请稍后再试，也可以输入条件搜索。";
  }
}

function getRecordYears(records) {
  return [...new Set(records.filter((record) => {
    const date = String(record?.date || "");
    return record && !record.deleted && /^\d{4}-\d{2}-\d{2}$/.test(date) && dateText(new Date(`${date}T00:00:00`)) === date;
  }).map((record) => Number(record.date.slice(0, 4))))].sort((a, b) => a - b);
}

function getDetailCalendarYears(records, selectedMonth, now = new Date()) {
  const currentYear = now.getFullYear();
  const selectedYear = Number(selectedMonth.slice(0, 4));
  const earliest = Math.min(currentYear, selectedYear, ...getRecordYears(records));
  return Array.from({ length: currentYear - earliest + 1 }, (_, index) => currentYear - index);
}

function openDetailMonthCalendar() {
  const select = document.querySelector("#detailCalendarYear");
  const years = getDetailCalendarYears(getDashboardRecords(), detailsState.month);
  select.innerHTML = years.map((year) => `<option value="${year}">${year}年</option>`).join("");
  select.value = detailsState.month.slice(0, 4);
  renderDetailCalendarMonths();
  document.querySelector("#detailMonthCalendar").showModal();
}

function renderDetailCalendarMonths() {
  const year = document.querySelector("#detailCalendarYear").value;
  const currentMonth = dateText(new Date()).slice(0, 7);
  document.querySelector("#detailCalendarMonths").innerHTML = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    return `<button type="button" data-calendar-month="${month}" aria-label="${formatDetailMonth(month)}" aria-pressed="${month === detailsState.month}" ${month > currentMonth ? "disabled" : ""}>${index + 1}月</button>`;
  }).join("");
}

function chooseDetailMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > dateText(new Date()).slice(0, 7)) return;
  clearDetailSearch(false);
  detailsState.month = month;
  document.querySelector("#detailMonthCalendar").close();
  renderDashboard();
}

function shiftDetailMonth(amount) {
  const [year, month] = detailsState.month.split("-").map(Number);
  const target = new Date(year, month - 1 + amount, 1);
  const nextMonth = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
  const currentMonth = dateText(new Date()).slice(0, 7);
  if (nextMonth > currentMonth) return;
  clearDetailSearch(false);
  detailsState.month = nextMonth;
  renderDashboard();
}

function formatDetailMonth(month) {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

async function refreshRecords() {
  await loadComputerRecords(true);
  renderDashboard();
  showToast("账本已刷新");
}

async function loadComputerRecords(manual = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2200);
  try {
    const response = await fetch(`${syncBase()}/api/records`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    mergeDeletionMarkers(payload.deletions);
    computerRecords = withoutDeleted(Array.isArray(payload.records) ? payload.records : []);
    const storedRecords = loadRecords();
    const localRecords = withoutDeleted(storedRecords);
    const deletionChanged = localRecords.length !== storedRecords.length;
    const merged = mergeRecords(localRecords, computerRecords);
    if (merged.changed || deletionChanged) {
      try {
        saveRecords(merged.records);
      } catch (storageError) {
        updateSyncStatus("浏览器容量不足，电脑数据已显示但未全部缓存");
        console.warn("正式账本本地缓存容量不足", storageError);
      }
    }
    if (manual) updateSyncStatus(`已从电脑读取 ${computerRecords.length} 条`);
  } catch (error) {
    computerRecords = [];
    console.warn("读取电脑同步账本失败", error);
  } finally {
    clearTimeout(timer);
  }
}

function mergeRecords(localRecords, incomingRecords) {
  const byId = new Map();
  localRecords.forEach((record) => { if (record?.id) byId.set(record.id, record); });
  let changed = false;
  incomingRecords.forEach((record) => {
    if (!record?.date || !(Number(record.amount) > 0)) return;
    const normalized = {
      ...record,
      id: record.id || `remote-${record.date}-${record.amount}-${Math.random().toString(36).slice(2, 7)}`,
      amount: Number(record.amount),
      type: record.type === "income" ? "income" : "expense",
      category: record.category || "其他",
      note: record.note || "",
      createdAt: record.createdAt || record.updatedAt || new Date().toISOString(),
      updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
    };
    const current = byId.get(normalized.id);
    if (!current) {
      localRecords.push(normalized);
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
  return { records: localRecords, changed };
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
  withoutDeleted([...computerRecords, ...loadRecords()]).forEach((record) => {
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
  renderCategorySummary(records, detailsState.month);
  renderAdvancedReport(records);
}

function renderCategorySummary(records, month) {
  const categoryType = detailsState.type === "income" ? "income" : "expense";
  const searching = detailSearchState.filters || detailSearchState.error;
  const monthRows = (searching ? getDetailRecords(records) : records.filter((record) => record.date.startsWith(month))).filter((record) => record.type === categoryType);
  const grouped = groupCategories(monthRows);
  document.querySelector("#categoryMonthLabel").textContent = searching ? "搜索结果" : formatDetailMonth(month);
  document.querySelector("#categorySummaryTitle").textContent = categoryType === "income" ? "收入科目" : "支出科目";
  const markup = categoryMarkup(grouped, 6, searching ? "搜索结果中暂无对应科目数据。" : "所选月份暂无对应科目数据。");
  document.querySelector("#categorySummary").innerHTML = markup;
}

function groupCategories(records) {
  const totals = new Map();
  records.forEach((record) => totals.set(record.category || "其他", (totals.get(record.category || "其他") || 0) + Number(record.amount || 0)));
  return [...totals.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}

function categoryMarkup(rows, limit, emptyMessage = "所选月份暂无对应科目数据。") {
  if (!rows.length) return `<div class="category-empty">${escapeHtml(emptyMessage)}</div>`;
  const max = rows[0].amount || 1;
  return rows.slice(0, limit).map((row) => `
    <div class="category-item">
      <span class="category-name"><i></i>${escapeHtml(row.name)}</span>
      <strong>¥${formatAmount(row.amount)}</strong>
      <span class="category-bar"><span style="width:${Math.max(3, row.amount / max * 100).toFixed(1)}%"></span></span>
    </div>
  `).join("");
}

function renderAdvancedReport(records) {
  const now = new Date();
  const choices = getReportPeriodChoices(records, now);
  if (!choices.some((choice) => choice.offset === reportState.offset)) reportState.offset = 0;
  const period = buildReportPeriod(now);
  const rows = records.filter((record) => record.type === reportState.type && record.date >= period.start && record.date <= period.end);
  const buckets = period.buckets.map((bucket) => ({
    ...bucket,
    total: rows.filter((record) => record.date >= bucket.start && record.date <= bucket.end).reduce((sum, record) => sum + Number(record.amount || 0), 0),
  }));
  const total = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
  const average = buckets.length ? total / buckets.length : 0;
  const label = reportState.type === "income" ? "收入" : "支出";
  document.querySelector("#chartTypeSelect").value = reportState.type;
  document.querySelector("#chartTypeLabel").textContent = label;
  document.querySelector("#chartTotal").textContent = `总${label}：¥${formatAmount(total)}`;
  document.querySelector("#chartAverage").textContent = `平均值：¥${formatAmount(average)}`;
  document.querySelector("#rankingTitle").textContent = `${label}排行榜`;
  document.querySelector("#trendChart").innerHTML = buildTrendSvg(buckets, `${period.start}至${period.end}${label}趋势图`);
  const rangeLabel = reportState.range === "week" ? "最近四周（含本周，周一至周日）" : reportState.range === "month" ? `${now.getFullYear()}年全部月份` : "全部有记录的年份";
  document.querySelector("#reportPeriodLabel").textContent = `${rangeLabel} · 当前：${period.start} 至 ${period.end}`;
  const grouped = groupCategories(rows);
  const unit = reportState.range === "week" ? "周" : reportState.range === "month" ? "月" : "年";
  document.querySelector("#categoryRanking").innerHTML = categoryMarkup(grouped, grouped.length || 1, `所选${unit}暂无${label}记录。`);
  renderReportPeriodTabs(choices);
}

function renderReportPeriodTabs(choices) {
  document.querySelector("#periodTabs").innerHTML = choices.map((choice) => `<button class="report-period-tab ${choice.offset === reportState.offset ? "active" : ""}" type="button" data-report-offset="${choice.offset}" aria-current="${choice.offset === reportState.offset ? "date" : "false"}">${escapeHtml(choice.label)}</button>`).join("");
  document.querySelectorAll("[data-report-offset]").forEach((button) => button.addEventListener("click", () => {
    reportState.offset = Number(button.dataset.reportOffset);
    renderAdvancedReport(getDashboardRecords());
  }));
}

function getReportPeriodChoices(records = getDashboardRecords(), now = new Date()) {
  if (reportState.range === "week") {
    return [-3, -2, -1, 0].map((offset) => {
      const start = addDays(startOfWeek(now), offset * 7);
      const end = addDays(start, 6);
      const showYear = start.getFullYear() !== now.getFullYear() || end.getFullYear() !== start.getFullYear();
      const format = (date) => `${showYear ? `${date.getFullYear()}/` : ""}${date.getMonth() + 1}/${date.getDate()}`;
      return { offset, label: `${offset === 0 ? "本周 · " : offset === -1 ? "上周 · " : ""}${format(start)}–${format(end)}` };
    });
  }
  if (reportState.range === "month") {
    return Array.from({ length: 12 }, (_, index) => {
      const offset = index - now.getMonth();
      return { offset, label: `${index + 1}月${offset === 0 ? "（本月）" : ""}` };
    });
  }
  const years = [...new Set([...getRecordYears(records), now.getFullYear()])].sort((a, b) => a - b);
  return years.map((year) => ({ offset: year - now.getFullYear(), label: `${year}年${year === now.getFullYear() ? "（今年）" : ""}` }));
}

function buildReportPeriod(now = new Date()) {
  if (reportState.range === "week") {
    const start = addDays(startOfWeek(now), reportState.offset * 7);
    return {
      start: dateText(start),
      end: dateText(addDays(start, 6)),
      buckets: Array.from({ length: 7 }, (_, index) => {
        const date = addDays(start, index);
        return { label: dateText(date) === dateText(now) ? "今天" : `${date.getMonth() + 1}-${date.getDate()}`, start: dateText(date), end: dateText(date) };
      }),
    };
  }
  if (reportState.range === "month") {
    const start = addMonths(startOfMonth(now), reportState.offset);
    const end = endOfMonth(start);
    const buckets = [];
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 7)) {
      const bucketEnd = new Date(Math.min(addDays(cursor, 6).getTime(), end.getTime()));
      buckets.push({ label: `${cursor.getMonth() + 1}/${cursor.getDate()}`, start: dateText(cursor), end: dateText(bucketEnd) });
    }
    return { start: dateText(start), end: dateText(end), buckets };
  }
  const year = now.getFullYear() + reportState.offset;
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    buckets: Array.from({ length: 12 }, (_, index) => {
      const start = new Date(year, index, 1);
      return { label: `${index + 1}月`, start: dateText(start), end: dateText(endOfMonth(start)) };
    }),
  };
}

function startOfWeek(date) {
  const value = new Date(date);
  const day = value.getDay() || 7;
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - day + 1);
  return value;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
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

function buildTrendSvg(buckets, description = "近七天支出折线图") {
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
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(description)}">${grid}<polygon class="chart-area" points="${area}"></polygon><polyline class="chart-line" points="${line}"></polyline>${dots}</svg>`;
}

function trimChartAmount(value) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}千`;
  return Number(value.toFixed(2)).toString();
}

function initializeSettings() {
  const input = document.querySelector("#syncUrlInput");
  const saved = normalizeSyncBase(localStorage.getItem(SYNC_URL_KEY) || "");
  const manual = localStorage.getItem(SYNC_URL_MANUAL_KEY) === "1";
  input.value = isOfficialSecureOrigin() ? defaultSyncBase() : (manual && saved ? saved : defaultSyncBase());
  updateReceiveAddress();
  const lastSync = localStorage.getItem(LAST_SYNC_KEY);
  document.querySelector("#syncStatus").textContent = lastSync ? `上次同步 ${formatSyncTime(lastSync)}` : "尚未同步";
}

function applyTypedSyncUrl(testAfter) {
  const input = document.querySelector("#syncUrlInput");
  const normalized = normalizeSyncBase(input.value);
  if (!normalized) {
    showToast("请输入完整的电脑同步接收地址");
    input.focus();
    return false;
  }
  const current = defaultSyncBase();
  if (isOfficialSecureOrigin() && normalized !== current) {
    input.value = current;
    showToast("安全连接会自动使用当前电脑地址，请从该电脑的配对链接打开");
    return false;
  }
  if (current && normalized === current) {
    localStorage.removeItem(SYNC_URL_KEY);
    localStorage.removeItem(SYNC_URL_MANUAL_KEY);
  } else {
    localStorage.setItem(SYNC_URL_KEY, normalized);
    localStorage.setItem(SYNC_URL_MANUAL_KEY, "1");
  }
  input.value = normalized;
  updateReceiveAddress();
  document.querySelector("#syncStatus").textContent = `已应用电脑地址 ${normalized}`;
  showToast("新的电脑同步地址已应用");
  if (testAfter) testComputerConnection(true);
  return true;
}

function resetSyncUrl() {
  localStorage.removeItem(SYNC_URL_KEY);
  localStorage.removeItem(SYNC_URL_MANUAL_KEY);
  const current = defaultSyncBase();
  document.querySelector("#syncUrlInput").value = current;
  updateReceiveAddress();
  document.querySelector("#syncStatus").textContent = "已恢复使用当前网页地址";
  showToast("已恢复当前网页地址");
}

function defaultSyncBase() {
  if (!["http:", "https:"].includes(location.protocol)) return "";
  return normalizeSyncBase(location.origin);
}

function isOfficialSecureOrigin() {
  return location.protocol === "https:" && location.port === "4175";
}

function normalizeSyncBase(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.origin;
  } catch (_) {
    return "";
  }
}

function syncBase() {
  if (isOfficialSecureOrigin()) return defaultSyncBase();
  const saved = normalizeSyncBase(localStorage.getItem(SYNC_URL_KEY) || "");
  const manual = localStorage.getItem(SYNC_URL_MANUAL_KEY) === "1";
  if (manual && saved) return saved;
  return defaultSyncBase() || saved;
}

function updateReceiveAddress() {
  document.querySelector("#computerReceiveAddress").textContent = syncBase();
}

async function refreshDesktopReceiverAddresses(manual) {
  if (!window.matchMedia("(min-width: 681px)").matches) return;
  const ipTarget = document.querySelector("#desktopReceiverIp");
  const hostTarget = document.querySelector("#desktopReceiverHost");
  const statusTarget = document.querySelector("#desktopReceiverStatus");
  statusTarget.textContent = "正在读取接收器地址...";
  try {
    const response = await fetch(`/api/status?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "接收器未返回地址");
    const urls = Array.isArray(result.localUrls) ? result.localUrls : [];
    const clean = (value) => String(value || "").replace(/\/$/, "");
    const ipAddress = urls.find((url) => /^https:\/\/(?:\d{1,3}\.){3}\d{1,3}:4175\/?$/.test(url));
    const hostAddress = result.recommendedUrl || urls.find((url) => !/^https:\/\/(?:\d{1,3}\.){3}\d{1,3}/.test(url));
    ipTarget.textContent = clean(ipAddress) || "未识别到当前 Wi-Fi 地址";
    hostTarget.textContent = clean(hostAddress) || "未识别到固定地址";
    statusTarget.textContent = `接收器正常 · 电脑已保存 ${Number(result.records || 0).toLocaleString("zh-CN")} 条记录${manual ? " · 地址已刷新" : ""}`;
  } catch (error) {
    ipTarget.textContent = "请先启动同步接收器";
    hostTarget.textContent = "接收器未连接";
    statusTarget.textContent = "没有连接到电脑同步接收器。";
  }
}

async function copyDesktopReceiverAddress(targetId) {
  const value = document.querySelector(`#${targetId}`)?.textContent?.trim() || "";
  if (!value.startsWith("https://")) {
    showToast("当前没有可复制的同步地址");
    return;
  }
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
  document.querySelector("#desktopReceiverStatus").textContent = `已复制：${value}`;
  showToast("同步地址已复制");
}

function startAutoSync() {
  if (syncTimer) clearInterval(syncTimer);
  const interval = ["127.0.0.1", "localhost"].includes(location.hostname) ? DESKTOP_REFRESH_INTERVAL_MS : SYNC_INTERVAL_MS;
  syncTimer = setInterval(() => fullSyncNow(false), interval);
  fullSyncNow(false);
}

async function fullSyncNow(manual) {
  await loadComputerRecords(false);
  renderDashboard();
  return syncToComputer(manual);
}

async function syncToComputer(manual) {
  if (syncInFlight) return false;
  const status = document.querySelector("#syncStatus");
  const records = withoutDeleted(loadRecords());
  const deletions = loadDeletions();
  if (!records.length && !deletions.length) {
    status.textContent = "暂无记录可同步";
    if (manual) showModal("还没有记录", "手机和电脑里都没有可同步的记账记录。");
    return false;
  }
  if (["127.0.0.1", "localhost"].includes(location.hostname)) {
    status.textContent = `电脑已读取 ${records.length} 条`;
    if (manual) showModal("读取完成", `电脑端已从接收器读取 ${records.length} 条正式记录。`);
    return true;
  }
  syncInFlight = true;
  status.textContent = "正在同步…";
  try {
    const health = await fetchWithTimeout(`${syncBase()}/api/status?t=${Date.now()}`, { cache: "no-store" }, 7000);
    if (!health.ok) throw new Error(`接收器 HTTP ${health.status}`);
    const result = await uploadRecordsInChunks(records);
    const latestLocal = [...records].sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0];
    const verified = await fetchComputerRecords();
    mergeDeletionMarkers(verified.deletions);
    const verifiedRecords = withoutDeleted(verified.records);
    if (latestLocal?.id && !verifiedRecords.some((record) => record.id === latestLocal.id)) {
      throw new Error("电脑没有找到手机最新一笔记录");
    }
    computerRecords = verifiedRecords;
    const currentRecords = withoutDeleted(loadRecords());
    const merged = mergeRecords(currentRecords, computerRecords);
    if (merged.changed || currentRecords.length !== loadRecords().length) saveRecords(merged.records);
    renderDashboard();
    const now = new Date().toISOString();
    localStorage.setItem(LAST_SYNC_KEY, now);
    status.textContent = `已同步 ${result.totalRecords ?? records.length} 条，${formatSyncTime(now)}`;
    if (manual) showModal("同步完成", "记录已进入正式手机账本，并可由财务管理和流水分析读取。");
    return true;
  } catch (error) {
    status.textContent = `无法连接 ${syncBase()}，数据仍在手机`;
    if (manual) showModal("连接失败", `没有连接到电脑接收器：${syncBase()}\n\n请确认手机与 Mac 连接同一个 Wi-Fi，接收器窗口保持打开。手机数据仍安全保存在本机。`);
    console.warn("正式语音账本同步失败", error);
    return false;
  } finally {
    syncInFlight = false;
  }
}

async function fetchComputerRecords() {
  const response = await fetchWithTimeout(`${syncBase()}/api/records?t=${Date.now()}`, { cache: "no-store" }, 8000);
  if (!response.ok) throw new Error(`核对记录 HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.records)) throw new Error("电脑未返回正式账本");
  return { records: payload.records, deletions: Array.isArray(payload.deletions) ? payload.deletions : [] };
}

async function uploadRecordsInChunks(records) {
  const totalChunks = Math.max(1, Math.ceil(records.length / SYNC_CHUNK_SIZE));
  const syncId = `${APP_VERSION}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let result = null;
  for (let index = 0; index < totalChunks; index += 1) {
    document.querySelector("#syncStatus").textContent = `正在同步 ${index + 1}/${totalChunks}…`;
    const chunkRecords = records.slice(index * SYNC_CHUNK_SIZE, (index + 1) * SYNC_CHUNK_SIZE);
    const response = await fetchWithTimeout(`${syncBase()}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSyncPayload(chunkRecords, {
        syncId,
        chunkIndex: index,
        totalChunks,
        totalRecords: records.length,
        fullSync: true,
      })),
    }, 12000);
    if (!response.ok) throw new Error(`第 ${index + 1}/${totalChunks} 块 HTTP ${response.status}`);
    result = await response.json();
    if (!result.ok) throw new Error(result.error || "电脑未接收成功");
  }
  if (result?.pending) throw new Error("电脑还没有收齐所有同步分块");
  return result || { ok: true, totalRecords: records.length };
}

function buildSyncPayload(records, chunk) {
  const months = [...new Set(records.map((record) => String(record.date || "").slice(0, 7)).filter(Boolean))].sort();
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
      transactions: records.filter((record) => String(record.date || "").startsWith(month)).map((record) => ({
        date: record.date,
        type: record.type === "income" ? "收入" : "支出",
        direction: record.type === "income" ? "收入" : "支出",
        amount: Number(record.amount),
        category: mapCategoryForFinance(record),
        merchant: record.note || record.category,
        note: record.note || "",
        source: "手机记账自动同步",
      })),
    })),
  };
}

function mapCategoryForFinance(record) {
  if (record.type === "income") {
    if (["副业-咸鱼", "副业-银行券商开户奖励"].includes(record.category)) return record.category;
    return ["工资", "奖金", "红包"].includes(record.category) ? record.category : "其他收入";
  }
  const map = { 蔬菜: "餐饮", 水果: "餐饮", 零食: "餐饮", 日用: "购物", 服饰: "购物", 住房: "居住", 居家: "居住", 学习: "教育", 书籍: "教育", 长辈: "人情", 礼金: "人情", 礼物: "人情", 亲友: "人情" };
  return map[record.category] || (["餐饮", "交通", "购物", "娱乐", "医疗", "旅行"].includes(record.category) ? record.category : "其他");
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
  const value = syncBase();
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
  const localSecureContext = ["127.0.0.1", "localhost"].includes(location.hostname);
  if (!("serviceWorker" in navigator) || (location.protocol !== "https:" && !localSecureContext)) {
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
      app: "手机记账",
      schema: "personal-asset-manager-compatible",
      month,
      exportedAt: new Date().toISOString(),
      transactions: records.map((record) => ({
        date: record.date,
        type: record.type === "income" ? "收入" : "支出",
        direction: record.type === "income" ? "收入" : "支出",
        amount: Number(record.amount),
        category: mapCategoryForFinance(record),
        merchant: record.note || record.category,
        note: record.note || "",
        source: "手机记账",
      })),
      records,
    };
    downloadBlob(`手机记账-${month}-导入财务管理.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  } else {
    const rows = [["日期", "类型", "科目", "金额", "备注", "来源"]];
    records.forEach((record) => rows.push([
      record.date,
      record.type === "income" ? "收入" : "支出",
      record.category || "其他",
      Number(record.amount || 0).toFixed(2),
      record.note || "",
      record.transcript ? "语音记账" : "手机记账",
    ]));
    const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    downloadBlob(`手机记账-${month}.csv`, csv, "text/csv;charset=utf-8");
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

async function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const incoming = Array.isArray(payload.records) ? payload.records : [];
    const before = loadRecords();
    const merged = mergeRecords(before, incoming);
    saveRecords(merged.records);
    renderDashboard();
    await syncToComputer(false);
    showModal("恢复完成", `已读取 ${incoming.length} 条，当前正式账本共有 ${merged.records.length} 条。重复记录不会再次添加。`);
  } catch (error) {
    showModal("恢复失败", "没有读取到可恢复的手机记账 JSON，请确认文件来自手机记账导出。");
  } finally {
    event.target.value = "";
  }
}

function showInstallGuide() {
  showModal("添加到苹果手机桌面", "1. 用 Safari 打开本页 HTTPS 正式地址。\n2. 在“我的”里确认离线可用。\n3. 点 Safari 分享按钮。\n4. 选择“添加到主屏幕”。\n5. 以后从桌面图标进入，离线时也能查看和记账。");
}

function showSyncGuide() {
  showModal("离线和自动同步", "离线时记录保存在手机本地。回到电脑可连接的网络后，打开页面或点“立即同步”，数据会进入原手机记账的正式电脑接收器。\n\n财务管理和支出与收入流水继续读取同一批同步文件，不需要重复导入。");
}

function clearLocalData() {
  if (!window.confirm("确定只清空这台手机浏览器里的本地账本吗？电脑同步备份不会自动删除。建议先点立即同步或导出 JSON。")) return;
  saveRecords([]);
  computerRecords = [];
  localStorage.removeItem(COMPUTER_SNAPSHOT_KEY);
  renderDashboard();
  showModal("本机已清空", "电脑同步备份仍保留。再次点“同步刷新”可以从电脑重新读取记录。");
}

function showModal(title, body) {
  document.querySelector("#modalTitle").textContent = title;
  document.querySelector("#modalBody").textContent = body;
  document.querySelector("#modal").hidden = false;
}

function closeModal() {
  document.querySelector("#modal").hidden = true;
}

function updateSyncStatus(text) {
  const target = document.querySelector("#syncStatus");
  if (target) target.textContent = text;
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
  if (viewId !== "detailsView") cancelDetailVoiceSearch();
  if (viewId !== "voiceView") cancelVoiceEntry();
  document.querySelectorAll(".dashboard-view").forEach((view) => {
    const active = view.id === viewId;
    view.hidden = !active;
    view.classList.toggle("active", active);
  });
  document.querySelectorAll(".workspace-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  if (window.matchMedia("(max-width: 680px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
  else document.querySelector(".workspace-tabs").scrollIntoView({ behavior: "smooth", block: "start" });
}

function normalizeSpeech(text) {
  return String(text || "").normalize("NFKC").replace(/\s+/g, "").trim();
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDayHeading(value, showYear = false) {
  const date = new Date(`${value}T00:00:00`);
  const today = dateText(new Date());
  const yesterday = dateText(addDays(new Date(), -1));
  const relative = value === today ? "今天" : value === yesterday ? "昨天" : "";
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${showYear ? `${date.getFullYear()}年` : ""}${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日 ${relative || weekdays[date.getDay()]}`;
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

window.__voiceLedgerTest = Object.freeze({
  parseLedgerSpeech,
  calculateXianyuIncome,
  mapCategoryForFinance,
  mergeRecords,
  buildSyncPayload,
});

function runParserSelfTests() {
  const cases = [
    ["8月25餐饮花费¥24.6", "expense", "餐饮", 24.6, "2026-08-25"],
    ["8月25餐饮花费24.6", "expense", "餐饮", 24.6, "2026-08-25"],
    ["今天早上吃早餐花了五块钱", "expense", "餐饮", 5],
    ["今天坐公交花了一块六", "expense", "交通", 1.6],
    ["昨天打车支出35.5元", "expense", "交通", 35.5],
    ["前天买菜花了二十五块八", "expense", "蔬菜", 25.8],
    ["八月二十五日餐饮二十四块六", "expense", "餐饮", 24.6, "2026-08-25"],
    ["2026年7月3日买衣服1,280.50元", "expense", "服饰", 1280.5, "2026-07-03"],
    ["今日交话费50", "expense", "通讯", 50],
    ["今天工资收入八千元", "income", "工资", 8000],
    ["收到奖金500元", "income", "奖金", 500],
    ["咸鱼卖自助餐券卖了260块钱，扣掉2块6的服务费和1块5毛6的软件服务费", "income", "副业-咸鱼", 255.84],
    ["闲鱼卖旧手机¥1,200，扣掉¥12服务费和￥3.5平台费", "income", "副业-咸鱼", 1184.5],
    ["今天咸鱼收入300元", "income", "副业-咸鱼", 295.2],
    ["券商开户奖励到账500元", "income", "副业-银行券商开户奖励", 500],
    ["收到退款24.6元", "income", "其他收入", 24.6],
    ["理财收益到账88.8元", "income", "其他收入", 88.8],
    ["收到红包66元", "income", "红包", 66],
    ["给朋友发红包100元", "expense", "礼金", 100],
    ["健身花费30元", "expense", "运动", 30],
    ["理发花费45元", "expense", "美容", 45],
    ["买家具花费600元", "expense", "居家", 600],
    ["给孩子买玩具80元", "expense", "孩子", 80],
    ["给父母花费200元", "expense", "长辈", 200],
    ["朋友聚会花费160元", "expense", "社交", 160],
    ["买红酒花费120元", "expense", "烟酒", 120],
    ["买耳机花费399元", "expense", "数码", 399],
    ["汽车保养花费800元", "expense", "汽车", 800],
    ["买书花费68元", "expense", "书籍", 68],
    ["随礼花费500元", "expense", "礼金", 500],
    ["买礼物花费260元", "expense", "礼物", 260],
    ["办公打印花费20元", "expense", "办公", 20],
    ["维修花费180元", "expense", "维修", 180],
    ["捐款花费100元", "expense", "捐赠", 100],
    ["买彩票花费10元", "expense", "彩票", 10],
    ["今天餐饮花了十八块九，十九块三，二十块一", "expense", "餐饮", 58.3],
    ["今天餐饮花了¥18.9、¥19.3、¥20.1", "expense", "餐饮", 58.3],
    ["今天餐饮18.9、19.3、20.1", "expense", "餐饮", 58.3],
    ["今天餐饮18块9、19.3、20.1", "expense", "餐饮", 58.3],
    ["买3个面包花费18.9", "expense", "餐饮", 18.9],
    ["2人吃饭花费100元", "expense", "餐饮", 100],
    ["坐13路公交花了2元", "expense", "交通", 2],
    ["购物原价100元优惠20元", "expense", "购物", 80],
    ["购物原价100优惠20元", "expense", "购物", 80],
    ["购物原价100元优惠20元实付80元", "expense", "购物", 80],
    ["三笔打车18.9元19.3元20.1元总共58.3元", "expense", "交通", 58.3],
    ["闲鱼卖2张券260元扣掉2.6服务费", "income", "副业-咸鱼", 257.4],
  ];
  const results = cases.map(([text, type, category, amount, date]) => {
    const actual = parseLedgerSpeech(text);
    const passed = actual.type === type
      && actual.category === category
      && Math.abs(actual.amount - amount) < 0.001
      && (!date || actual.date === date);
    return { text, passed, expected: { type, category, amount, date }, actual: { type: actual.type, category: actual.category, amount: actual.amount, date: actual.date, note: actual.note } };
  });
  const financeCategoryPassed = mapCategoryForFinance({ type: "income", category: "副业-咸鱼" }) === "副业-咸鱼";
  const makeSpeechResult = (transcript, isFinal) => Object.assign([{ transcript }], { isFinal });
  const firstSpeech = collectRecognitionText({ resultIndex: 0, results: [makeSpeechResult("今天餐饮十八块九，", true)] });
  const secondSpeech = collectRecognitionText({ resultIndex: 1, results: [makeSpeechResult("今天餐饮十八块九，", true), makeSpeechResult("十九块三，", true)] }, firstSpeech.segments);
  const thirdSpeech = collectRecognitionText({ resultIndex: 2, results: [makeSpeechResult("今天餐饮十八块九，", true), makeSpeechResult("十九块三，", true), makeSpeechResult("二十块一", true)] }, secondSpeech.segments);
  const assembledDraft = parseLedgerSpeech(thirdSpeech.finalTranscript);
  const continuousRecordingPassed = Math.abs(assembledDraft.amount - 58.3) < 0.001 && assembledDraft.category === "餐饮";
  return {
    passed: results.filter((result) => result.passed).length + Number(financeCategoryPassed) + Number(continuousRecordingPassed),
    total: results.length + 2,
    failures: results.filter((result) => !result.passed),
    financeCategoryPassed,
    continuousRecordingPassed,
  };
}

if (new URLSearchParams(location.search).has("selftest")) {
  document.documentElement.dataset.voiceLedgerSelfTest = JSON.stringify(runParserSelfTests());
}

init();
