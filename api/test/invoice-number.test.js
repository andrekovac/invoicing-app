const test = require('node:test');
const assert = require('node:assert');
const invoiceNumber = require('../lib/invoice-number');

test('format pads to four digits', function () {
  assert.strictEqual(invoiceNumber.format(2023, 7), 'RE-2023-0007');
  assert.strictEqual(invoiceNumber.format('2021', 87), 'RE-2021-0087');
  assert.strictEqual(invoiceNumber.format(2023, 12345), 'RE-2023-12345');
});

test('valid numbers', function () {
  assert.ok(invoiceNumber.isValid('RE-2021-0087'));
  assert.ok(invoiceNumber.isValid('RE-2020-0001'));
  assert.ok(invoiceNumber.isValid('RE-2023-10000'));
});

test('parse', function () {
  assert.deepStrictEqual(invoiceNumber.parse('RE-2021-0087'), { year: 2021, seq: 87 });
});

test('normalize what people type', function () {
  assert.strictEqual(invoiceNumber.normalize('re-2021-87'), 'RE-2021-0087');
  assert.strictEqual(invoiceNumber.normalize(' RE 2021 0087 '), 'RE-2021-0087');
  assert.strictEqual(invoiceNumber.normalize('2021-0087'), 'RE-2021-0087');
  assert.strictEqual(invoiceNumber.normalize('RE20210087'), 'RE-2021-0087');
  assert.strictEqual(invoiceNumber.normalize('RE-2021-0087'), 'RE-2021-0087');
});

test('next number in the same year', function () {
  assert.strictEqual(invoiceNumber.next('RE-2023-0041', 2023), 'RE-2023-0042');
  assert.strictEqual(invoiceNumber.next('RE-2023-9999', 2023), 'RE-2023-10000');
});

test('first number of a year', function () {
  assert.strictEqual(invoiceNumber.next(null, 2024), 'RE-2024-0001');
  assert.strictEqual(invoiceNumber.next('RE-2023-0041', 2024), 'RE-2024-0001');
});
