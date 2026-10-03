const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const search = require("./ledger-search.js");
const elements = new Map(), instances = [], timers = new Map();
const element = (key) => {
  if (!elements.has(key)) elements.set(key,{ value:"", textContent:"", hidden:false, classList:{toggle(){}}, setAttribute(){} });
  return elements.get(key);
};
class FakeRecognition {
  constructor() { instances.push(this); }
  start() { this.onstart?.(); }
  stop() { this.onend?.(); }
  abort() { this.aborted = true; this.onend?.(); }
}
let nextTimer = 0;
const context = vm.createContext({
  console, URLSearchParams, location:{search:""},
  window:{ SpeechRecognition:FakeRecognition, LedgerSearch:search },
  document:{ querySelector:element },
  setTimeout(callback) { const id=++nextTimer; timers.set(id,callback); return id; },
  clearTimeout(id) { timers.delete(id); },
});
const source = fs.readFileSync(require.resolve("./app.js"),"utf8");
vm.runInContext(source.replace(/\ninit\(\);\s*$/, ""),context);
const run = (code) => vm.runInContext(code,context);
run("let rendered = 0; renderDashboard = () => rendered++;");
const result = (text,final=true) => ({ resultIndex:0, results:[Object.assign([{transcript:text}],{isFinal:final})] });

run("startDetailVoiceSearch()");
const first = instances[0];
assert.equal(first.lang,"zh-CN");
assert.equal(element("#detailVoiceSearchLabel").textContent,"结束录音并搜索");
first.onresult(result("帮我查一下2023年7月的"));
first.onresult({ resultIndex:1, results:[Object.assign([{transcript:"帮我查一下2023年7月的"}],{isFinal:true}),Object.assign([{transcript:"大额支出，一千元以上"}],{isFinal:true})] });
first.onresult({ resultIndex:0, results:[Object.assign([{transcript:"帮我查一下2023年7月的"}],{isFinal:true}),Object.assign([{transcript:"大额支出，一千元以上"}],{isFinal:true})] });
first.stop();
assert.equal(run("detailSearchState.filters.scope.start"),"2023-07-01");
assert.equal(run("detailSearchState.filters.minimum.value"),1000);
assert.equal(run("detailSearchState.filters.type"),"expense");
assert.equal(run("detailsState.month"),"2023-07");
assert.equal(run("currentDraft"),null,"搜索语音不能转入记账草稿");
assert.equal(timers.size,0,"识别结束清理全部录音计时器");
assert.equal(run("detailSearchRecognition"),null);

run("startDetailVoiceSearch()");
const second = instances[1];
second.onresult(result("所有记录中的耳机",false));
run("cancelDetailVoiceSearch()");
assert.equal(second.aborted,true);
assert.equal(run("detailSearchState.filters.minimum.value"),1000,"取消录音不替换已有结果");
assert.equal(timers.size,0);
assert.equal(second.onend,null,"离开明细后不应用晚到的识别结果");
assert.equal(second.onresult,null,"取消录音后不能再覆盖用户输入");

run("startDetailVoiceSearch()");
const third = instances[2];
third.onerror({error:"not-allowed"});
assert.equal(run("detailSearchRecognition"),null,"权限错误后立即释放识别器可重试");
third.stop();
assert.match(element("#detailVoiceSearchStatus").textContent,/麦克风权限/);
assert.equal(run("detailSearchState.filters.minimum.value"),1000);
assert.equal(timers.size,0);

run("clearDetailSearch()");
assert.equal(element("#detailSearchInput").value,"");
assert.equal(run("detailSearchState.filters"),null);
element("#detailSearchInput").value="2023年13月的支出";
run("applyDetailSearch()");
assert.match(run("detailSearchState.error"),/日期/);
assert.equal(run("getDetailRecords([{date:'2023-07-01',type:'expense',amount:1000}]).length"),0,"无效条件不能回退为未筛选账本");
console.log("语音搜索回归通过：分段语音、金额与日期解析、取消和权限错误、无记账写入、计时器清理。");
