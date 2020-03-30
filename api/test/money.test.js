const test = require('node:test');
const assert = require('node:assert');
const money = require('../lib/money');

test('formatEuro uses german format', function () {
  assert.strictEqual(money.formatEuro(1234.5), '1.234,50 €');
  assert.strictEqual(money.formatEuro(0), '0,00 €');
  assert.strictEqual(money.formatEuro(12), '12,00 €');
  assert.strictEqual(money.formatEuro(1000000), '1.000.000,00 €');
});

test('formatEuro negative', function () {
  assert.strictEqual(money.formatEuro(-19.9), '-19,90 €');
});

test('formatEuro empty for missing values', function () {
  assert.strictEqual(money.formatEuro(null), '');
  assert.strictEqual(money.formatEuro(undefined), '');
});

test('parseEuro', function () {
  assert.strictEqual(money.parseEuro('1.234,56 €'), 1234.56);
  assert.strictEqual(money.parseEuro('12,5'), 12.5);
  assert.strictEqual(money.parseEuro('12.50'), 12.5);
  assert.strictEqual(money.parseEuro('99'), 99);
  assert.strictEqual(money.parseEuro(7.5), 7.5);
});

test('parseEuro rejects garbage', function () {
  assert.ok(isNaN(money.parseEuro('abc')));
  assert.ok(isNaN(money.parseEuro('')));
  assert.ok(isNaN(money.parseEuro(null)));
});

test('round2', function () {
  assert.strictEqual(money.round2(10.004), 10);
  assert.strictEqual(money.round2(10.006), 10.01);
  assert.strictEqual(money.round2(2.5), 2.5);
});
