'use strict';

(() => {
  const byId = id => document.getElementById(id);
  const labels = {
    symbol:'证券代码',name:'名称',last_done:'最新价',currency:'币种',timestamp:'报价时间',
    expiry_date:'到期日',strike_price:'行权价',contract_multiplier:'合约乘数',
    implied_volatility:'隐含波动率（上游原值）',from_currency:'原币',to_currency:'目标币',
    rate:'每 1 原币换算目标币',symbol_name:'名称',quantity:'持仓数量',cost_price:'成本价',
    market:'市场',date:'日期',counter_name:'名称',content:'事件',
  };
  async function read(endpoint, params = {}) {
    if (!/^https?:$/.test(location.protocol) || !['127.0.0.1','localhost'].includes(location.hostname)) {
      throw new Error('请按仓库说明启动本机网关，再从本机地址打开长桥数据面板。');
    }
    const query = new URLSearchParams(params);
    const response = await fetch(`/api/longbridge/${endpoint}${query.size ? `?${query}` : ''}`, {
      headers:{'X-Finance-Request':'1'},cache:'no-store',signal:AbortSignal.timeout(20000),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error?.message || '长桥读取失败。');
    return payload;
  }
  function notice(container, message, error = false) {
    const p = document.createElement('p');
    p.className = error ? 'error' : 'notice'; p.textContent = message; container.append(p);
  }
  function table(container, rows, keys) {
    if (!rows.length) { notice(container,'长桥此次返回空结果；不代表真实事件或资产不存在。'); return; }
    const element = document.createElement('table'); element.className = 'table';
    const head = element.createTHead().insertRow();
    keys.forEach(key => { const th = document.createElement('th'); th.scope = 'col';
      th.textContent = labels[key] || key; head.append(th); });
    const body = element.createTBody();
    rows.forEach(row => { const tr = body.insertRow(); keys.forEach(key => {
      const cell = tr.insertCell(); cell.textContent = row[key] == null ? '未提供' : String(row[key]);
    }); });
    container.append(element);
  }
  async function query(button, resultId, endpoint, params, render) {
    const container = byId(resultId); container.replaceChildren();
    notice(container,'正在向长桥读取…'); button.disabled = true;
    try {
      const payload = await read(endpoint, params); container.replaceChildren();
      render(container, payload.data);
      notice(container,`数据来源：长桥 API（唯一外部投资数据源）；查询时间：${payload.queried_at}`);
    } catch(error) {
      container.replaceChildren();
      notice(container,error.name === 'TimeoutError' ? '查询超过 20 秒，请稍后手动重试。' : error.message,true);
    } finally { button.disabled = false; }
  }
  byId('check-connection').addEventListener('click', function () {
    query(this,'connection','status',{},(container,status) => {
      notice(container,`凭证：${status.configured ? '已设置' : '未配置'}；SDK：${status.sdk_version || '未安装'}；持仓：${status.positions_enabled ? '允许手动读取' : '未启用'}。配置检查没有向长桥验证连接。`);
    });
  });
  function quoteForm(formId,inputId,resultId,options) {
    byId(formId).addEventListener('submit',event => {
      event.preventDefault();
      query(event.submitter || event.target.querySelector('button'),resultId,
        options ? 'option-quotes' : 'quotes',{symbols:byId(inputId).value.trim()},(container,data) => {
          table(container,data.quotes,options
            ? ['symbol','last_done','currency','expiry_date','strike_price','contract_multiplier','timestamp']
            : ['symbol','name','last_done','currency','timestamp']);
          if (data.missing_symbols.length) notice(container,`未返回代码：${data.missing_symbols.join('、')}`);
          notice(container,data.freshness); notice(container,data.price_unit);
        });
    });
  }
  quoteForm('quote-form','quote-symbols','quote-result',false);
  quoteForm('option-form','option-symbols','option-result',true);
  byId('read-rates').addEventListener('click',function () {
    query(this,'rates-result','exchange-rates',{},(container,data) => {
      table(container,data.rates,['from_currency','to_currency','rate']);
      notice(container,data.timestamp_note);
    });
  });
  byId('ipo-form').addEventListener('submit',event => {
    event.preventDefault();
    query(event.submitter || event.target.querySelector('button'),'ipo-result','ipo-calendar',{
      start:byId('ipo-start').value,end:byId('ipo-end').value,
    },(container,data) => {
      table(container,data.groups.flatMap(group => group.events),['date','symbol','counter_name','content']);
      if (data.next_date) notice(container,`尚有后续页，请将开始日期改为 ${data.next_date} 后继续查询。`);
      notice(container,data.coverage_note);
    });
  });
  byId('read-positions').addEventListener('click',function () {
    query(this,'positions-result','positions',{},(container,data) => {
      table(container,data.positions,['symbol','symbol_name','market','quantity','cost_price','currency']);
      notice(container,data.timestamp_note); notice(container,data.cost_note);
    });
  });
  byId('clear-positions').addEventListener('click',() => byId('positions-result').replaceChildren());
})();
