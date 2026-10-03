const STORAGE_KEY = "sayi_special_activity_finance_v1";
// 汇率由使用者自行维护；演示版不内置历史行情。
const typeLabels = { travel: "旅行", investment: "投资工具", crypto: "买币/换汇", reward: "开户/奖励", other: "其他专项" };

const expenseSeed = [];

function classify(note) {
  if (/住宿|酒店/.test(note)) return ["住", "住宿"];
  if (/饭|早餐|午餐|晚餐|奶茶|蛋挞|水/.test(note)) return ["吃", "餐饮"];
  if (/打车|地铁|公交|火车|大巴|邮轮|交通/.test(note)) return ["出行", "交通"];
  if (/流量|通讯/.test(note)) return ["其他", "通讯/流量"];
  if (/签注|手续/.test(note)) return ["其他", "签注/手续"];
  if (/书|纪念品|伴手礼/.test(note)) return ["其他", "购物"];
  return ["其他", "未分类"];
}

function seedState() {
  return {
    version: 1,
    activeProjectId: "demo-project",
    projects: [{ id: "demo-project", name: "专项账本（空白演示）", type: "other", status: "open", start: "", end: "", note: "这是空白演示项目，可自行创建旅行或奖励账本。" }],
    entries: [],
    updatedAt: new Date().toISOString()
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.projects) && Array.isArray(saved.entries)) return saved;
  } catch (error) { console.warn("专项账本读取失败", error); }
  const initial = seedState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

let state = loadState();
let filter = "all";
const $ = (selector) => document.querySelector(selector);
const money = (value, digits = 2) => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits:digits, maximumFractionDigits:digits })}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));

function saveState(message) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (message) toast(message);
}

function activeProject() {
  return state.projects.find((item) => item.id === state.activeProjectId) || state.projects[0];
}

function activeEntries() {
  const project = activeProject();
  return project ? state.entries.filter((item) => item.projectId === project.id) : [];
}

function render() {
  renderProjects();
  const project = activeProject();
  if (!project) return;
  $("#projectKind").textContent = typeLabels[project.type] || "其他专项";
  $("#projectDates").textContent = `${project.start || "—"} 至 ${project.end || "—"}`;
  $("#projectTitle").textContent = project.name;
  $("#projectSubtitle").textContent = project.note || "把相关支出、收入和估值放在同一本账里。";
  const entries = activeEntries();
  const expenses = entries.filter((e) => e.direction === "expense");
  const incomes = entries.filter((e) => e.direction === "income");
  const expenseTotal = expenses.reduce((sum, e) => sum + Number(e.baseAmount || 0), 0);
  const incomeTotal = incomes.reduce((sum, e) => sum + Number(e.baseAmount || 0), 0);
  const net = expenseTotal - incomeTotal;
  const coverage = expenseTotal ? incomeTotal / expenseTotal * 100 : 0;
  $("#expenseTotal").textContent = money(expenseTotal);
  $("#incomeTotal").textContent = money(incomeTotal);
  $("#netTotal").textContent = money(net);
  $("#coverageRate").textContent = `${coverage.toFixed(1)}%`;
  $("#expenseCount").textContent = `${expenses.length} 笔`;
  $("#incomeCount").textContent = `${incomes.length} 笔`;
  const max = Math.max(expenseTotal, incomeTotal, 1);
  $("#expenseBar").style.width = `${expenseTotal / max * 100}%`;
  $("#incomeBar").style.width = `${incomeTotal / max * 100}%`;
  $("#expenseBarValue").textContent = money(expenseTotal, 0);
  $("#incomeBarValue").textContent = money(incomeTotal, 0);
  $("#balanceInsight").textContent = net >= 0 ? `扣除返现、券和赠股估值后，本次净成本约 ${money(net)}。` : `本次收入比支出多 ${money(Math.abs(net))}。`;
  $("#valuationBadge").hidden = !incomes.some((e) => e.estimated);
  renderCategories(expenses, expenseTotal);
  renderTable(entries);
}

function renderProjects() {
  $("#projectList").innerHTML = state.projects.map((project) => {
    const count = state.entries.filter((e) => e.projectId === project.id).length;
    return `<button class="project-item ${project.id === state.activeProjectId ? "active" : ""}" data-project-id="${escapeHtml(project.id)}"><strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(typeLabels[project.type] || "其他专项")} · ${count} 条记录</span></button>`;
  }).join("");
  document.querySelectorAll("[data-project-id]").forEach((button) => button.addEventListener("click", () => { state.activeProjectId = button.dataset.projectId; saveState(); render(); }));
}

function renderCategories(expenses, total) {
  const sums = expenses.reduce((result, entry) => { result[entry.category] = (result[entry.category] || 0) + Number(entry.baseAmount || 0); return result; }, {});
  $("#categoryBars").innerHTML = Object.entries(sums).sort((a,b) => b[1]-a[1]).map(([name,value]) => `<div class="category-row"><span>${escapeHtml(name)}</span><div class="bar-track"><i style="width:${total ? value / total * 100 : 0}%"></i></div><b>${money(value, 0)}</b></div>`).join("") || "<p class='insight-line'>还没有支出。</p>";
}

function renderTable(entries) {
  const rows = entries.filter((e) => filter === "all" || e.direction === filter).sort((a,b) => String(b.date).localeCompare(String(a.date)));
  $("#entryTableBody").innerHTML = rows.map((entry) => `<tr>
    <td>${escapeHtml(entry.date)}</td><td><span class="direction-chip ${entry.direction}">${entry.direction === "income" ? "收入" : "支出"}</span></td>
    <td><strong>${escapeHtml(entry.description)}</strong></td><td>${escapeHtml(entry.category)}${entry.subcategory && entry.subcategory !== entry.category ? `<br><small>${escapeHtml(entry.subcategory)}</small>` : ""}</td>
    <td class="money">${escapeHtml(entry.currency)} ${Number(entry.amount || 0).toLocaleString("zh-CN", {maximumFractionDigits:6})}${entry.estimated ? " <span class='estimate-dot'>估</span>" : ""}</td>
    <td class="money">${money(entry.baseAmount)}</td><td><small>${escapeHtml(entry.sourceNote || "手动记录")}</small></td>
    <td class="row-actions"><button type="button" data-edit="${escapeHtml(entry.id)}">编辑</button><button type="button" data-delete="${escapeHtml(entry.id)}">删除</button></td></tr>`).join("");
  $("#emptyState").hidden = rows.length > 0;
  document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEntryDialog(button.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteEntry(button.dataset.delete)));
}

function openEntryDialog(id = "") {
  const entry = id ? state.entries.find((item) => item.id === id) : null;
  $("#entryDialogTitle").textContent = entry ? "编辑收支" : "新增收支";
  $("#entryId").value = entry?.id || "";
  $("#entryDirection").value = entry?.direction || "expense";
  $("#entryDate").value = entry?.date || activeProject()?.end || new Date().toISOString().slice(0,10);
  $("#entryDescription").value = entry?.description || "";
  $("#entryCategory").value = entry?.category || "其他";
  $("#entrySubcategory").value = entry?.subcategory || "";
  $("#entryAmount").value = entry?.amount ?? "";
  $("#entryCurrency").value = entry?.currency || "CNY";
  $("#entryRate").value = entry?.rate ?? 1;
  $("#entryEstimated").checked = Boolean(entry?.estimated);
  $("#entrySourceNote").value = entry?.sourceNote || "";
  $("#entryDialog").showModal();
}

function deleteEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry || !confirm(`删除“${entry.description}”这条记录吗？`)) return;
  state.entries = state.entries.filter((item) => item.id !== id);
  saveState("记录已删除"); render();
}

$("#entryForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#entryId").value || `entry-${Date.now()}`;
  const amount = Number($("#entryAmount").value);
  const rate = Number($("#entryRate").value);
  const entry = { id, projectId:activeProject().id, date:$("#entryDate").value, direction:$("#entryDirection").value, description:$("#entryDescription").value.trim(), category:$("#entryCategory").value.trim(), subcategory:$("#entrySubcategory").value.trim(), amount, currency:$("#entryCurrency").value, rate, baseAmount:amount * rate, estimated:$("#entryEstimated").checked, sourceNote:$("#entrySourceNote").value.trim(), source:"manual" };
  const index = state.entries.findIndex((item) => item.id === id);
  if (index >= 0) state.entries[index] = entry; else state.entries.push(entry);
  saveState("记录已保存"); $("#entryDialog").close(); render();
});

$("#projectForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const project = { id:`project-${Date.now()}`, name:$("#projectName").value.trim(), type:$("#projectType").value, status:$("#projectStatus").value, start:$("#projectStart").value, end:$("#projectEnd").value, note:"新建专项账本" };
  state.projects.push(project); state.activeProjectId = project.id; saveState("新专项已创建"); $("#projectDialog").close(); render();
});

async function refreshTravelExpenses() {
  const project = activeProject();
  if (!project || project.type !== "travel") { toast("当前不是旅行专项"); return; }
  const base = location.protocol === "file:" ? "http://localhost:4176" : "..";
  const paths = [`${base}/财务管理/手机记账同步/手机记账-全部同步.json`, `${base}/财务管理/手机记账同步/手机记账-2026-09-导入财务管理.json`];
  let records;
  for (const path of paths) {
    try { const response = await fetch(`${path}?t=${Date.now()}`, {cache:"no-store"}); if (response.ok) { const json = await response.json(); records = json.records || json; break; } } catch (_) {}
  }
  if (!Array.isArray(records)) { toast("未连接电脑接收器，保留现有数据"); return; }
  const synced = records.filter((r) => r.category === "旅行" && r.type === "expense" && r.date >= project.start && r.date <= project.end).map((r) => {
    const description = String(r.note || "旅行支出").replace(/算到旅行里面|这个算到旅行里面/g, "").trim();
    const [category, subcategory] = classify(description);
    return { id:`synced-${r.id}`, projectId:project.id, date:r.date, direction:"expense", description, category, subcategory, amount:Number(r.amount || 0), currency:"CNY", rate:1, baseAmount:Number(r.amount || 0), estimated:false, sourceNote:"手机记账 · 标签：旅行", source:"mobile-ledger" };
  });
  state.entries = state.entries.filter((e) => e.projectId !== project.id || e.direction !== "expense" || e.source !== "mobile-ledger");
  state.entries.push(...synced); saveState(`已刷新 ${synced.length} 笔旅行支出`); render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json;charset=utf-8"});
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `特殊出行与专项收支_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  toast("专项数据已导出");
}

let toastTimer;
function toast(message) { const node = $("#toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove("show"), 2600); }

document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { filter = button.dataset.filter; document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button)); render(); }));
$("#newEntryBtn").addEventListener("click", () => openEntryDialog());
$("#newProjectBtn").addEventListener("click", () => { $("#projectStart").value = new Date().toISOString().slice(0,10); $("#projectEnd").value = new Date().toISOString().slice(0,10); $("#projectDialog").showModal(); });
$("#syncTravelBtn").addEventListener("click", refreshTravelExpenses);
$("#exportBtn").addEventListener("click", exportData);
render();
