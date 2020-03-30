const test = require('node:test');
const assert = require('node:assert');
const pricing = require('../lib/pricing');
const money = require('../lib/money');

test('gross adds the tax', function () {
  assert.strictEqual(money.round2(pricing.gross(100, 19)), 119);
  assert.strictEqual(money.round2(pricing.gross(100, 7)), 107);
  assert.strictEqual(pricing.gross(100, 0), 100);
});

test('net is the reverse of gross', function () {
  assert.strictEqual(money.round2(pricing.net(119, 19)), 100);
  assert.strictEqual(money.round2(pricing.net(pricing.gross(250, 7), 7)), 250);
});

test('taxAmount', function () {
  assert.strictEqual(money.round2(pricing.taxAmount(100, 19)), 19);
  assert.strictEqual(money.round2(pricing.taxAmount(49.9, 7)), 3.49);
});

test('sumItems', function () {
  var items = [
    { quantity: 2, unit_price: 10 },
    { quantity: 1, unit_price: 5.5 }
  ];
  assert.strictEqual(pricing.sumItems(items), 25.5);
  assert.strictEqual(pricing.sumItems([]), 0);
});

test('isValidRate', function () {
  assert.ok(pricing.isValidRate(19));
  assert.ok(pricing.isValidRate(7));
  assert.ok(!pricing.isValidRate(16));
});
