// reports api: revenue per month, open items, top customers, tax per rate
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');
const pricing = require('../lib/pricing');
const money = require('../lib/money');

let srv;
let brandt;
let albers;

test.before(async function () {
  srv = await helpers.startServer();
  brandt = helpers.client(srv.base);
  albers = helpers.client(srv.base);
  await brandt.login('brandt');
  await albers.login('albers');
});

test.after(function () {
  srv.stop();
});

test('revenue per month has 12 months and adds up', async function () {
  const res = await brandt.get('/api/v1/reports/revenue?year=2020');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.months.length, 12);
  assert.strictEqual(res.body.months[0].month, '2020-01');
  const sum = res.body.months.reduce(function (s, m) { return s + m.gross; }, 0);
  assert.strictEqual(money.round2(sum), res.body.total.gross);
  assert.strictEqual(res.body.total.count, 10);
});

test('drafts are planned revenue', async function () {
  const res = await brandt.get('/api/v1/reports/revenue?year=2021');
  const feb = res.body.months[1];
  // two drafts in february 2021: 125 + 3 * 14.90 at 19 % and 100 * 1.40 at 7 %
  const expected = money.round2(pricing.gross(125 + 3 * 14.9, 19) + pricing.gross(140, 7));
  assert.strictEqual(feb.drafts_gross, expected);
});

test('open items with buckets', async function () {
  const res = await albers.get('/api/v1/reports/open-items?as_of=2024-06-11');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.count > 0);
  const bucketSum = res.body.buckets.reduce(function (s, b) { return s + b.count; }, 0);
  assert.strictEqual(bucketSum, res.body.count);
  res.body.items.forEach(function (i) { assert.ok(i.open > 0); });
});

test('top customers of a year', async function () {
  const res = await albers.get('/api/v1/reports/top-customers?year=2021&limit=3');
  assert.strictEqual(res.body.customers.length, 3);
  assert.strictEqual(res.body.customers[0].rank, 1);
  assert.ok(res.body.customers[0].gross >= res.body.customers[1].gross);
});

test('tax per rate', async function () {
  const res = await albers.get('/api/v1/reports/tax?year=2021');
  const rates = res.body.rates.map(function (r) { return r.tax_rate; });
  assert.deepStrictEqual(rates, [19, 7]);
});

test('one quarter', async function () {
  const res = await albers.get('/api/v1/reports/tax?year=2021&quarter=2');
  assert.strictEqual(res.body.from, '2021-04-01');
  assert.strictEqual(res.body.to, '2021-06-30');
});

test('wrong year', async function () {
  const res = await brandt.get('/api/v1/reports/revenue?year=abc');
  assert.strictEqual(res.status, 400);
});
