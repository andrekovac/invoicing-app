const test = require('node:test');
const assert = require('node:assert');
const logger = require('../lib/logger');

function capture(fn) {
  const out = [];
  const log = console.log;
  const err = console.error;
  console.log = function (s) { out.push(['out', s]); };
  console.error = function (s) { out.push(['err', s]); };
  try {
    fn();
  } finally {
    console.log = log;
    console.error = err;
  }
  return out;
}

test('plain line with fields', function () {
  const out = capture(function () {
    logger('payments').info('charge ok', { invoice: 'RE-2023-0012', amount: 119 });
  });
  assert.deepStrictEqual(out, [['out', '[payments] charge ok invoice=RE-2023-0012 amount=119']]);
});

test('values with spaces are quoted', function () {
  assert.strictEqual(logger.formatFields({ country: 'Deutschland', name: 'Krause GmbH' }), 'country=Deutschland name="Krause GmbH"');
});

test('warn and error go to stderr', function () {
  const out = capture(function () {
    logger('x').warn('slow');
  });
  assert.strictEqual(out[0][0], 'err');
});

test('level filter', function () {
  const old = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'warn';
  const out = capture(function () {
    const log = logger('x');
    log.info('hidden');
    log.verbose('hidden');
    log.warn('shown');
  });
  process.env.LOG_LEVEL = old === undefined ? '' : old;
  if (old === undefined) delete process.env.LOG_LEVEL;
  assert.strictEqual(out.length, 1);
});

test('json format', function () {
  const old = process.env.LOG_FORMAT;
  process.env.LOG_FORMAT = 'json';
  const out = capture(function () {
    logger('jobs').child('overdue').info('run', { sent: 2 });
  });
  if (old === undefined) delete process.env.LOG_FORMAT;
  else process.env.LOG_FORMAT = old;
  const obj = JSON.parse(out[0][1]);
  assert.strictEqual(obj.scope, 'jobs:overdue');
  assert.strictEqual(obj.sent, 2);
  assert.strictEqual(obj.level, 'info');
});
