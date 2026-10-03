const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Exercise the real period and report functions without starting the app,
// touching a saved ledger, or connecting to its sync receiver.
let today = "2026-10-01T12:00:00";
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [today])); }
}
const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) elements.set(id, { textContent: "", innerHTML: "", value: "", setAttribute() {} });
  return elements.get(id);
};
const context = vm.createContext({
  Date: TestDate, URLSearchParams, console,
  window: {}, location: { search: "" },
  document: {
    querySelector: element,
    querySelectorAll: () => [],
    createElement: () => ({ textContent: "", get innerHTML() { return String(this.textContent).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"); } }),
  },
});
const source = fs.readFileSync(require.resolve("./app.js"), "utf8");
assert.match(source, /\ninit\(\);\s*$/);
vm.runInContext(source.replace(/\ninit\(\);\s*$/, ""), context);
const run = (code) => vm.runInContext(code, context);
const plain = (code) => JSON.parse(JSON.stringify(run(code)));
context.records = [
  { date: "2021-12-31", type: "income", amount: 200, category: "工资" },
  { date: "2023-07-01", type: "expense", amount: 0.1, category: "餐饮" },
  { date: "2023-07-31", type: "expense", amount: 0.2, category: "餐饮" },
  { date: "2023-07-15", type: "income", amount: 100, category: "工资" },
  { date: "2023-08-01", type: "expense", amount: 5, category: "交通" },
  { date: "2026-09-27", type: "expense", amount: 70, category: "购物" },
  { date: "2026-09-28", type: "expense", amount: 10, category: "餐饮" },
  { date: "2026-10-01", type: "expense", amount: 20, category: "餐饮" },
  { date: "2026-10-04", type: "expense", amount: 30, category: "餐饮" },
  { date: "2026-10-05", type: "expense", amount: 99, category: "购物" },
  { date: "2026-09-28", type: "income", amount: 1000, category: "工资" },
  { date: "2026-10-04", type: "income", amount: 2000, category: "工资" },
];

run('reportState.range = "year"');
assert.deepEqual(plain("getReportPeriodChoices(records).map(row => row.label)"), ["2021年", "2023年", "2026年（今年）"]);
assert.deepEqual(plain("getRecordYears([...records, null, {date: '2019-02-30'}, {date: '2018-01-01', deleted: true}, {date: 'wrong'}])"), [2021, 2023, 2026]);
assert.deepEqual(plain("getReportPeriodChoices([]).map(row => row.offset)"), [0]);
run('reportState.type = "expense"; reportState.offset = -3; renderAdvancedReport(records)');
assert.equal(element("#chartTotal").textContent, "总支出：¥5.30");
run('reportState.type = "income"; renderAdvancedReport(records)');
assert.equal(element("#chartTotal").textContent, "总收入：¥100.00");
assert.equal(run("reportState.offset"), -3, "切换收支类型保留所选年份");
run('reportState.offset = -5; renderAdvancedReport(records)');
assert.equal(element("#chartTotal").textContent, "总收入：¥200.00", "只有收入的早期年份也可选择");

run('reportState.range = "month"; reportState.offset = 0');
assert.equal(run("getReportPeriodChoices(records).length"), 12);
assert.deepEqual(plain("getReportPeriodChoices(records).map(row => row.offset)"), [-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2]);
assert.match(run("getReportPeriodChoices(records)[0].label"), /^1月/);
assert.match(run("getReportPeriodChoices(records)[11].label"), /^12月/);
run('reportState.type = "expense"; renderAdvancedReport(records)');
assert.equal(element("#chartTotal").textContent, "总支出：¥149.00");
run('reportState.type = "income"; renderAdvancedReport(records)');
assert.equal(element("#chartTotal").textContent, "总收入：¥2,000.00");
assert.match(element("#trendChart").innerHTML, /收入趋势图/);
run('reportState.offset = 2; renderAdvancedReport(records)');
assert.match(element("#categoryRanking").innerHTML, /所选月暂无收入记录/);

run('reportState.range = "week"; reportState.offset = 0');
assert.equal(run("getReportPeriodChoices(records).length"), 4);
assert.equal(run("getReportPeriodChoices(records)[3].label"), "本周 · 9/28–10/4");
assert.equal(run("buildReportPeriod().start"), "2026-09-28");
assert.equal(run("buildReportPeriod().end"), "2026-10-04");
assert.deepEqual(plain("buildReportPeriod().buckets.filter(row => row.label === '今天').map(row => row.start)"), ["2026-10-01"]);
run('reportState.type = "expense"; renderAdvancedReport(records)');
assert.equal(element("#chartTotal").textContent, "总支出：¥60.00", "完整纳入跨月周的周一到周日，排除前后周");
run('reportState.type = "income"; renderAdvancedReport(records)');
assert.equal(element("#chartTotal").textContent, "总收入：¥3,000.00");

today = "2027-01-01T12:00:00";
assert.equal(run("getReportPeriodChoices(records)[3].label"), "本周 · 2026/12/28–2027/1/3");
assert.equal(run("buildReportPeriod().start"), "2026-12-28");
assert.equal(run("buildReportPeriod().end"), "2027-01-03");
run('reportState.range = "month"');
assert.deepEqual(plain("getReportPeriodChoices(records).map(row => row.offset)"), [0,1,2,3,4,5,6,7,8,9,10,11]);
today = "2024-02-29T12:00:00";
run('reportState.range = "month"; reportState.offset = 0');
const february = plain("buildReportPeriod()");
assert.equal(february.end, "2024-02-29");
assert.equal(february.buckets[4].start, "2024-02-29");
assert.equal(february.buckets[4].end, "2024-02-29");
for (let index = 1; index < february.buckets.length; index++) {
  assert.equal(new Date(february.buckets[index].start).getTime() - new Date(february.buckets[index - 1].end).getTime(), 86400000, "每月分段无重叠、无漏日");
}

today = "2026-10-01T12:00:00";
assert.deepEqual(plain("getDetailCalendarYears(records, '2023-07')"), [2026,2025,2024,2023,2022,2021]);
assert.deepEqual(plain("getDetailCalendarYears([], '2023-07')"), [2026,2025,2024,2023]);
assert.deepEqual(plain("getDetailCalendarYears([], '2026-10')"), [2026]);
console.log("日期筛选与收支报表回归通过：完整年份、今年 12 月、最近四周、跨年/跨月、闰日、收支合计和今天标签。");
