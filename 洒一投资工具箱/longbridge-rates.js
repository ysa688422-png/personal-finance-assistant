/* Only Longbridge supplies external investment exchange rates. */
(function (root) {
  'use strict';
  function convertPair(rates, from, to) {
    if (from === to) return 1;
    const edges = new Map();
    function add(a, b, rate) {
      if (!edges.has(a)) edges.set(a, []);
      edges.get(a).push([b, rate]);
    }
    for (const item of rates || []) {
      const rate = Number(item.rate);
      if (!Number.isFinite(rate) || rate <= 0) continue;
      add(item.from_currency, item.to_currency, rate);
      add(item.to_currency, item.from_currency, 1 / rate);
    }
    const queue = [[from, 1, 0]], seen = new Set([from]);
    while (queue.length) {
      const [currency, value, depth] = queue.shift();
      if (depth >= 3) continue;
      for (const [next, rate] of edges.get(currency) || []) {
        const converted = value * rate;
        if (next === to && Number.isFinite(converted) && converted > 0) return converted;
        if (!seen.has(next)) { seen.add(next); queue.push([next, converted, depth + 1]); }
      }
    }
    throw new Error('长桥未返回 ' + from + ' → ' + to + ' 可用币种对');
  }
  async function read() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('/api/longbridge/exchange-rates', {
        headers: { 'X-Finance-Request': '1' }, cache: 'no-store', signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || result.error?.message || '长桥服务未就绪');
      return { USD: convertPair(result.data.rates, 'USD', 'CNY'),
        HKD: convertPair(result.data.rates, 'HKD', 'CNY'), queriedAt: result.queried_at,
        source: '长桥 API（按币种对计算；查询时间不代表上游更新时间）' };
    } finally { clearTimeout(timer); }
  }
  const api = { convertPair, read };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.sayiLongbridgeRates = api;
})(typeof window === 'undefined' ? globalThis : window);
