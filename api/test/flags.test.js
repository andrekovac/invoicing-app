// feature flags: lib/flags.js and /api/v1/admin/flags
const test = require('node:test');
const assert = require('node:assert');
const helpers = require('./helpers');
const flags = require('../lib/flags');

let srv;
let admin;
let user;

test.before(async function () {
  srv = await helpers.startServer();
  admin = helpers.client(srv.base);
  user = helpers.client(srv.base);
  await admin.login('brandt');
  await user.login('brandtUser');
});

test.after(function () {
  srv.stop();
});

test('known flag has its default', function () {
  assert.strictEqual(flags.isOn(1, 'NEW_PDF_LAYOUT'), false);
});

test('unknown flag is off', function () {
  assert.strictEqual(flags.isOn(1, 'NOPE'), false);
});

test('account row wins over the row for all accounts', function () {
  flags.set(0, 'NEW_PDF_LAYOUT', true);
  flags.set(2, 'NEW_PDF_LAYOUT', false);
  assert.strictEqual(flags.isOn(1, 'NEW_PDF_LAYOUT'), true);
  assert.strictEqual(flags.isOn(2, 'NEW_PDF_LAYOUT'), false);
  flags.reset(0, 'NEW_PDF_LAYOUT');
  flags.reset(2, 'NEW_PDF_LAYOUT');
  assert.strictEqual(flags.isOn(1, 'NEW_PDF_LAYOUT'), false);
});

test('FLAGS_ON from the environment', function () {
  process.env.FLAGS_ON = 'NEW_PDF_LAYOUT';
  try {
    assert.strictEqual(flags.isOn(1, 'NEW_PDF_LAYOUT'), true);
  } finally {
    delete process.env.FLAGS_ON;
  }
});

test('admin lists and switches flags', async function () {
  const list = await admin.get('/api/v1/admin/flags');
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.find(function (f) { return f.name === 'NEW_PDF_LAYOUT'; }));

  const on = await admin.put('/api/v1/admin/flags/NEW_PDF_LAYOUT', { enabled: true });
  assert.strictEqual(on.status, 200);
  assert.strictEqual(on.body.enabled, true);
  assert.strictEqual(on.body.overridden, true);

  const back = await admin.put('/api/v1/admin/flags/NEW_PDF_LAYOUT', { enabled: null });
  assert.strictEqual(back.body.enabled, false);
  assert.strictEqual(back.body.overridden, false);
});

test('flags need admin', async function () {
  const res = await user.get('/api/v1/admin/flags');
  assert.strictEqual(res.status, 403);
});

test('wrong flag name or value', async function () {
  assert.strictEqual((await admin.put('/api/v1/admin/flags/NOPE', { enabled: true })).status, 404);
  assert.strictEqual((await admin.put('/api/v1/admin/flags/NEW_PDF_LAYOUT', { enabled: 'yes' })).status, 400);
});

test('NEW_PDF_LAYOUT changes the text version of the pdf', async function () {
  const list = await admin.get('/api/v1/invoices?status=issued');
  const id = list.body[0].id;
  const before = await admin.get('/api/v1/invoices/' + id + '/pdf?format=txt');
  assert.ok(before.body.indexOf('Gesamt') !== -1);
  await admin.put('/api/v1/admin/flags/NEW_PDF_LAYOUT', { enabled: true });
  try {
    const after = await admin.get('/api/v1/invoices/' + id + '/pdf?format=txt');
    assert.ok(after.body.indexOf('Rechnungsbetrag') !== -1);
    assert.strictEqual(after.body.indexOf('IBAN'), -1);
  } finally {
    await admin.put('/api/v1/admin/flags/NEW_PDF_LAYOUT', { enabled: null });
  }
});
