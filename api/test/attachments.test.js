// attachments of an invoice: /api/v1/invoices/:id/attachments
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');

let srv;
let api;
let other;
let invoiceId;

const PDF = Buffer.from('%PDF-1.4\n% Lieferschein 4711\n%%EOF\n').toString('base64');

test.before(async function () {
  srv = await helpers.startServer();
  api = helpers.client(srv.base);
  other = helpers.client(srv.base);
  await api.login('brandt');
  await other.login('albers');
  invoiceId = (await api.get('/api/v1/invoices?status=issued')).body[0].id;
});

test.after(function () {
  srv.stop();
});

test('upload, list and download a delivery note', async function () {
  const up = await api.post('/api/v1/invoices/' + invoiceId + '/attachments', { filename: 'C:\\Scans\\Lieferschein 4711.pdf', data: PDF, kind: 'delivery_note' });
  assert.strictEqual(up.status, 201);
  assert.strictEqual(up.body.filename, 'Lieferschein 4711.pdf');
  assert.strictEqual(up.body.mime, 'application/pdf');
  assert.strictEqual(up.body.kind, 'delivery_note');
  assert.strictEqual(up.body.data, undefined);

  const list = await api.get('/api/v1/invoices/' + invoiceId + '/attachments');
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.some(function (a) { return a.id === up.body.id; }));

  const file = await api.get('/api/v1/invoices/' + invoiceId + '/attachments/' + up.body.id);
  assert.strictEqual(file.status, 200);
  assert.strictEqual(file.headers.get('content-type'), 'application/pdf');
  assert.ok(String(file.body).indexOf('Lieferschein 4711') !== -1);
});

test('same file twice gives the first one back', async function () {
  const data = Buffer.from('Bestellung 2025-17').toString('base64');
  const a = await api.post('/api/v1/invoices/' + invoiceId + '/attachments', { filename: 'bestellung.txt', data: data, kind: 'order' });
  const b = await api.post('/api/v1/invoices/' + invoiceId + '/attachments', { filename: 'bestellung.txt', data: data, kind: 'order' });
  assert.strictEqual(a.status, 201);
  assert.strictEqual(b.status, 200);
  assert.strictEqual(a.body.id, b.body.id);
});

test('wrong type, no data or a fake pdf is refused', async function () {
  const exe = await api.post('/api/v1/invoices/' + invoiceId + '/attachments', { filename: 'tool.exe', data: PDF });
  assert.strictEqual(exe.status, 400);
  const empty = await api.post('/api/v1/invoices/' + invoiceId + '/attachments', { filename: 'leer.pdf', data: '' });
  assert.strictEqual(empty.status, 400);
  const fake = await api.post('/api/v1/invoices/' + invoiceId + '/attachments', { filename: 'scan.pdf', data: Buffer.from('hallo').toString('base64') });
  assert.strictEqual(fake.status, 400);
});

test('rename keeps the ending, delete removes it', async function () {
  const data = Buffer.from('Angebot 2025-03').toString('base64');
  const up = await api.post('/api/v1/invoices/' + invoiceId + '/attachments', { filename: 'angebot.txt', data: data });
  const url = '/api/v1/invoices/' + invoiceId + '/attachments/' + up.body.id;
  const ok = await api.put(url, { filename: 'Angebot unterschrieben.txt', kind: 'offer' });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.kind, 'offer');
  const bad = await api.put(url, { filename: 'angebot.pdf' });
  assert.strictEqual(bad.status, 400);
  const del = await api.del(url);
  assert.strictEqual(del.status, 204);
  assert.strictEqual((await api.get(url)).status, 404);
});

test('other account sees nothing', async function () {
  const res = await other.get('/api/v1/invoices/' + invoiceId + '/attachments');
  assert.strictEqual(res.status, 404);
});

test('timeline has the history, the attachments and the payments', async function () {
  const all = await api.get('/api/v1/invoices/' + invoiceId + '/timeline');
  assert.strictEqual(all.status, 200);
  const kinds = all.body.map(function (e) { return e.kind; });
  assert.ok(kinds.indexOf('event') !== -1);
  assert.ok(kinds.indexOf('attachment') !== -1);
  for (let i = 1; i < all.body.length; i++) assert.ok(all.body[i - 1].at >= all.body[i].at);

  const only = await api.get('/api/v1/invoices/' + invoiceId + '/timeline?kinds=attachment');
  only.body.forEach(function (e) { assert.strictEqual(e.kind, 'attachment'); });
  const wrong = await api.get('/api/v1/invoices/' + invoiceId + '/timeline?kinds=telefon');
  assert.strictEqual(wrong.status, 400);
  assert.strictEqual(wrong.body.errors[0].field, 'kinds');
});
