const test = require('node:test');
const assert = require('node:assert');
const csv = require('../lib/csv');

test('parse semicolon csv with quotes and BOM', function () {
  var rows = csv.parse('﻿A;B;C\r\n1;"Buch ""Wege"", 2. Aufl.";12,3450\r\n2;;x\r\n');
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows[1], ['1', 'Buch "Wege", 2. Aufl.', '12,3450']);
  assert.deepStrictEqual(rows[2], ['2', '', 'x']);
});

test('rows to objects', function () {
  var objs = csv.toObjects(csv.parse('KdNr;Firma\nK1;Krause GmbH\n'));
  assert.deepStrictEqual(objs, [{ KdNr: 'K1', Firma: 'Krause GmbH' }]);
});

test('stringify quotes when needed', function () {
  assert.strictEqual(csv.stringify([['a;b', 'c"d', 'e']]), '"a;b";"c""d";e\r\n');
});

test('german date', function () {
  assert.strictEqual(csv.deDate('07.06.2021'), '2021-06-07');
  assert.strictEqual(csv.deDate('1.2.2020'), '2020-02-01');
  assert.strictEqual(csv.deDate(''), null);
});
