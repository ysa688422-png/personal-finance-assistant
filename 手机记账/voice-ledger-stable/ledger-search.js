(function (root, factory) {
  const search = factory();
  if (typeof module === "object" && module.exports) module.exports = search;
  else root.LedgerSearch = search;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const digits = { 零:0, 〇:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
  const money = "(?:[0-9]+(?:[,，][0-9]{3})*(?:\\.[0-9]+)?[万千百]?|[零〇一二两三四五六七八九十百千万点]+)";
  const currency = "(?:元|块钱|块|圆|人民币)?";
  const aliases = [
    ["打车", "滴滴", "花小猪", "网约车", "出租车"],
    ["吃饭", "餐饮", "饭钱"],
    ["闲鱼", "咸鱼"],
    ["话费", "通讯"],
    ["房租", "租金"],
    ["薪水", "薪资", "工资"],
  ];

  function number(text) {
    const raw = text.replace(/[,，]/g, "").replace(/块钱|人民币|[元块圆]/g, "").trim();
    if (/^\d+(?:\.\d+)?[万千百]?$/.test(raw)) {
      const unit = { 万:10000, 千:1000, 百:100 }[raw.slice(-1)] || 1;
      return parseFloat(raw) * unit;
    }
    if (/^[零〇一二两三四五六七八九]+$/.test(raw)) return Number([...raw].map((char) => digits[char]).join(""));
    if (raw.includes("点")) {
      const [integer, fraction] = raw.split("点");
      return number(integer) + Number(`0.${[...fraction].map((char) => digits[char]).join("")}`);
    }
    let total = 0, section = 0, value = 0;
    for (const char of raw) {
      if (char in digits) value = digits[char];
      else if (char === "万") { total += (section + value || 1) * 10000; section = value = 0; }
      else if (char in { 十:10, 百:100, 千:1000 }) { section += (value || 1) * { 十:10, 百:100, 千:1000 }[char]; value = 0; }
      else return NaN;
    }
    return total + section + value;
  }

  function dateText(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }

  function normalizeSpokenMoney(text) {
    const numeric = "(?:[0-9]+(?:[,，][0-9]{3})*(?:\\.[0-9]+)?[万千百]?|[零〇一二两三四五六七八九十百千万点]+)";
    const digit = "[0-9零〇一二两三四五六七八九]";
    const fraction = `(?:${digit}(?:毛|角)(?:${digit}分?)?|${digit}分|${digit}{1,2}(?![0-9零〇一二两三四五六七八九十百千万点]*(?:元|块|圆)))`;
    const pattern = new RegExp(`${numeric}\\s*(?:元|块钱|块|圆|人民币)(?:\\s*${fraction})?|${numeric}\\s*(?:毛|角)(?:\\s*${digit}分)?|${numeric}\\s*分`, "g");
    const singleDigit = (value) => /^\d$/.test(value) ? Number(value) : digits[value];
    return text.replace(pattern, (token) => {
      const raw = token.replace(/\s/g, "");
      const yuan = raw.match(/^(.*?)(?:元|块钱|块|圆|人民币)(.*)$/);
      let value;
      if (yuan) {
        value = number(yuan[1]);
        const part = yuan[2];
        if (part) {
          const jiao = part.match(/^([0-9零〇一二两三四五六七八九])(?:毛|角)(?:([0-9零〇一二两三四五六七八九])分?)?$/);
          const fen = part.match(/^([0-9零〇一二两三四五六七八九])分$/);
          if (jiao) value += singleDigit(jiao[1])/10 + (jiao[2] ? singleDigit(jiao[2])/100 : 0);
          else if (fen) value += singleDigit(fen[1])/100;
          else value += Number(`0.${[...part].map(singleDigit).join("")}`);
        }
      } else {
        const jiao = raw.match(/^(.*?)(?:毛|角)(?:([0-9零〇一二两三四五六七八九])分)?$/);
        value = jiao ? number(jiao[1])/10 + (jiao[2] ? singleDigit(jiao[2])/100 : 0) : number(raw.slice(0,-1))/100;
      }
      if (!Number.isFinite(value)) throw new Error("金额没有识别清楚，请重新说明具体金额。");
      return `${Math.round((value+Number.EPSILON)*100)/100}元`;
    });
  }

  function dateScope(year, month, day) {
    const hasMonth = month != null, hasDay = day != null;
    const start = new Date(year, hasMonth ? month-1 : 0, hasDay ? day : 1);
    if (year < 1900 || year > 9999 || (hasMonth && (month < 1 || month > 12)) || (hasDay && (day < 1 || start.getMonth() !== month-1))) throw new Error("日期没有识别清楚，请用“2023年7月”或“2023年7月1日”重新搜索。");
    const end = hasDay ? start : hasMonth ? new Date(year, month, 0) : new Date(year, 11, 31);
    return { start:dateText(start), end:dateText(end), label:`${year}年${hasMonth ? `${month}月` : "全年"}${hasDay ? `${day}日` : ""}`, month:hasMonth && !hasDay ? dateText(start).slice(0,7) : null };
  }

  function normalize(text) {
    return String(text || "").normalize("NFKC").toLowerCase().replace(/[\s，。！？、,.;:：!?“”‘’"'·\-_/（）()]/g, "");
  }

  function parse(query, options = {}) {
    const now = options.now || new Date();
    const selectedMonth = options.month || dateText(now).slice(0,7);
    const fallbackType = options.type || "all";
    let text = String(query || "").normalize("NFKC").trim().replace(/月份/g,"月");
    if (!text) return null;
    if (text.length > 300) throw new Error("搜索语句太长了，请简短说明时间、金额或关键词。");
    text = text.replace(/([零〇一二两三四五六七八九十百千]+)(?=年|月|日|号)/g, (value) => String(number(value)));
    text = normalizeSpokenMoney(text);
    let scope = null;
    const explicit = /(\d{4})(?:年的?|[-/])(\d{1,2})(?:月(\d{1,2})[日号]|[-/](\d{1,2}))?月?/g;
    const matches = [...text.matchAll(explicit)];
    if (matches.length > 2) throw new Error("请只指定一个月份，或一段起止日期。");
    if (matches.length) {
      const first = matches[0];
      scope = dateScope(Number(first[1]), Number(first[2]), first[3] || first[4] ? Number(first[3] || first[4]) : null);
      if (matches.length === 2) {
        const between = text.slice(first.index + first[0].length, matches[1].index);
        if (!/(到|至|~|～|—|-)/.test(between)) throw new Error("多个时间没有连接起来，请说“2023年7月至2023年8月”。");
        const last = matches[1];
        const end = dateScope(Number(last[1]), Number(last[2]), last[3] || last[4] ? Number(last[3] || last[4]) : null);
        if (scope.start > end.end) throw new Error("开始日期晚于结束日期，请调整后搜索。");
        scope = { start:scope.start, end:end.end, label:`${scope.label}至${end.label}`, month:null };
      }
      text = text.replace(explicit, " ");
      if (matches.length === 2) text = text.replace(/\s+(?:到|至|~|～|—|-)\s+/," ");
    } else {
      const relativeYear = text.match(/(今年|去年|前年)(?:的)?(?:(\d{1,2})月(?:(\d{1,2})[日号])?)?/);
      const year = text.match(/(\d{4})年/);
      const month = text.match(/(\d{1,2})月(?:(\d{1,2})[日号])?/);
      const monthDay = text.match(/(本月|这个月|这月|上个月|上月)?(\d{1,2})[日号]/);
      const week = text.match(/(本周|这周|上周|上个星期|本星期|这个星期)([一二三四五六日天])?/);
      const relativeMonth = text.match(/(本月|这个月|这月|上个月|上月)/);
      const relativeDay = text.match(/(今天|今日|昨天|昨日|前天)/);
      if (relativeYear) {
        const offset = relativeYear[1] === "去年" ? -1 : relativeYear[1] === "前年" ? -2 : 0;
        scope = dateScope(now.getFullYear()+offset, relativeYear[2] != null ? Number(relativeYear[2]) : null, relativeYear[3] != null ? Number(relativeYear[3]) : null);
        text = text.replace(relativeYear[0], " ");
      } else if (year) { scope = dateScope(Number(year[1])); text = text.replace(year[0]," "); }
      else if (month) { scope = dateScope(now.getFullYear(),Number(month[1]),month[2] != null ? Number(month[2]) : null); text = text.replace(month[0]," "); }
      else if (monthDay) {
        const date = new Date(now.getFullYear(),now.getMonth() - (/上/.test(monthDay[1] || "") ? 1 : 0),1);
        scope = dateScope(date.getFullYear(),date.getMonth()+1,Number(monthDay[2])); text = text.replace(monthDay[0]," ");
      } else if (week) {
        const start = new Date(now.getFullYear(),now.getMonth(),now.getDate()-(now.getDay() || 7)+1-(/上/.test(week[1]) ? 7 : 0));
        if (week[2]) { start.setDate(start.getDate()+{ 一:0,二:1,三:2,四:3,五:4,六:5,日:6,天:6 }[week[2]]); scope = dateScope(start.getFullYear(),start.getMonth()+1,start.getDate()); }
        else { const end = new Date(start);end.setDate(end.getDate()+6);scope = { start:dateText(start),end:dateText(end),label:`${dateText(start)}至${dateText(end)}`,month:null }; }
        text = text.replace(week[0]," ");
      } else if (relativeMonth) {
        const date = new Date(now.getFullYear(), now.getMonth() - (/上/.test(relativeMonth[1]) ? 1 : 0), 1);
        scope = dateScope(date.getFullYear(),date.getMonth()+1); text = text.replace(relativeMonth[0]," ");
      } else if (relativeDay) {
        const date = new Date(now); date.setDate(date.getDate()-(relativeDay[1] === "前天" ? 2 : /昨/.test(relativeDay[1]) ? 1 : 0));
        scope = dateScope(date.getFullYear(),date.getMonth()+1,date.getDate()); text = text.replace(relativeDay[0]," ");
      }
    }
    if (/(所有记录|全部记录|所有年份|全部年份|历史全部|全部历史|不限时间)/.test(text)) {
      if (scope) throw new Error("同时说了具体日期和“不限时间”，请保留一种时间范围。");
      scope = { start:null, end:null, label:"不限时间", month:null };
      text = text.replace(/所有记录|全部记录|所有年份|全部年份|历史全部|全部历史|不限时间/g," ");
    }
    if (!scope) {
      const [year, month] = selectedMonth.split("-").map(Number);
      scope = dateScope(year,month);
    }

    const hasExpense = /支出|花费|消费|付款|开销/.test(text);
    const hasIncome = /收入|进账|到账|收款/.test(text);
    const type = /收支/.test(text) || (hasExpense && hasIncome) ? "all" : hasIncome ? "income" : hasExpense ? "expense" : fallbackType;
    text = text.replace(/支出|花费|消费|付款|开销|收入|进账|到账|收款|收支/g, " ");

    let minimum = null, maximum = null;
    const setAmount = (kind, value, inclusive) => {
      const amount = number(value);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("金额没有识别清楚，请用“一千元以上”重新搜索。");
      const next = { value:amount, inclusive };
      if (kind === "min") {
        if (!minimum || amount > minimum.value || (amount === minimum.value && !inclusive)) minimum = next;
      } else if (!maximum || amount < maximum.value || (amount === maximum.value && !inclusive)) maximum = next;
    };
    text = text.replace(new RegExp(`(${money})\\s*${currency}\\s*(?:到|至|[-~～])\\s*(${money})\\s*${currency}`, "g"), (_, from, to) => {
      setAmount("min",from,true); setAmount("max",to,true); return " ";
    });
    text = text.replace(new RegExp(`(不少于|不低于|不小于|至少|大于等于|>=|不超过|不高于|不大于|至多|小于等于|<=|大于|超过|高于|多于|>|小于|低于|少于|不足|不到|<|等于|恰好)\\s*[¥￥]?\\s*(${money})\\s*${currency}`, "g"), (_, op, value) => {
      if (/等于|恰好/.test(op) && !/大于|小于/.test(op)) { setAmount("min",value,true); setAmount("max",value,true); }
      else if (/不少于|不低于|不小于|至少|大于等于|>=/.test(op)) setAmount("min",value,true);
      else if (/不超过|不高于|不大于|至多|小于等于|<=/.test(op)) setAmount("max",value,true);
      else setAmount(/大于|超过|高于|多于|>/.test(op) ? "min" : "max",value,false);
      return " ";
    });
    text = text.replace(new RegExp(`[¥￥]?\\s*(${money})\\s*${currency}\\s*(以上|及以上|以下|及以下|以内|内)`, "g"), (_, value, op) => {
      setAmount(/以上/.test(op) ? "min" : "max",value,true); return " ";
    });
    const big = /大额|大笔/.test(text);
    const defaultLargeAmount = big && !minimum && !maximum;
    if (defaultLargeAmount) minimum = { value:1000, inclusive:true };
    text = text.replace(/大额|大笔/g," ");
    if (minimum && maximum && (minimum.value > maximum.value || (minimum.value === maximum.value && (!minimum.inclusive || !maximum.inclusive)))) throw new Error("金额区间没有交集，请调整最低或最高金额。");
    if (/(以上|以下|大于|小于|超过|不少于|不超过)/.test(text)) throw new Error("金额条件没有识别完整，请说明具体金额，例如“一千元以上”。");
    if (/\d{4}年|\d+月|\d+日|\d+号/.test(text)) throw new Error("日期没有识别完整，请用“2023年7月”重新搜索。");
    text = text.replace(/是吧|好吧|这一笔|那一笔|这笔|那笔|帮我|请你|请|帮忙|查一下|查一查|查找|查询|搜索一下|搜索|找一下|找一找|找出|看看|查看|我想|我在|想找|想查|一下|有没有|有哪些|所有|全部|记录|账单|明细|金额|人民币|科目|类别|备注|包含|有关|关于|购买|买了|买|的|在|中|里|是|笔|和|与/g," ");
    const keywords = text.split(/[\s，。！？、,;；:：!?]+/).map(normalize).filter(Boolean);
    const conditions = [scope.label, type === "income" ? "收入" : type === "expense" ? "支出" : "全部收支"];
    if (minimum) conditions.push(`${minimum.inclusive ? "≥" : ">"} ¥${minimum.value.toLocaleString("zh-CN")}`);
    if (maximum) conditions.push(`${maximum.inclusive ? "≤" : "<"} ¥${maximum.value.toLocaleString("zh-CN")}`);
    if (keywords.length) conditions.push(`关键词：${keywords.join("、")}`);
    return { query:String(query).trim(), scope, type, minimum, maximum, keywords, conditions, defaultLargeAmount };
  }

  function filterRecords(records, filters) {
    return records.filter((record) => {
      if (!record || record.deleted || !record.date) return false;
      if (filters.scope.start && (record.date < filters.scope.start || record.date > filters.scope.end)) return false;
      if (filters.type !== "all" && record.type !== filters.type) return false;
      const amount = Number(record.amount);
      if (!Number.isFinite(amount)) return false;
      if (filters.minimum && (filters.minimum.inclusive ? amount < filters.minimum.value : amount <= filters.minimum.value)) return false;
      if (filters.maximum && (filters.maximum.inclusive ? amount > filters.maximum.value : amount >= filters.maximum.value)) return false;
      const haystack = [record.category,record.note,record.transcript].filter(Boolean).map(normalize).join("|");
      return filters.keywords.every((keyword) => {
        const group = aliases.find((words) => words.includes(keyword)) || [keyword];
        return group.some((word) => haystack.includes(normalize(word)));
      });
    });
  }
  return Object.freeze({ parse, filterRecords });
});
