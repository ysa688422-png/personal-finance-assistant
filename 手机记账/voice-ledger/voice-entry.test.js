const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const elements = new Map(), instances = [], timers = new Map(), storage = new Map();
let nextTimer = 0;
const element = (key) => {
  if (!elements.has(key)) elements.set(key,{ value:'', textContent:'', innerHTML:'', hidden:false, disabled:false, classList:{toggle(){},add(){},remove(){}}, setAttribute(){}, scrollIntoView(){} });
  return elements.get(key);
};
class TestDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-02T12:00:00'])); } }
class FakeRecognition {
  constructor() { instances.push(this); }
  start() { if (FakeRecognition.failStart) throw new Error('start unavailable');this.started = true; if (!this.delayed) this.onstart?.(); }
  stop() { this.stopped = true; this.onend?.(); }
  abort() { this.aborted = true; this.onend?.(); }
}
let saves = 0;
const context = vm.createContext({
  console, Date:TestDate, crypto:crypto.webcrypto, URLSearchParams, location:{search:''},
  window:{SpeechRecognition:FakeRecognition, matchMedia:() => ({matches:false}),scrollTo(){}},
  document:{querySelector:element,querySelectorAll:() => [],createElement:() => ({textContent:'',get innerHTML(){return this.textContent;}})},
  localStorage:{getItem:(key) => storage.get(key) || null,setItem:(key,value) => {storage.set(key,value);saves++;}},
  setTimeout(callback) { const id=++nextTimer;timers.set(id,callback);return id; },clearTimeout:(id) => timers.delete(id),
});
vm.runInContext(fs.readFileSync(require.resolve('./app.js'),'utf8').replace(/\ninit\(\);\s*$/,''),context);
const run = (code) => vm.runInContext(code,context);
const parse = (text) => run(`parseLedgerSpeech(${JSON.stringify(text)})`);
run('renderDashboard = () => {}; syncToComputer = () => {}; showToast = () => {};');
const cases = [
  ['餐饮六块九',6.9],['餐饮六元九角',6.9],['餐饮六元九角五分',6.95],['餐饮六角五分',0.65],
  ['餐饮一块零五',1.05],['餐饮一元五分',1.05],['餐饮一千零一元五角',1001.5],
  ['餐饮三点五元',3.5],['餐饮一万零五十元',10050],['餐饮1.5万元',15000],['餐饮２１．００元',21],
  ['餐饮六元9元',15],['餐饮1.5元和三块钱',4.5],['餐饮0.1元和0.2元',0.3],
  ['2023-07-30吃饭21元',21,'2023-07-30'],['2023/7/30吃饭21元',21,'2023-07-30'],
  ['二〇二三年七月三十日吃饭21元',21,'2023-07-30'],['去年9月30日餐饮6块9',6.9,'2025-09-30'],
  ['9月30日20:15餐饮21元',21,'2026-09-30'],['上月30号吃饭21元',21,'2026-09-30'],
  ['昨天吃饭21元',21,'2026-10-01'],['上周一吃饭21元',21,'2026-09-21'],
  ['买3个面包18.9元',18.9],['坐13路公交2元',2],['购物原价100元优惠20元实付80元',80],
  ['今天收入六块九和1.05元',7.95],['今天工资8000元和奖金1000元总共9000元',9000],
];
for (const [text,amount,date] of cases) { const actual=parse(text);assert.equal(actual.amount,amount,text);if(date)assert.equal(actual.date,date,text); }
assert.equal(parse('闲鱼买手机100元').type,'expense');
assert.equal(parse('闲鱼买手机100元').amount,100,'购买不能当作收入并扣费');
for (const text of ['闲鱼购买优惠券100元','我买了100元闲鱼优惠券','闲鱼买入优惠券100元']) {
  const actual=parse(text);
  assert.equal(actual.type,'expense',text);
  assert.equal(actual.category,'购物',text);
  assert.equal(actual.amount,100,text);
}
for (const text of ['闲鱼购买优惠券退款100元','闲鱼买入优惠券报销到账100元','我买了闲鱼优惠券，收到退款100元']) {
  const actual=parse(text);
  assert.equal(actual.type,'income',text);
  assert.equal(actual.amount,100,'退款/报销金额不得再自动扣除卖家手续费');
}
assert.equal(parse('收到红包66元').type,'income');
assert.equal(parse('给朋友发红包100元').type,'expense');
assert.equal(parse('9月31日吃饭21元').date,'','无效日期不可自动替换成今天');
assert.match(parse('9月31日吃饭21元').warnings.join(';'),/日期/);
assert.equal(parse('2023年7月餐饮21元').date,'','没有说日期的具体日，要求手动补齐');
assert.match(parse('餐饮21.005元').warnings.join(';'),/超过两位小数/);
assert.equal(run('runParserSelfTests().passed'),run('runParserSelfTests().total'));
assert.equal(run("evaluateManualAmount('1-2')"),0,'负数计算不能被绝对值翻成支出');
assert.equal(run("evaluateManualAmount('0.1+0.2')"),0.3);
const speechResult = (text,final=true) => Object.assign([{transcript:text}],{isFinal:final});
const event = (rows,resultIndex=0) => ({resultIndex,results:rows});
run('startListening()');
const first=instances.at(-1);
first.onresult(event([speechResult('今天餐饮六块九')]))
first.onresult(event([speechResult('今天餐饮六块九'),speechResult('，一块零五')],1));
first.onresult(event([speechResult('今天餐饮六块九'),speechResult('，一块零五')],0));
first.stop();
assert.equal(run('currentDraft.amount'),7.95,'累计结果重放不能重复加钱');
assert.equal(run('recognition'),null);
assert.equal(timers.size,0);
const beforeSave=saves;
run('saveDraft(); saveDraft();');
assert.equal(run('loadRecords().length'),1,'双击保存只有一条');
assert.equal(saves-beforeSave,1);
run('startListening()');
const second=instances.at(-1),lateResult=second.onresult,lateEnd=second.onend;
second.onresult(event([speechResult('吃饭21元')]));
run("openEntryMode('manualEntryMode')");
assert.equal(second.aborted,true);
assert.equal(second.onresult,null);
lateResult(event([speechResult('吃饭200元')]));lateEnd();
assert.equal(run('currentDraft'),null,'取消后的晚到事件不能创建草稿');
assert.equal(timers.size,0);
run('startListening()');
const third=instances.at(-1);
third.onresult(event([speechResult('餐饮28块4',false)]));third.stop();
assert.equal(run('currentDraft.amount'),28.4,'结束时最后一段临时文字也显示供用户核对');
run('startListening()');
const fourth=instances.at(-1);fourth.onerror({error:'no-speech'});fourth.stop();
assert.equal(run('currentDraft'),null);
assert.match(element('#voiceStatus').textContent,/没有听到声音/);
assert.equal(timers.size,0);
run("processTranscript('今天闲鱼收入300元');editVoiceDraftManually();");
assert.equal(run('manualEntry.expression'),'295.2');
assert.equal(run('currentDraft'),null,'转手动后不能再从语音预览保存同一草稿');
run('saveManualEntry();saveManualEntry();');
assert.equal(run('loadRecords()[0].amount'),295.2,'语音转手动不二次扣费');
assert.equal(run('loadRecords().length'),2);
run("processTranscript('今天闲鱼收入300元，扣除10元手续费');editVoiceDraftManually();saveManualEntry();");
assert.equal(run('loadRecords()[0].amount'),290,'用户明确费用不能再自动扣1.6%');
run("openManualEdit(loadRecords()[0].id);saveManualEntry();");
assert.equal(run('loadRecords()[0].amount'),290,'再次编辑明确费用的记录不会补扣自动手续费');
assert.equal(run('loadRecords().length'),3,'编辑原记录不能多插一条');
FakeRecognition.failStart=true;
run('startListening()');
assert.equal(run('recognition'),null,'启动抛错后不保留失效的麦克风实例');
assert.equal(run('isListening'),false);
assert.match(element('#voiceStatus').textContent,/无法启动/);
FakeRecognition.failStart=false;
run('startListening()');
const retry=instances.at(-1);retry.onerror({error:'not-allowed'});
assert.equal(run('recognition'),null,'权限错误后可立即重试');
assert.equal(timers.size,0);
run('startListening();cancelVoiceEntry();');
assert.equal(instances.at(-1).started,true);
assert.equal(timers.size,0);
console.log(`语音记账回归通过：${cases.length}种金额/日期、累计回调重放、取消晚到回调、临时结果、失败清理、双击保存、语音转手动不二次扣费。`);
