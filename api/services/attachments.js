// attachments of an invoice (Lieferschein, Bestellung, ...). the file itself is a blob in
// invoice_attachments, list() never reads it
const crypto = require('crypto');
const db = require('../db');

const KINDS = ['delivery_note', 'order', 'offer', 'other'];
const MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  csv: 'text/csv'
};
const MAX_SIZE = 700 * 1024;
const MAX_PER_INVOICE = 10;

const COLUMNS = 'a.id, a.invoice_id, a.filename, a.mime, a.size, a.sha256, a.kind, a.created_at, a.uploaded_by, u.name AS uploaded_by_name';

function conn() {
  return db.open();
}

function extension(filename) {
  var m = /\.([a-z0-9]+)$/i.exec(String(filename || ''));
  return m ? m[1].toLowerCase() : '';
}

// only the name, no folders (windows paths from the browser too)
function cleanName(filename) {
  var name = String(filename || '').split(/[\\/]/).pop().trim();
  return name.replace(/[\u0000-\u001f"]/g, '').slice(0, 200);
}

function mimeFor(filename) {
  return MIME[extension(filename)] || null;
}

function list(invoiceId) {
  return conn().prepare('SELECT ' + COLUMNS + ' FROM invoice_attachments a LEFT JOIN users u ON u.id = a.uploaded_by ' +
    'WHERE a.invoice_id = ? ORDER BY a.id').all(invoiceId);
}

function countFor(invoiceId) {
  return conn().prepare('SELECT count(*) AS n FROM invoice_attachments WHERE invoice_id = ?').get(invoiceId).n;
}

function findById(id) {
  return conn().prepare('SELECT ' + COLUMNS + ', a.account_id FROM invoice_attachments a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.id = ?').get(id);
}

// with the file
function content(id) {
  return conn().prepare('SELECT filename, mime, size, data FROM invoice_attachments WHERE id = ?').get(id);
}

function add(inv, file, userId) {
  var data = Buffer.from(file.data);
  var sha = crypto.createHash('sha256').update(data).digest('hex');
  var info = conn().prepare('INSERT INTO invoice_attachments (invoice_id, account_id, filename, mime, size, sha256, kind, data, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(inv.id, inv.account_id, file.filename, file.mime, data.length, sha, file.kind || 'other', data, userId || null);
  return findById(Number(info.lastInsertRowid));
}

// same file twice on one invoice is almost always a double click
function findSame(invoiceId, data) {
  var sha = crypto.createHash('sha256').update(Buffer.from(data)).digest('hex');
  return conn().prepare('SELECT id FROM invoice_attachments WHERE invoice_id = ? AND sha256 = ?').get(invoiceId, sha) || null;
}

function rename(id, filename, kind) {
  var old = findById(id);
  if (!old) return null;
  conn().prepare('UPDATE invoice_attachments SET filename = ?, kind = ? WHERE id = ?')
    .run(filename || old.filename, kind || old.kind, id);
  return findById(id);
}

function remove(id) {
  return conn().prepare('DELETE FROM invoice_attachments WHERE id = ?').run(id).changes > 0;
}

module.exports = {
  KINDS: KINDS,
  MAX_SIZE: MAX_SIZE,
  MAX_PER_INVOICE: MAX_PER_INVOICE,
  cleanName: cleanName,
  mimeFor: mimeFor,
  list: list,
  countFor: countFor,
  findById: findById,
  content: content,
  add: add,
  findSame: findSame,
  rename: rename,
  remove: remove
};
