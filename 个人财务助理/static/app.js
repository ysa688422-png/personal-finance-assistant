let token = "";
let activeConversationId = localStorage.getItem("sayiFinanceActiveConversation") || "";
let conversations = [];
let currentMessages = [];
let lastVisibilitySync = 0;
let sending = false;

const $ = (selector) => document.querySelector(selector);
const money = (value) => Number(value || 0).toLocaleString("zh-CN", { style: "currency", currency: "CNY" });

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (token) headers["X-Sayi-Token"] = token;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作失败");
  return data;
}

function renderStatus(status) {
  $("#txCount").textContent = `${status.transactions || 0} 笔`;
  $("#sourceCount").textContent = `${status.sources || 0} 个`;
  $("#conflictCount").textContent = `${status.conflicts || 0} 条`;
  $("#excludedCount").textContent = `${status.excluded || 0} 条`;
  $("#dataRange").textContent = status.first_date ? `${status.first_date} → ${status.last_date}` : "暂无数据";
  $("#statusText").classList.add("ready");
  $("#statusText").lastChild.textContent = `本地数据已就绪 · 截至 ${status.last_date || "—"}`;
}

async function init() {
  const data = await api("/api/bootstrap");
  token = data.token;
  renderStatus(data.status);
  bind();
  await Promise.all([
    syncSilently(),
    loadConversations({ restoreSelection: true })
  ]);
}

function bind() {
  $("#chatForm").addEventListener("submit", sendMessage);
  $("#syncButton").addEventListener("click", syncNow);
  $("#txSearchButton").addEventListener("click", searchTransactions);
  $("#proposalForm").addEventListener("submit", makeProposal);
  $("#refreshProposals").addEventListener("click", loadProposals);
  $("#newConversationButton").addEventListener("click", createConversation);
  $("#historyToggle").addEventListener("click", toggleHistory);
  $("#historyScrim").addEventListener("click", closeHistory);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  $("#messageInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      $("#chatForm").requestSubmit();
    }
  });
  document.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => {
    $("#messageInput").value = button.dataset.question;
    $("#chatForm").requestSubmit();
  }));
  document.querySelectorAll(".control[data-panel]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".control[data-panel]").forEach((item) => item.classList.toggle("active", item === button));
    ["dataPanel", "repairPanel"].forEach((id) => $("#" + id).classList.toggle("hidden", id !== button.dataset.panel));
    if (button.dataset.panel === "repairPanel") loadProposals();
  }));
}

async function loadConversations({ restoreSelection = false } = {}) {
  try {
    const data = await api("/api/conversations");
    conversations = data.items || [];
    renderConversationList();
    if (!restoreSelection || !activeConversationId) return;
    const exists = conversations.some((item) => String(item.id) === String(activeConversationId));
    if (exists) await openConversation(activeConversationId, { preserveScroll: true });
    else clearConversation();
  } catch (error) {
    $("#conversationList").innerHTML = `<div class="conversation-empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderConversationList() {
  if (!conversations.length) {
    $("#conversationList").innerHTML = '<div class="conversation-empty">还没有历史对话。提一个问题，第一段对话会自动留存在本机。</div>';
    return;
  }
  $("#conversationList").innerHTML = conversations.map((item) => `
    <div class="conversation-item ${String(item.id) === String(activeConversationId) ? "active" : ""}" data-conversation-item="${escapeAttr(item.id)}">
      <button class="conversation-select" type="button" data-open-conversation="${escapeAttr(item.id)}">
        <span class="conversation-title">${escapeHtml(item.title || "新对话")}</span>
        <span class="conversation-date">${escapeHtml(formatCompactDate(item.updated_at || item.created_at))}</span>
      </button>
      <span class="conversation-menu">
        <button class="conversation-action" type="button" title="重命名" aria-label="重命名" data-rename-conversation="${escapeAttr(item.id)}">✎</button>
        <button class="conversation-action delete" type="button" title="删除" aria-label="删除" data-delete-conversation="${escapeAttr(item.id)}">×</button>
      </span>
    </div>`).join("");
  $("#conversationList").querySelectorAll("[data-open-conversation]").forEach((button) => button.addEventListener("click", () => openConversation(button.dataset.openConversation)));
  $("#conversationList").querySelectorAll("[data-rename-conversation]").forEach((button) => button.addEventListener("click", () => renameConversation(button.dataset.renameConversation)));
  $("#conversationList").querySelectorAll("[data-delete-conversation]").forEach((button) => button.addEventListener("click", () => deleteConversation(button.dataset.deleteConversation)));
}

async function createConversation() {
  if (sending) return;
  try {
    const data = await api("/api/conversations", { method: "POST", body: JSON.stringify({ title: "新对话" }) });
    const conversation = data.conversation || data;
    activeConversationId = String(conversation.id);
    localStorage.setItem("sayiFinanceActiveConversation", activeConversationId);
    currentMessages = [];
    showConversation(conversation);
    await loadConversations();
    closeHistory();
    $("#messageInput").focus();
  } catch (error) { alert(error.message); }
}

async function openConversation(id, { preserveScroll = false } = {}) {
  if (sending && String(id) !== String(activeConversationId)) return;
  try {
    const data = await api(`/api/conversations/${encodeURIComponent(id)}`);
    const conversation = data.conversation || data;
    activeConversationId = String(conversation.id);
    localStorage.setItem("sayiFinanceActiveConversation", activeConversationId);
    currentMessages = conversation.messages || [];
    showConversation(conversation, { preserveScroll });
    renderConversationList();
    closeHistory();
  } catch (error) {
    if (/not found|不存在/i.test(error.message)) {
      clearConversation();
      await loadConversations();
    } else alert(error.message);
  }
}

function showConversation(conversation, { preserveScroll = false } = {}) {
  $("#emptyState").classList.toggle("hidden", currentMessages.length > 0);
  $("#conversationHeading").classList.toggle("visible", currentMessages.length > 0 || Boolean(activeConversationId));
  $("#conversationTitle").textContent = conversation.title || "新对话";
  $("#conversationUpdated").textContent = conversation.updated_at ? `更新于 ${formatDate(conversation.updated_at)}` : "等待第一个问题";
  renderTranscript();
  if (!preserveScroll && currentMessages.length) $("#chatSurface").scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearConversation() {
  activeConversationId = "";
  localStorage.removeItem("sayiFinanceActiveConversation");
  currentMessages = [];
  $("#conversationTitle").textContent = "新对话";
  $("#conversationUpdated").textContent = "";
  $("#conversationHeading").classList.remove("visible");
  $("#emptyState").classList.remove("hidden");
  renderTranscript();
  renderConversationList();
}

function renderTranscript() {
  $("#transcript").innerHTML = currentMessages.map(renderMessage).join("");
  $("#quickPrompts").classList.toggle("hidden", currentMessages.length > 0);
}

function renderMessage(message) {
  const role = message.role === "user" ? "user" : "assistant";
  const label = role === "user" ? "你的问题" : "财务助理";
  const context = role === "assistant" ? renderMessageContext(message) : "";
  return `<article class="message ${role} ${message.pending ? "pending" : ""}">
    <div class="message-role">${label}</div>
    <div class="message-body ${message.pending ? "typing-dot" : ""}">${escapeHtml(message.content || "")}</div>
    ${context}
  </article>`;
}

function renderMessageContext(message) {
  const sources = normaliseJson(message.sources, []);
  const warnings = normaliseJson(message.warnings, []);
  const period = normaliseJson(message.period, null);
  if (!sources.length && !warnings.length && !period) return "";
  const periodHtml = period ? `<div class="message-period"><span class="section-label">数据期间</span><br>${escapeHtml(period.start || "—")} 至 ${escapeHtml(period.end || "—")}</div>` : "<div></div>";
  const sourcesHtml = `<div class="message-sources">${sources.length ? sources.map((item) => `<div class="message-source"><b>[来源${escapeHtml(item.id)}]</b>${escapeHtml(item.file || "未知来源")}<br>${escapeHtml(item.data_date || "日期未知")}</div>`).join("") : ""}</div>`;
  const warningsHtml = warnings.length ? `<div class="message-warnings">${warnings.map((item) => `<div>⚠ ${escapeHtml(item)}</div>`).join("")}</div>` : "";
  return `<div class="message-context">${periodHtml}${sourcesHtml}${warningsHtml}</div>`;
}

async function renameConversation(id) {
  const item = conversations.find((conversation) => String(conversation.id) === String(id));
  const title = prompt("输入新的对话名称", item?.title || "");
  if (!title || !title.trim()) return;
  try {
    await api(`/api/conversations/${encodeURIComponent(id)}/rename`, { method: "POST", body: JSON.stringify({ title: title.trim() }) });
    await loadConversations();
    if (String(id) === String(activeConversationId)) $("#conversationTitle").textContent = title.trim();
  } catch (error) { alert(error.message); }
}

async function deleteConversation(id) {
  const item = conversations.find((conversation) => String(conversation.id) === String(id));
  if (!confirm(`删除“${item?.title || "这段对话"}”？这只删除对话记录，不会修改财务资料。`)) return;
  try {
    await api(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (String(id) === String(activeConversationId)) clearConversation();
    await loadConversations();
  } catch (error) { alert(error.message); }
}

async function syncSilently() {
  try { renderStatus(await api("/api/sync", { method: "POST", body: "{}" })); } catch (_) { /* 状态栏保留上次可用状态 */ }
}

async function handleVisibilityChange() {
  if (document.visibilityState !== "visible") return;
  const now = Date.now();
  if (now - lastVisibilitySync < 30000) return;
  lastVisibilitySync = now;
  await syncSilently();
  // 不重载会话：窗口隐藏再显示时保留当前 transcript 和滚动位置。
}

async function syncNow() {
  const button = $("#syncButton");
  button.textContent = "正在更新…";
  try { renderStatus(await api("/api/sync", { method: "POST", body: "{}" })); button.textContent = "已是最新"; }
  catch (error) { button.textContent = error.message; }
  setTimeout(() => button.textContent = "立即增量更新", 2200);
}

async function sendMessage(event) {
  event.preventDefault();
  const message = $("#messageInput").value.trim();
  if (!message || sending) return;
  sending = true;
  const pendingId = `pending-${Date.now()}`;
  currentMessages.push({ role: "user", content: message }, { id: pendingId, role: "assistant", content: "正在读取白名单资料并计算…", pending: true });
  $("#messageInput").value = "";
  $("#emptyState").classList.add("hidden");
  $("#conversationHeading").classList.add("visible");
  $("#conversationTitle").textContent = activeConversationId ? $("#conversationTitle").textContent : "正在建立对话…";
  renderTranscript();
  $("#sendButton").disabled = true;
  $("#sendButton").textContent = "本地分析中…";
  scrollToLatest();
  try {
    const data = await api("/api/chat", { method: "POST", body: JSON.stringify({ message, conversation_id: activeConversationId || undefined }) });
    activeConversationId = String(data.conversation_id);
    localStorage.setItem("sayiFinanceActiveConversation", activeConversationId);
    currentMessages = currentMessages.filter((item) => item.id !== pendingId);
    currentMessages.push({
      id: data.assistant_message_id,
      role: "assistant",
      content: data.answer,
      sources: data.sources || [],
      period: data.period || null,
      warnings: data.warnings || []
    });
    $("#conversationTitle").textContent = data.title || "新对话";
    $("#conversationUpdated").textContent = `更新于 ${formatDate(new Date().toISOString())}`;
    renderTranscript();
    await loadConversations();
    scrollToLatest();
  } catch (error) {
    const pending = currentMessages.find((item) => item.id === pendingId);
    if (pending) { pending.content = error.message; pending.pending = false; pending.warnings = ["这条问题尚未保存为完整回答，可重新发送。"] }
    renderTranscript();
  } finally {
    sending = false;
    $("#sendButton").disabled = false;
    $("#sendButton").innerHTML = "继续分析 <span>↗</span>";
    $("#messageInput").focus();
  }
}

function scrollToLatest() {
  const messages = $("#transcript").querySelectorAll(".message");
  messages[messages.length - 1]?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function toggleHistory() {
  const open = document.body.classList.toggle("history-open");
  $("#historyToggle").setAttribute("aria-expanded", String(open));
}
function closeHistory() { document.body.classList.remove("history-open"); $("#historyToggle").setAttribute("aria-expanded", "false"); }

async function searchTransactions() {
  const q = encodeURIComponent($("#txSearch").value.trim());
  const month = encodeURIComponent($("#txMonth").value);
  const data = await api(`/api/transactions?q=${q}&month=${month}`);
  $("#txResults").innerHTML = data.items.length ? data.items.map((item) => `
    <div class="tx-row">
      <span>${escapeHtml(item.date)}</span><span>${item.type === "income" ? "收入" : "支出"}</span>
      <span>${escapeHtml(item.category)} · ${escapeHtml(item.note || item.merchant || "")}</span>
      <span class="amount ${item.type}">${money(item.amount)}</span>
      <button data-select='${escapeAttr(JSON.stringify(item))}'>选择</button>
    </div>`).join("") : '<div class="tx-row">没有找到记录</div>';
  $("#txResults").querySelectorAll("[data-select]").forEach((button) => button.addEventListener("click", () => selectTransaction(JSON.parse(button.dataset.select))));
}

function selectTransaction(item) {
  $("#proposalIdentity").value = item.identity;
  $("#selectedRecord").textContent = `${item.date} · ${item.category} · ${money(item.amount)} · ${item.note || item.merchant || "无备注"}`;
  $("#proposalForm").classList.remove("hidden");
  $("#proposalValue").value = "";
}

async function makeProposal(event) {
  event.preventDefault();
  try {
    await api("/api/proposals", { method: "POST", body: JSON.stringify({
      identity: $("#proposalIdentity").value, field: $("#proposalField").value,
      new_value: $("#proposalValue").value, reason: $("#proposalReason").value
    }) });
    $("#proposalForm").reset();
    $("#proposalForm").classList.add("hidden");
    await loadProposals();
  } catch (error) { alert(error.message); }
}

async function loadProposals() {
  const data = await api("/api/proposals");
  $("#proposalList").innerHTML = data.items.length ? data.items.map((item) => `
    <article class="proposal-card">
      <div><strong>${escapeHtml(item.field)}：${escapeHtml(String(item.old_value))} → ${escapeHtml(String(item.new_value))}</strong><p>原因：${escapeHtml(item.reason)}</p><p>状态：${statusLabel(item.status)} · ${escapeHtml(item.created_at)}</p></div>
      ${item.status === "pending" ? `<div class="proposal-actions"><button data-reject="${item.id}">取消</button><button class="confirm" data-confirm="${item.id}">确认写回</button></div>` : ""}
    </article>`).join("") : '<div class="conversation-empty">还没有修改建议。</div>';
  $("#proposalList").querySelectorAll("[data-confirm]").forEach((button) => button.addEventListener("click", () => actProposal(button.dataset.confirm, "confirm")));
  $("#proposalList").querySelectorAll("[data-reject]").forEach((button) => button.addEventListener("click", () => actProposal(button.dataset.reject, "reject")));
}

async function actProposal(id, action) {
  if (action === "confirm" && !confirm("确认按上面显示的旧值、新值和原因写回？系统会先备份全部受影响文件。")) return;
  try { await api(`/api/proposals/${id}/${action}`, { method: "POST", body: "{}" }); await loadProposals(); renderStatus((await api("/api/bootstrap")).status); }
  catch (error) { alert(error.message); }
}

function normaliseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}
function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}
function formatCompactDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}
function statusLabel(status) { return ({ pending: "等待确认", confirmed: "已写回并复核", rejected: "已取消" })[status] || status; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function escapeAttr(value) { return escapeHtml(value); }

init().catch((error) => { $("#statusText").lastChild.textContent = `启动失败：${error.message}`; });
