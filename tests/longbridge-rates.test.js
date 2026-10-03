'use strict';
const assert = require('node:assert/strict');
const {convertPair} = require('../洒一投资工具箱/longbridge-rates.js');
// Synthetic unit ratios; none are market data.
const pairs = [
  {from_currency:'USD',to_currency:'CNY',rate:'8'},
  {from_currency:'HKD',to_currency:'USD',rate:'0.2'},
];
assert.equal(convertPair(pairs,'USD','CNY'),8);
assert.equal(convertPair(pairs,'CNY','USD'),0.125);
assert.equal(convertPair(pairs,'HKD','CNY'),1.6);
assert.equal(convertPair(pairs,'USD','USD'),1);
assert.throws(() => convertPair(pairs,'SGD','CNY'),/未返回/);
assert.throws(() => convertPair([{from_currency:'USD',to_currency:'CNY',rate:0}],'USD','CNY'),/未返回/);
assert.throws(() => convertPair([{from_currency:'USD',to_currency:'CNY',rate:Infinity}],'USD','CNY'),/未返回/);
console.log('Longbridge FX unit direction, reverse, cross and missing-pair checks passed.');
