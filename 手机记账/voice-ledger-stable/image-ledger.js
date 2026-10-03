(function () {
  "use strict";

  const fileInput = document.querySelector("#billImageInput");
  const status = document.querySelector("#imageRecognitionStatus");
  const preview = document.querySelector("#imageRecognitionPreview");
  const list = document.querySelector("#imageDraftList");
  const importButton = document.querySelector("#imageImportButton");
  const maxFiles = 12;
  const maxFileBytes = 20 * 1024 * 1024;
  let drafts = [];
  let workerPromise;
  let busy = false;
  let recognitionRun = 0;
  const cancelButton = document.querySelector("#imageCancelButton");

  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  }

  function setStatus(message) {
    status.textContent = message;
  }

  function scriptLoaded() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./ocr/tesseract.min.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("本地图片识别组件未能载入"));
      document.head.appendChild(script);
    });
  }

  async function getWorker() {
    if (!workerPromise) {
      const pending = (async () => {
        await scriptLoaded();
        const root = new URL("./ocr/", location.href).href;
        return window.Tesseract.createWorker("chi_sim", 1, {
          workerPath: `${root}worker.min.js`,
          corePath: root,
          langPath: root,
          gzip: false,
          logger: (message) => {
            if (!busy || workerPromise !== pending) return;
            if (message.status === "recognizing text") setStatus(`正在识别截图文字 ${Math.round(message.progress * 100)}%…`);
            else if (message.status === "loading language traineddata") setStatus("正在准备中文识别模型…");
          },
        });
      })().catch((error) => { if (workerPromise === pending) workerPromise = null; throw error; });
      workerPromise = pending;
    }
    return workerPromise;
  }

  async function contrastImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
      const width = Math.min(1800, Math.round(image.naturalWidth * 1.4));
      const height = Math.round(image.naturalHeight * width / image.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently:true });
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const gray = pixels.data[index] * .299 + pixels.data[index + 1] * .587 + pixels.data[index + 2] * .114;
        const value = gray < 215 ? 0 : 255;
        pixels.data[index] = value;
        pixels.data[index + 1] = value;
        pixels.data[index + 2] = value;
      }
      context.putImageData(pixels, 0, 0);
      return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("无法处理截图")), "image/png"));
    } finally { URL.revokeObjectURL(url); }
  }

  function normalized(value) {
    return String(value || "").toLowerCase().replace(/[\s·・()（）\[\]【】,，.。:：-]/g, "");
  }

  function sameRecord(a, b) {
    if (!potentialDuplicate(a, b)) return false;
    if (a.sourceImageId && a.sourceImageId === b.sourceImageId && a.sourceImageRow != null && b.sourceImageRow != null) {
      return a.sourceImageRow === b.sourceImageRow;
    }
    if (a.time && b.time) return a.time === b.time;
    return Boolean(a.sourceImageId && b.sourceImageId && a.sourceImageId === b.sourceImageId
      && a.sourceImageRow != null && b.sourceImageRow != null && a.sourceImageRow === b.sourceImageRow);
  }

  function potentialDuplicate(a, b) {
    if (a.sourceImageId && a.sourceImageId === b.sourceImageId && a.sourceImageRow != null && b.sourceImageRow != null && a.sourceImageRow !== b.sourceImageRow) return false;
    if (a.date !== b.date || a.type !== b.type || Math.abs(Number(a.amount) - Number(b.amount)) > 0.001) return false;
    if (a.time && b.time && a.time !== b.time) return false;
    const left = normalized(a.note);
    const right = normalized(b.note);
    return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
  }

  function categoryFor(row) {
    if (/餐饮美食/.test(row.categoryHint || "") || /麦当劳|肯德基|汉堡|咖啡|寿司|饭|餐|外卖|奶茶|蛋糕/.test(row.note || "")) return row.type === "income" ? "其他收入" : "餐饮";
    if (/交通出行/.test(row.categoryHint || "") || /打车|车费|地铁|火车票|公交/.test(row.note || "")) return row.type === "income" ? "其他收入" : "交通";
    if (/日用百货/.test(row.categoryHint || "")) return row.type === "income" ? "其他收入" : "日用";
    const result = detectCategory(row.note || "");
    if (row.type === "income") return manualIncomeCategories.includes(result) ? result : "其他收入";
    return manualExpenseCategories.includes(result) ? result : "其他";
  }

  function makeDraft(row, file, existing) {
    const draft = {
      id: crypto.randomUUID?.() || `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName: file.name,
      platform: row.platform,
      date: row.date || "",
      time: row.time || "",
      type: row.type,
      amount: row.amount,
      category: categoryFor(row),
      note: row.note || "",
      calculation:row.calculation || "",
      warning: row.warning || "",
      sourceImageId: row.sourceImageId || "",
      sourceImageRow: row.sourceImageRow,
      selected: Boolean(validDate(row.date) && validAmount(row.amount) && row.confidence !== "review"),
    };
    if (existing.some((item) => potentialDuplicate(item, draft)) || drafts.some((item) => potentialDuplicate(item, draft))) {
      draft.selected = false;
      const exact = [...existing, ...drafts].some((item) => sameRecord(item, draft));
      draft.warning = [draft.warning, exact ? "已有同一交易，请勿重复导入" : "已有同日同额、同商户记录，但时间不完整；请核对是否另一笔交易"].filter(Boolean).join("；");
    }
    return draft;
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function validAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 && amount < 1000000 && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.00001;
  }

  async function imageFingerprint(file) {
    if (!crypto.subtle || !file.arrayBuffer) return "";
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function recognizeFiles(event) {
    if (busy) return;
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    if (files.length > maxFiles) { setStatus(`一次最多选择 ${maxFiles} 张截图。`); fileInput.value = ""; return; }
    if (files.some((file) => !file.type.startsWith("image/") || file.size > maxFileBytes)) { setStatus("请选择每张不超过 20 MB 的图片文件。"); fileInput.value = ""; return; }
    busy = true;
    const run = ++recognitionRun;
    fileInput.disabled = true;
    importButton.disabled = true;
    if (cancelButton) cancelButton.hidden = false;
    const existing = getDashboardRecords();
    let found = 0;
    let failures = 0;
    let excluded = 0;
    let duplicates = 0;
    const parsedResults = [];
    const recognizedText = [];
    try {
      const worker = await getWorker();
      if (run !== recognitionRun) return;
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setStatus(`正在识别第 ${index + 1}/${files.length} 张：${file.name}`);
        try {
          const result = await worker.recognize(file);
          if (run !== recognitionRun) return;
          setStatus(`正在补充识别第 ${index + 1}/${files.length} 张的浅色日期文字…`);
          const enhanced = await contrastImage(file);
          const secondResult = await worker.recognize(enhanced);
          if (run !== recognitionRun) return;
          recognizedText.push(`${file.name}\n原图文字：\n${result.data.text || ""}\n浅色文字补读：\n${secondResult.data.text || ""}`);
          document.querySelector("#imageRecognitionText").hidden = false;
          document.querySelector("#imageRecognitionRawText").textContent = recognizedText.join("\n\n");
          const parsed = window.ImageLedgerParser.parse(result.data.text || "", {
            fileName:file.name,
            year:new Date(file.lastModified || Date.now()).getFullYear(),
            capturedAt:file.lastModified || Date.now(),
            secondaryText:secondResult.data.text || "",
          });
          const sourceImageId = await imageFingerprint(file);
          if (run !== recognitionRun) return;
          parsed.rows.forEach((row, rowIndex) => { row.imageFile = file; row.sourceImageId = sourceImageId; row.sourceImageRow = rowIndex; });
          parsedResults.push(parsed);
        } catch (error) {
          if (run !== recognitionRun) return;
          console.warn("截图识别失败", file.name, error);
          failures += 1;
        }
      }
      const merged = window.ImageLedgerParser.mergeResults(parsedResults);
      merged.rows.forEach((row) => {
        const draft = makeDraft(row, row.imageFile || files[0], existing);
        if (drafts.some((item) => sameRecord(item, draft))) { duplicates += 1; return; }
        drafts.push(draft);
        found += 1;
      });
      excluded = merged.skipped.length;
      render();
      setStatus(found || duplicates ? `本次识别 ${found + duplicates} 笔，新增 ${found} 笔${duplicates ? `，${duplicates} 笔已在待核对列表中` : ""}${excluded ? `，已自动跳过 ${excluded} 笔内部划转或退款` : ""}${failures ? `，${failures} 张截图识别失败` : ""}。请核对后导入。` : "没有识别出明确交易。可以尝试更清晰的账单截图，或在手动记账中录入。");
    } catch (error) {
      if (run !== recognitionRun) return;
      console.error("图片识别不可用", error);
      setStatus("图片识别组件尚未准备好。请联网打开应用一次后重试；手动和语音记账仍可照常使用。");
    } finally {
      if (run === recognitionRun) {
        busy = false;
        fileInput.disabled = false;
        fileInput.value = "";
        if (cancelButton) cancelButton.hidden = true;
        render();
      }
    }
  }

  function cancelRecognition() {
    if (!busy) return;
    recognitionRun += 1;
    const pending = workerPromise;
    workerPromise = null;
    if (pending) pending.then((worker) => worker.terminate()).catch(() => {});
    busy = false;
    fileInput.disabled = false;
    fileInput.value = "";
    if (cancelButton) cancelButton.hidden = true;
    render();
    setStatus("已取消本次图片识别，已有待核对记录保留。");
  }

  function optionsFor(type, current) {
    const categories = type === "income" ? [...manualIncomeCategories, "其他收入"] : [...manualExpenseCategories];
    if (current && !categories.includes(current)) categories.push(current);
    return categories.map((category) => `<option value="${escape(category)}" ${category === current ? "selected" : ""}>${escape(category)}</option>`).join("");
  }

  function render() {
    preview.hidden = drafts.length === 0;
    document.querySelector("#imagePreviewTitle").textContent = `识别结果 · ${drafts.length} 笔`;
    const selected = drafts.filter((draft) => draft.selected).length;
    const cents = drafts.filter((draft) => draft.selected && validAmount(draft.amount)).reduce((sum, draft) => sum + Math.round(Number(draft.amount) * 100), 0);
    document.querySelector("#imagePreviewSummary").textContent = `已选 ${selected} 笔 · 合计 ¥${(cents / 100).toFixed(2)}`;
    importButton.textContent = `一键导入 ${selected} 笔`;
    importButton.disabled = busy || selected === 0;
    list.innerHTML = drafts.map((draft) => `<article class="image-draft ${draft.warning ? "needs-review" : ""}" data-image-id="${escape(draft.id)}">
      <div class="image-draft-top"><label><input type="checkbox" data-field="selected" ${draft.selected ? "checked" : ""}><span>${escape(draft.platform)} · ${escape(draft.fileName)}</span></label><button type="button" data-image-remove="${escape(draft.id)}">移除</button></div>
      <div class="image-draft-grid">
        <label>收支<select data-field="type"><option value="expense" ${draft.type === "expense" ? "selected" : ""}>支出</option><option value="income" ${draft.type === "income" ? "selected" : ""}>收入</option></select></label>
        <label>科目<select data-field="category">${optionsFor(draft.type, draft.category)}</select></label>
        <label>金额（元）<input data-field="amount" type="number" min="0.01" max="999999.99" step="0.01" inputmode="decimal" value="${validAmount(draft.amount) ? Number(draft.amount).toFixed(2) : escape(draft.amount)}"></label>
        <label>日期<input data-field="date" type="date" value="${escape(draft.date)}"></label>
        <label>时间<input data-field="time" type="time" value="${escape(draft.time)}"></label>
        <label class="image-note-field">商户 / 备注<input data-field="note" type="text" value="${escape(draft.note)}"></label>
      </div>
      ${draft.warning || draft.calculation ? `<p class="image-draft-meta">${escape([draft.calculation ? `合并计算：${draft.calculation}` : "", draft.warning].filter(Boolean).join(" · "))}</p>` : ""}
    </article>`).join("");
  }

  function clearDrafts() {
    cancelRecognition();
    drafts = [];
    document.querySelector("#imageRecognitionText").hidden = true;
    document.querySelector("#imageRecognitionRawText").textContent = "";
    fileInput.value = "";
    render();
    setStatus("本次识别已清空。选择截图后可重新识别。");
  }

  function updateDraft(event) {
    const card = event.target.closest("[data-image-id]");
    if (!card) return;
    const draft = drafts.find((item) => item.id === card.dataset.imageId);
    const field = event.target.dataset.field;
    if (!draft || !["selected", "amount", "type", "category", "date", "time", "note"].includes(field)) return;
    draft[field] = field === "selected" ? event.target.checked : field === "amount" ? Number(event.target.value) : event.target.value;
    if (field === "type") draft.category = categoryFor(draft);
    if (field === "date" && validDate(draft.date)) {
      draft.warning = draft.warning.split("；").filter((warning) => !/^(未识别日期|日期仅按相邻交易推断|两次识别日期不一致|截图未含年份)/.test(warning)).join("；");
    }
    render();
  }

  function importSelected() {
    if (busy) { setStatus("图片仍在识别，请等待完成后再导入。"); return; }
    const selected = drafts.filter((draft) => draft.selected);
    if (!selected.length) { setStatus("请先勾选要导入的记录。"); return; }
    const invalid = selected.find((draft) => !validDate(draft.date) || !validAmount(draft.amount) || !draft.note.trim()
      || !["income", "expense"].includes(draft.type) || (draft.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.time)));
    if (invalid) { setStatus("请核对选中记录：日期必须有效，金额须大于零且最多两位小数，商户备注不能为空，时间应为小时和分钟。"); return; }
    if (selected.some((draft) => !(draft.type === "income" ? [...manualIncomeCategories, "其他收入"] : manualExpenseCategories).includes(draft.category))) {
      setStatus("选中记录的科目无效，请重新选择科目。"); return;
    }
    const existing = getDashboardRecords();
    const records = loadRecords();
    const now = new Date().toISOString();
    const toAdd = [];
    for (const draft of selected) {
      if (existing.some((item) => sameRecord(item, draft)) || toAdd.some((item) => sameRecord(item, draft))) continue;
      toAdd.push({
        id:crypto.randomUUID?.() || `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type:draft.type,
        category:draft.category,
        icon:iconMap[draft.category] || "＋",
        amount:Math.round(Number(draft.amount) * 100) / 100,
        date:draft.date,
        time:draft.time || "",
        note:draft.note.trim(),
        source:"图片识别记账",
        sourcePlatform:draft.platform,
        sourceImageId:draft.sourceImageId || "",
        sourceImageRow:draft.sourceImageRow,
        createdAt:now,
        updatedAt:now,
      });
    }
    if (!toAdd.length) { setStatus("选中的记录都已在账本中，没有重复导入。"); return; }
    try { saveRecords([...toAdd, ...records]); }
    catch (error) { console.warn("图片记账保存失败", error); setStatus("手机存储空间不足，未导入任何记录。请先导出或同步账本。"); return; }
    const month = toAdd.map((item) => item.date.slice(0, 7)).sort().at(-1);
    drafts = drafts.filter((draft) => !selected.includes(draft));
    render();
    detailsState.month = month;
    renderDashboard();
    openDashboardView("detailsView");
    setStatus(`已导入 ${toAdd.length} 笔，重复记录已跳过。`);
    showToast(`已导入 ${toAdd.length} 笔图片账单`);
    syncToComputer(false);
  }

  fileInput.addEventListener("change", recognizeFiles);
  list.addEventListener("change", updateDraft);
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-image-remove]");
    if (!button) return;
    drafts = drafts.filter((draft) => draft.id !== button.dataset.imageRemove);
    render();
  });
  document.querySelector("#imageClearButton").addEventListener("click", clearDrafts);
  importButton.addEventListener("click", importSelected);
  if (cancelButton) cancelButton.addEventListener("click", cancelRecognition);
  window.addEventListener("pagehide", cancelRecognition);
  render();
})();
