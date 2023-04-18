const test = require('node:test');
const assert = require('node:assert');
const validate = require('../lib/validate');

test('email', function () {
  assert.ok(validate.isEmail('mia.schulz@example.com'));
  assert.ok(!validate.isEmail('mia.schulz@'));
  assert.ok(!validate.isEmail('mia schulz@example.com'));
  assert.ok(!validate.isEmail(null));
});

test('int with range and default', function () {
  assert.strictEqual(validate.int('25'), 25);
  assert.strictEqual(validate.int('', { def: 1 }), 1);
  assert.strictEqual(validate.int(undefined, { def: 50 }), 50);
  assert.ok(isNaN(validate.int('2.5')));
  assert.ok(isNaN(validate.int('abc')));
  assert.ok(isNaN(validate.int('0', { min: 1 })));
  assert.ok(isNaN(validate.int('500', { max: 200 })));
});

test('oneOf', function () {
  assert.strictEqual(validate.oneOf('asc', ['asc', 'desc'], 'desc'), 'asc');
  assert.strictEqual(validate.oneOf('', ['asc', 'desc'], 'desc'), 'desc');
  assert.strictEqual(validate.oneOf('up', ['asc', 'desc'], 'desc'), undefined);
});

test('text trims and checks the length', function () {
  assert.strictEqual(validate.text('  Hallo '), 'Hallo');
  assert.strictEqual(validate.text(''), null);
  assert.strictEqual(validate.text('abcdef', 3), undefined);
});

test('check collects all problems', function () {
  const problems = validate.check({ name: '', email: 'x', due_date: '2023-02-30x' }, {
    name: { required: true, label: 'Name' },
    email: { email: true },
    due_date: { date: true },
    city: { max: 10 }
  });
  assert.deepStrictEqual(problems, [
    { field: 'name', message: 'Name fehlt' },
    { field: 'email', message: 'E-Mail ungültig' },
    { field: 'due_date', message: 'Datum ungültig' }
  ]);
});

test('check without problems', function () {
  assert.deepStrictEqual(validate.check({ name: 'Krause GmbH' }, { name: { required: true } }), []);
});
