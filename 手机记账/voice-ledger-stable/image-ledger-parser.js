(function (root) {
  "use strict";

  const amountPattern = /(?:[¥￥]\s*|(?<!\d)[+−–—-]\s*)(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)(?![\d.]|,\d)|(?<![\d.])(\d{1,6}(?:,\d{3})*\.\d{1,2})(?![\d.]|,\d)/g;
  const ignoreAmountLine = /余额|账单总计|收支统计|本月|本年|资产|可用额度|优惠|折扣|积分|手续费|银行卡尾号|交易单号|订单编号|客服|账单明细|账单列表|支出.*收入|收入.*支出/;
  const detailHint = /账单详情|交易详情|订单详情|支付成功|付款成功|收款成功|转账详情|退款详情/;
  const merchantLabel = /^(?:商品说明|商品名称|交易对象|收款方|付款方|商户|交易内容|交易对方|付款给|收款人|转账给|备注)\s*[:：]?\s*(.*)$/;
  const noisyLine = /^(?:支付宝|微信支付|微信|账单|交易记录|交易详情|账单详情|付款成功|支付成功|收款成功|全部|支出|收入|筛选|搜索|明细|查看更多|完成|返回|今天|昨天|前天|时间|支付方式|交易时间|创建时间|当前状态|订单号|交易单号|收款方|付款方|商品说明|金额|零钱|余额|银行卡|月账单|查看详情)$/;

  function cleanLine(value) {
    return String(value || "").replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
      .replace(/[：﹕]/g, ":").replace(/[．。](?=\d)/g, ".").replace(/[﹣－]/g, "-")
      .replace(/(\d)\s*\.\s*(?=\d)/g, "$1.")
      .replace(/[\u200b-\u200d]/g, "").replace(/[|｜]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function withoutDateWarning(value) {
    return String(value || "").split("；").filter((item) => item && item !== "未识别日期，请核对" && item !== "日期仅按相邻交易推断，请核对").join("；");
  }

  function mergeWarnings(...values) {
    return [...new Set(values.flatMap((value) => String(value || "").split("；")).filter(Boolean))].join("；");
  }

  function needsReview(warning) {
    return String(warning || "").split("；").some((item) => item && !/^截图未含年份，按\d{4}年补全，请核对$/.test(item) && item !== "相对日期按截图文件时间推算");
  }

  function dateInfoFromLine(input, fallbackYear) {
    const chineseNumber = (value) => {
      const digits = { "〇":0, "零":0, "一":1, "二":2, "两":2, "三":3, "四":4, "五":5, "六":6, "七":7, "八":8, "九":9 };
      if (!value.includes("十")) return [...value].map((char) => digits[char]).join("");
      const [tens, ones] = value.split("十");
      return String((tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0));
    };
    const line = cleanLine(input).replace(/([二一][〇零一二三四五六七八九]{3})\s*年/g, (_, year) => `${chineseNumber(year)}年`)
      .replace(/([一二两三四五六七八九十]{1,3})\s*月\s*([一二两三四五六七八九十]{1,3})\s*([日曰目号])/g, (_, month, day, suffix) => `${chineseNumber(month)}月${chineseNumber(day)}${suffix}`);
    const iso = line.match(/(?<!\d)(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?!\d)\s*[日曰目号]?/);
    const short = !iso && line.match(/(?:^|\s)(\d{1,2})\s*([-/.月])\s*(\d{1,2})(?!\d)\s*[日曰目号]?/);
    const year = iso ? Number(iso[1]) : fallbackYear;
    const month = Number(iso ? iso[2] : short?.[1]);
    const day = Number(iso ? iso[3] : short?.[3]);
    if (!month || !day) return null;
    // A bare decimal next to a merchant is money, not a month/day heading.
    if (short && short[2] === "." && !/[日曰目号]/.test(short[0]) && !/\d\s*:\s*\d/.test(line.slice(short.index + short[0].length))) return null;
    const value = new Date(year, month - 1, day);
    if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== day) return null;
    const match = iso || short;
    return { date:`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, explicitYear:Boolean(iso), start:match.index, end:match.index + match[0].length };
  }

  function dateFromLine(line, fallbackYear) {
    return dateInfoFromLine(line, fallbackYear)?.date || "";
  }

  function inferredYearWarning(line, options) {
    const info = dateInfoFromLine(line, options.year || new Date().getFullYear());
    return info && !info.explicitYear ? `截图未含年份，按${options.year || new Date().getFullYear()}年补全，请核对` : "";
  }

  function relativeDate(line, capturedAt) {
    const match = line.match(/(?:^|\s)(今天|昨天|前天)\s*\d{0,2}:?\d{0,2}/);
    if (!match) return "";
    const base = new Date(capturedAt || Date.now());
    if (Number.isNaN(base.getTime())) return "";
    base.setHours(12, 0, 0, 0);
    base.setDate(base.getDate() - ({ 今天:0, 昨天:1, 前天:2 }[match[1]] || 0));
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  }

  function rowDate(line, options) {
    return dateFromLine(line, options.year || new Date().getFullYear()) || relativeDate(line, options.capturedAt);
  }

  function rowTime(line) {
    const match = cleanLine(line).match(/(?<!\d)([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?!\d)/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
  }

  function amountsFromLine(line) {
    line = cleanLine(line);
    if (ignoreAmountLine.test(line)) return [];
    const date = dateInfoFromLine(line, new Date().getFullYear());
    return [...line.matchAll(amountPattern)].map((match) => ({
      amount: Number((match[1] || match[2]).replaceAll(",", "")),
      raw: match[0],
      index: match.index,
    })).filter((item) => item.amount > 0 && item.amount < 1000000 && (!date || item.index >= date.end || item.index + item.raw.length <= date.start));
  }

  function stripAmount(line) {
    let value = cleanLine(line);
    amountsFromLine(value).reverse().forEach((amount) => { value = `${value.slice(0, amount.index)} ${value.slice(amount.index + amount.raw.length)}`; });
    return cleanLine(value.replace(/^[+−–—-]\s*/, ""));
  }

  function merchantFromNearby(lines, index) {
    let current = stripAmount(lines[index]);
    const currentDate = dateInfoFromLine(current, new Date().getFullYear());
    if (currentDate) current = `${current.slice(0, currentDate.start)} ${current.slice(currentDate.end)}`;
    current = cleanLine(current.replace(/(?<!\d)([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?::[0-5]\d)?(?!\d)/g, " ")
      .replace(/(?:^|\s)(今天|昨天|前天)(?=\s|$)/g, " "))
      .replace(/^[^\p{L}\p{N}]+/u, "").replace(/^(?:[台所侣显后受本人候修]|[A-Za-z]{1,3})\s+(?=[\p{L}])/u, "");
    if (current && !noisyLine.test(current) && !ignoreAmountLine.test(current) && !dateFromLine(current, new Date().getFullYear()) && !/^\d{1,2}:\d{2}/.test(current)) return current;
    for (let offset = 1; offset <= 3; offset += 1) {
      const candidate = cleanLine(lines[index - offset]);
      if (!candidate || noisyLine.test(candidate) || ignoreAmountLine.test(candidate) || dateFromLine(candidate, new Date().getFullYear()) || /^\d{1,2}:\d{2}/.test(candidate) || amountsFromLine(candidate).length) continue;
      return candidate;
    }
    return "";
  }

  function detectDirection(text, amountRaw) {
    if (/^[+]/.test(amountRaw.trim())) return "income";
    if (/^[−–—-]/.test(amountRaw.trim())) return "expense";
    if (/退款|收入|收款成功|收款到账|转入|到账|收到|入账/.test(text)) return "income";
    return "expense";
  }

  function parseDetail(lines, platform, fallbackYear) {
    const labelledMerchant = lines.map((line) => line.match(merchantLabel)).find((match) => match && match[1]);
    const datedLine = lines.find((line) => dateFromLine(line, fallbackYear));
    const date = datedLine ? dateFromLine(datedLine, fallbackYear) : "";
    const candidates = lines.flatMap((line, index) => amountsFromLine(line).map((item) => ({ ...item, line, index })));
    const priority = (candidate) => {
      if (/实付|付款金额|收款金额|入账金额|退款金额|交易金额|支付金额/.test(candidate.line)) return 0;
      if (/^\s*[¥￥+−–—-]/.test(candidate.line)) return 1;
      return 2;
    };
    candidates.sort((a, b) => priority(a) - priority(b) || a.index - b.index);
    const selected = candidates[0];
    if (!selected) return [];
    const merchant = cleanLine(labelledMerchant?.[1] || merchantFromNearby(lines, selected.index) || "账单交易");
    const context = `${lines.slice(0, Math.min(12, lines.length)).join(" ")} ${selected.line}`;
    return [{ date, time:rowTime(datedLine || ""), amount:selected.amount, amountRaw:selected.raw, type:detectDirection(context, selected.raw), note:merchant, platform, confidence:date && merchant !== "账单交易" ? "medium" : "review", warning:date ? inferredYearWarning(datedLine, { year:fallbackYear }) : "未识别日期，请核对" }];
  }

  function parseList(lines, platform, options) {
    const result = [];
    let currentDate = "";
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const date = rowDate(line, options);
      if (date) currentDate = date;
      if (/^已退款|^退款中/.test(line) && !/\+\s*\d/.test(line)) continue;
      const candidates = amountsFromLine(line);
      if (!candidates.length) continue;
      const selected = { ...candidates[0] };
      const merchant = merchantFromNearby(lines, index);
      if (!merchant) continue;
      let amountWarning = "";
      if (/^\+\s*0\d{2}$/.test(selected.raw) && /红包/.test(merchant)) {
        selected.amount = selected.amount / 100;
        amountWarning = "小数点识别不清，请核对金额";
      }
      const localText = `${lines.slice(Math.max(0, index - 1), index + 3).join(" ")}`;
      const nextDatedLine = lines.slice(index + 1, index + 4).find((item) => rowDate(item, options));
      const nextDate = nextDatedLine ? rowDate(nextDatedLine, options) : "";
      const finalDate = date || nextDate || currentDate;
      const dateEvidence = date || nextDate ? "explicit" : finalDate ? "context" : "missing";
      const time = rowTime(date ? line : nextDatedLine || "");
      const yearWarning = inferredYearWarning(date ? line : nextDatedLine || "", options);
      const categoryHint = lines.slice(index + 1, index + 3).find((item) => /餐饮美食|交通出行|日用百货|文化休闲|投资理财|退款/.test(item)) || "";
      const relativeWarning = /今天|昨天|前天/.test(lines.slice(index, index + 4).join(" ")) ? "相对日期按截图文件时间推算" : "";
      let fullRefund = false;
      for (const nextLine of lines.slice(index + 1, index + 5)) {
        if (/全\s*额\s*退\s*款/.test(nextLine)) { fullRefund = true; break; }
        if (amountsFromLine(nextLine).length || rowDate(nextLine, options)) break;
      }
      result.push({ date:finalDate, dateEvidence, time, amount:selected.amount, amountRaw:selected.raw, type:detectDirection(`${merchant} ${localText}`, selected.raw), note:merchant, categoryHint, platform, fullRefund, confidence:finalDate && !amountWarning && dateEvidence === "explicit" ? "medium" : "review", warning:[dateEvidence === "missing" ? "未识别日期，请核对" : dateEvidence === "context" ? "日期仅按相邻交易推断，请核对" : "", amountWarning, relativeWarning, yearWarning].filter(Boolean).join("；") });
    }
    return result;
  }

  function excludedReason(row) {
    const note = String(row.note || "").replace(/\s/g, "");
    if (/余[额利]宝|鱼儿宝|零钱通|零钱自动转入|转入零钱|从零钱转入/.test(note)) return "内部资金划转";
    return "";
  }

  function refundBase(note) {
    return cleanLine(note).replace(/^(?:[台所侣显后受本人候修]|[A-Za-z]{1,3})\s+(?=[\p{L}])/u, "").replace(/[-－—]?(?:退款|退回|退货)(?:成功)?[-－—]?/g, "").replace(/[（(].*?[）)]/g, "").replace(/^[\s:：-]+|[\s:：-]+$/g, "").replace(/[\s.,，。·…“”'‘’]/g, "");
  }

  function similarMerchant(left, right) {
    const a = refundBase(left).replace(/^[A-Za-z]{1,3}(?=[\u4e00-\u9fff])/, "");
    const b = refundBase(right).replace(/^[A-Za-z]{1,3}(?=[\u4e00-\u9fff])/, "");
    return a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));
  }

  function overlappingMerchant(left, right) {
    if (similarMerchant(left, right)) return true;
    const a = [...refundBase(left)];
    const b = [...refundBase(right)];
    return a.length >= 4 && a.length === b.length && a.filter((char, index) => char !== b[index]).length === 1;
  }

  function longestCommonPart(left, right) {
    const a = refundBase(left);
    const b = refundBase(right);
    let best = 0;
    for (let start = 0; start < a.length; start += 1) {
      for (let end = start + best + 1; end <= a.length; end += 1) {
        if (b.includes(a.slice(start, end))) best = end - start;
      }
    }
    return best;
  }

  function dateAnchors(lines, options) {
    const anchors = [];
    lines.forEach((line, index) => {
      const date = rowDate(line, options);
      if (!date) return;
      for (let previous = index - 1; previous >= Math.max(0, index - 3); previous -= 1) {
        const candidate = stripAmount(lines[previous]).replace(/^[^\p{L}\p{N}]+/u, "").replace(/^(?:[台所侣显后受本人候修]|[A-Za-z]{1,3})\s+(?=[\p{L}])/u, "");
        if (!candidate || noisyLine.test(candidate) || ignoreAmountLine.test(candidate) || /^已退款/.test(candidate) || rowDate(candidate, options)) continue;
        anchors.push({ date, time:rowTime(line), note:candidate, warning:inferredYearWarning(line, options) });
        break;
      }
    });
    return anchors;
  }

  function netRefunds(rows, skipped) {
    const grouped = new Map();
    rows.forEach((row) => {
      const key = `${row.platform}|${row.date}|${refundBase(row.note)}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });
    return [...grouped.values()].flatMap((group) => {
      const refunds = group.filter((row) => row.type === "income" && /退款|退回|退货/.test(row.note));
      const expenses = group.filter((row) => row.type === "expense");
      if (!refunds.length || !expenses.length) return group;
      const paid = expenses.reduce((sum, row) => sum + row.amount, 0);
      const refunded = refunds.reduce((sum, row) => sum + row.amount, 0);
      const net = Math.round((paid - refunded) * 100) / 100;
      const main = expenses[0];
      if (net === 0) {
        if (skipped) group.forEach((row) => skipped.push({ reason:"已全额退款", date:row.date, platform:row.platform, note:row.note, amount:row.amount, type:row.type }));
        return [];
      }
      return [{
        ...main,
        type:net < 0 ? "income" : "expense",
        amount:Math.abs(net),
        note:refundBase(main.note),
        calculation:`${expenses.map((row) => row.amount.toFixed(2)).join(" + ")} − ${refunds.map((row) => row.amount.toFixed(2)).join(" − ")} = ${Math.abs(net).toFixed(2)}`,
        warning:[...new Set(group.flatMap((row) => String(row.warning || "").split("；")).filter(Boolean))].join("；"),
        confidence:group.some((row) => row.confidence === "review") ? "review" : main.confidence,
      }];
    }).filter((row) => row.amount > 0);
  }

  function attachUndatedRefundChain(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const key = `${row.platform}|${refundBase(row.note)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    groups.forEach((group) => {
      const undatedExpenses = group.filter((row) => row.type === "expense" && !row.date && !row.dateConflict);
      const datedExpenses = group.filter((row) => row.type === "expense" && row.date && row.dateEvidence === "explicit");
      const datedRefunds = group.filter((row) => row.type === "income" && /退款|退回|退货/.test(row.note) && row.date && row.dateEvidence === "explicit");
      const dates = new Set(group.filter((row) => row.date).map((row) => row.date));
      if (!undatedExpenses.length || !datedExpenses.length || !datedRefunds.length || dates.size !== 1) return;
      if (group.some((row) => row.date && row.dateEvidence !== "explicit")) return;
      if (group.some((row) => row.type === "income" && /退款|退回|退货/.test(row.note) && !row.date)) return;
      const expenses = group.filter((row) => row.type === "expense");
      if (undatedExpenses.some((row) => expenses.some((other) => other !== row && Math.abs(other.amount - row.amount) < 0.001))) return;
      const [date] = dates;
      undatedExpenses.forEach((row) => {
        row.date = date;
        row.dateEvidence = "refund-chain";
        row.warning = [withoutDateWarning(row.warning), "日期按同截图退款链补全，请核对"].filter(Boolean).join("；");
        row.confidence = "medium";
      });
    });
  }

  function sameRefundTransaction(expense, refund) {
    const daysApart = expense.date && refund.date ? Math.abs((Date.parse(`${refund.date}T12:00:00`) - Date.parse(`${expense.date}T12:00:00`)) / 86400000) : 0;
    return expense.type === "expense" && refund.type === "income" && /退款|退回|退货/.test(refund.note)
      && expense.platform === refund.platform && Math.abs(expense.amount - refund.amount) < 0.001
      && daysApart <= 90
      && similarMerchant(expense.note, refund.note);
  }

  function uniqueRows(rows, origins) {
    const unique = [];
    const seenOrigins = new WeakMap();
    rows.forEach((row) => {
      // A missing date must never make two same-merchant payments look identical.
      if (!row.date || row.dateEvidence === "context") { unique.push(row); return; }
      const origin = origins?.get(row);
      // Keep each visible occurrence within a screenshot. Only an exact time can
      // prove overlap between separate screenshots; date/merchant/amount cannot.
      const previous = row.time && unique.find((item) => item.date && item.dateEvidence !== "context" && item.date === row.date && item.time === row.time && item.type === row.type && Math.abs(item.amount - row.amount) < 0.001 && item.platform === row.platform && overlappingMerchant(item.note, row.note) && (!origins || !seenOrigins.get(item)?.has(origin)));
      if (!previous) { unique.push(row); seenOrigins.set(row, new Set([origin])); return; }
      seenOrigins.get(previous)?.add(origin);
      if (refundBase(previous.note) !== refundBase(row.note)) {
        const warning = "重叠截图的商户名称识别不一致，请核对备注";
        previous.confidence = "review";
        previous.warning = previous.warning?.includes(warning) ? previous.warning : [previous.warning, warning].filter(Boolean).join("；");
      }
    });
    return unique;
  }

  function flagUnmatchedRefunds(rows) {
    return rows.map((row) => {
      if (row.type !== "income" || !/退款|退回|退货/.test(row.note)) return row;
      const warning = "只识别到退款，未找到原支出；请核对后再决定是否导入";
      return { ...row, confidence:"review", warning:row.warning?.includes(warning) ? row.warning : [row.warning, warning].filter(Boolean).join("；") };
    });
  }

  function reconcileRows(rows, previousSkips = [], options = {}) {
    const skipped = [...previousSkips];
    const unique = options.skipDedup ? rows : uniqueRows(rows, options.origins);
    const fullExpenses = unique.filter((row) => row.type === "expense" && row.fullRefund);
    const pairedRefunds = new Set();
    fullExpenses.forEach((expense) => {
      unique.forEach((refund) => { if (sameRefundTransaction(expense, refund)) pairedRefunds.add(refund); });
    });
    const eligible = unique.filter((row) => {
      const reason = row.type === "expense" && row.fullRefund ? "已全额退款" : pairedRefunds.has(row) ? "已全额退款" : excludedReason(row);
      if (!reason) return true;
      skipped.push({ reason, date:row.date, platform:row.platform, note:row.note, amount:row.amount, type:row.type });
      return false;
    });
    return { rows:flagUnmatchedRefunds(netRefunds(eligible, skipped)), skipped };
  }

  function mergeResults(results) {
    const origins = new WeakMap();
    results.forEach((result, index) => (result.rows || []).forEach((row) => origins.set(row, index)));
    const rows = results.flatMap((result) => result.rows || []);
    const skipped = results.flatMap((result) => result.skipped || []);
    const fullExpenses = skipped.filter((item) => item.reason === "已全额退款" && item.type === "expense");
    const unpaired = rows.filter((row) => {
      if (!fullExpenses.some((expense) => sameRefundTransaction(expense, row))) return true;
      skipped.push({ reason:"已全额退款", date:row.date, platform:row.platform, note:row.note, amount:row.amount, type:row.type });
      return false;
    });
    const merged = reconcileRows(unpaired, skipped, { origins });
    const uniqueSkipped = [];
    merged.skipped.forEach((item) => {
      if (!uniqueSkipped.some((previous) => previous.reason === item.reason && previous.date === item.date && previous.platform === item.platform && previous.type === item.type && Math.abs(previous.amount - item.amount) < 0.001 && similarMerchant(previous.note, item.note))) uniqueSkipped.push(item);
    });
    merged.skipped = uniqueSkipped;
    return merged;
  }

  function parse(text, options = {}) {
    const lines = String(text || "").split(/\r?\n/).map(cleanLine).filter(Boolean);
    const fallbackYear = Number(options.year) || new Date().getFullYear();
    const platform = /支付宝|搜索交易记录/.test(text) || /alipay/i.test(options.fileName || "") ? "支付宝" : /微信|全部账单|查找交易/.test(text) || /wechat|weixin/i.test(options.fileName || "") ? "微信" : "账单截图";
    const detail = detailHint.test(lines.slice(0, 12).join(" "));
    const rows = detail ? parseDetail(lines, platform, fallbackYear) : parseList(lines, platform, { ...options, year:fallbackYear });
    if (detail && options.secondaryText) {
      const secondaryLines = String(options.secondaryText).split(/\r?\n/).map(cleanLine).filter(Boolean);
      const secondary = parseDetail(secondaryLines, platform, fallbackYear)[0];
      if (!rows.length && secondary) rows.push(secondary);
      else if (rows.length) {
        const row = rows[0];
        const datedLine = secondaryLines.find((line) => rowDate(line, { ...options, year:fallbackYear }));
        const secondaryDate = datedLine ? rowDate(datedLine, { ...options, year:fallbackYear }) : "";
        if (!row.date && secondaryDate) {
          row.date = secondaryDate;
          row.time = rowTime(datedLine);
          row.warning = mergeWarnings(withoutDateWarning(row.warning), inferredYearWarning(datedLine, { year:fallbackYear }));
        } else if (row.date && secondaryDate && row.date !== secondaryDate) {
          row.warning = mergeWarnings(row.warning, "两次识别日期不一致，请手动核对");
        } else if (!row.time && datedLine) row.time = rowTime(datedLine);
        if (secondary) {
          if (row.note === "账单交易" && secondary.note !== "账单交易") row.note = secondary.note;
          if (Math.abs(row.amount - secondary.amount) > 0.001) {
            const previousAmount = row.amount;
            if (!/\d\.\d{1,2}/.test(row.amountRaw || "") && /\d\.\d{1,2}/.test(secondary.amountRaw || "")) {
              row.amount = secondary.amount;
              row.amountRaw = secondary.amountRaw;
            }
            row.warning = mergeWarnings(row.warning, `两次识别金额不一致（${previousAmount.toFixed(2)} / ${secondary.amount.toFixed(2)}），请核对金额`);
          }
        }
        row.confidence = row.date && row.note !== "账单交易" && !needsReview(row.warning) ? "medium" : "review";
      }
    }
    if (!detail && options.secondaryText) {
      const secondaryLines = String(options.secondaryText).split(/\r?\n/).map(cleanLine).filter(Boolean);
      const dated = dateAnchors(secondaryLines, { ...options, year:fallbackYear });
      const secondaryRows = parseList(secondaryLines, platform, { ...options, year:fallbackYear });
      const secondaryFullRefunds = secondaryRows.filter((row) => row.type === "expense" && row.fullRefund);
      secondaryFullRefunds.forEach((candidate) => {
        const primary = rows.find((row) => row.type === "expense" && row.amount === candidate.amount && similarMerchant(row.note, candidate.note));
        if (primary) primary.fullRefund = true;
      });
      // Align all occurrences in screenshot order, including already-dated ones.
      // This prevents two equal payments on different days from sharing one date.
      const usedSecondary = new Set();
      const secondaryToPrimary = new Map();
      const compatiblePosition = (row, candidate) => candidate.type === row.type && similarMerchant(candidate.note, row.note)
        && (!row.time || !candidate.time || row.time === candidate.time)
        && (!row.date || !candidate.date || row.dateEvidence === "context" || candidate.dateEvidence === "context" || row.date === candidate.date);
      rows.forEach((row) => {
        let index = secondaryRows.findIndex((candidate, candidateIndex) => !usedSecondary.has(candidateIndex)
          && compatiblePosition(row, candidate) && Math.abs(candidate.amount - row.amount) < 0.001);
        let amountConflict = false;
        let ambiguousConflict = false;
        let dateConflict = false;
        if (index < 0 && row.date && row.dateEvidence !== "context" && row.time) {
          const sameIdentity = (candidate) => candidate.type === row.type && similarMerchant(candidate.note, row.note)
            && candidate.time === row.time && Math.abs(candidate.amount - row.amount) < 0.001;
          const conflictingDates = secondaryRows.map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
            .filter(({ candidate, candidateIndex }) => !usedSecondary.has(candidateIndex) && sameIdentity(candidate)
              && candidate.date && candidate.dateEvidence !== "context" && candidate.date !== row.date);
          if (conflictingDates.length === 1 && rows.filter(sameIdentity).length === 1) {
            index = conflictingDates[0].candidateIndex;
            dateConflict = true;
            row.warning = mergeWarnings(withoutDateWarning(row.warning), `两次识别日期不一致（${row.date} / ${conflictingDates[0].candidate.date}），请手动核对`);
            row.date = "";
            row.dateEvidence = "missing";
            row.dateConflict = true;
            row.confidence = "review";
          }
        }
        if (index < 0) {
          const possible = secondaryRows.map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
            .filter(({ candidate, candidateIndex }) => !usedSecondary.has(candidateIndex) && compatiblePosition(row, candidate));
          const primaryPeers = rows.filter((other) => compatiblePosition(other, row));
          // An unambiguous occurrence may reconcile a lost decimal. Without an
          // exact time or unique merchant occurrence, do not guess which payment.
          const exactTime = row.time && possible.filter(({ candidate }) => candidate.time === row.time);
          const conflict = exactTime?.length === 1 ? exactTime[0] : possible.length === 1 && primaryPeers.length === 1 ? possible[0] : null;
          if (conflict) { index = conflict.candidateIndex; amountConflict = true; }
          else if (possible.length) {
            // Preserve the original visible occurrences, rather than appending
            // an extra possibly false payment when the OCR amounts disagree.
            index = possible[0].candidateIndex;
            amountConflict = true;
            ambiguousConflict = true;
          }
        }
        if (index < 0) return;
        usedSecondary.add(index);
        secondaryToPrimary.set(index, row);
        const candidate = secondaryRows[index];
        if (amountConflict) {
          const before = row.amount;
          const primaryDecimal = /\d\.\d{1,2}/.test(row.amountRaw || "");
          const secondaryDecimal = /\d\.\d{1,2}/.test(candidate.amountRaw || "");
          if (!ambiguousConflict && secondaryDecimal && !primaryDecimal) { row.amount = candidate.amount; row.amountRaw = candidate.amountRaw; }
          row.warning = mergeWarnings(row.warning, `两次识别金额不一致（${before.toFixed(2)} / ${candidate.amount.toFixed(2)}）${ambiguousConflict ? "，交易无法唯一对应" : ""}，请核对金额`);
          row.confidence = "review";
        }
        if (!dateConflict && candidate.date && (!row.date || row.dateEvidence === "context")) {
          if (row.dateEvidence === "context" && candidate.dateEvidence === "context" && row.date !== candidate.date) {
            row.date = "";
            row.dateEvidence = "missing";
            row.warning = [withoutDateWarning(row.warning), "两次识别日期不一致，请手动核对"].filter(Boolean).join("；");
            row.confidence = "review";
          } else if (!row.date || candidate.dateEvidence === "explicit") {
            row.date = candidate.date;
            row.dateEvidence = candidate.dateEvidence;
            row.warning = mergeWarnings(withoutDateWarning(row.warning), candidate.warning);
            if (candidate.dateEvidence === "context") row.warning = [row.warning, "日期仅按相邻交易推断，请核对"].filter(Boolean).join("；");
            row.confidence = needsReview(row.warning) ? "review" : "medium";
          }
        }
        if (!row.time && candidate.time && row.date === candidate.date) row.time = candidate.time;
      });
      const used = new Set();
      rows.filter((row) => row.date).forEach((row) => {
        const index = dated.findIndex((candidate, candidateIndex) => !used.has(candidateIndex)
          && candidate.date === row.date && similarMerchant(candidate.note, row.note));
        if (index >= 0) used.add(index);
      });
      rows.forEach((row) => {
        if (row.date || row.dateConflict) return;
        let index = -1;
        let score = 2;
        dated.forEach((candidate, candidateIndex) => {
          if (used.has(candidateIndex)) return;
          const match = longestCommonPart(candidate.note, row.note);
          if (match > score && (similarMerchant(candidate.note, row.note) || match >= 5)) { score = match; index = candidateIndex; }
        });
        if (index < 0) return;
        row.date = dated[index].date;
        row.dateEvidence = "explicit";
        row.time = row.time || dated[index].time;
        row.warning = mergeWarnings(withoutDateWarning(row.warning), dated[index].warning);
        row.confidence = needsReview(row.warning) ? "review" : "medium";
        used.add(index);
      });
      // The enhanced pass can find a payment absent from the original pass.
      // Preserve its visible occurrence instead of using it only for dates.
      const matchedPrimary = new Set(secondaryToPrimary.values());
      const combined = secondaryRows.map((candidate, index) => secondaryToPrimary.get(index) || candidate);
      rows.filter((row) => !matchedPrimary.has(row)).forEach((row) => {
        const originalIndex = rows.indexOf(row);
        const nextMatched = rows.slice(originalIndex + 1).find((other) => matchedPrimary.has(other));
        const insertAt = nextMatched ? combined.indexOf(nextMatched) : combined.length;
        combined.splice(insertAt, 0, row);
      });
      rows.splice(0, rows.length, ...combined);
    }
    if (!detail) attachUndatedRefundChain(rows);
    const reconciled = reconcileRows(rows, [], { skipDedup:true });
    const transferLines = [...lines, ...String(options.secondaryText || "").split(/\r?\n/).map(cleanLine)].filter((line) => /余[额利]宝|鱼儿宝|零钱通/.test(line) && /\d/.test(line));
    const transferKeys = new Set(reconciled.skipped.filter((item) => item.reason === "内部资金划转").map((item) => `${item.note}|${item.amount}`));
    transferLines.forEach((line) => {
      const amount = amountsFromLine(line.replace(/余额宝|余利宝|鱼儿宝|零钱通/g, "内部划转"))[0]?.amount || 0;
      const key = `${line.replace(/\s/g, "")}|${amount}`;
      if (!amount || transferKeys.has(key)) return;
      transferKeys.add(key);
      reconciled.skipped.push({ reason:"内部资金划转", date:"", platform, note:line, amount, type:"transfer" });
    });
    return reconciled;
  }

  const api = { parse, mergeResults, dateFromLine, amountsFromLine };
  root.ImageLedgerParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
