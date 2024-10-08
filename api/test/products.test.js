// products api
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');

let srv;
let albers;
let brandt;

test.before(async function () {
  srv = await helpers.startServer();
  albers = helpers.client(srv.base);
  brandt = helpers.client(srv.base);
  await albers.login('albers');
  await brandt.login('brandt');
});

test.after(function () {
  srv.stop();
});

test('list with gross price', async function () {
  const res = await albers.get('/api/v1/products');
  assert.strictEqual(res.status, 200);
  const rollup = res.body.find(function (p) { return p.sku === 'RU-85'; });
  assert.strictEqual(rollup.unit_price, 92);
  assert.strictEqual(rollup.gross_price, 109.48);
});

test('search by number or name', async function () {
  assert.strictEqual((await albers.get('/api/v1/products?q=FL')).body.length, 2);
  assert.strictEqual((await albers.get('/api/v1/products?q=Rollup')).body.length, 1);
});

test('create, change, delete', async function () {
  const res = await brandt.post('/api/v1/products', { sku: 'WART-M', name: 'Wartung Website (Monat)', unit: 'Monat', unit_price: '125,00' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.unit_price, 125);
  assert.strictEqual(res.body.tax_rate, 19);
  const upd = await brandt.put('/api/v1/products/' + res.body.id, { unit_price: 130 });
  assert.strictEqual(upd.body.gross_price, 154.7);
  const del = await brandt.del('/api/v1/products/' + res.body.id);
  assert.strictEqual(del.status, 204);
});

test('number must be unique', async function () {
  const res = await albers.post('/api/v1/products', { sku: 'VK-100', name: 'nochmal', unit_price: 1 });
  assert.strictEqual(res.status, 409);
});

test('import a price list', async function () {
  const text = 'Artikelnummer;Bezeichnung;Einheit;Preis;USt\r\nVK-100;Visitenkarten 4/4, 350g (je 100 St.);Pack;3,95;19\r\nBUCH-SC;Buch Softcover je Ex.;Stück;4,18;7\r\n';
  const res = await albers.post('/api/v1/products/import', { csv: text });
  assert.deepStrictEqual(res.body, { created: 1, updated: 1, errors: [] });
  const vk = (await albers.get('/api/v1/products?q=VK-100')).body[0];
  assert.strictEqual(vk.unit_price, 3.95);
});

test('wrong input', async function () {
  const res = await albers.post('/api/v1/products', { sku: 'a b', name: '', unit_price: 'viel' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.errors.length, 3);
});

test('only own products', async function () {
  const list = await albers.get('/api/v1/products');
  const res = await brandt.get('/api/v1/products/' + list.body[0].id);
  assert.strictEqual(res.status, 404);
});
