const db = require('../db');
const pricing = require('../lib/pricing');
const money = require('../lib/money');

function conn() {
  return db.open();
}

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function computeTotals(items, vatRate, discountPercent) {
  var net = pricing.sumItems(items);
  if (discountPercent) net = net * (1 - discountPercent / 100);
  var totalGross = money.round2(pricing.gross(net, vatRate * 100));
  var totalNet = money.round2(net);
  return {
    total_net: totalNet,
    total_tax: money.round2(totalGross - totalNet),
    total_gross: totalGross
  };
}

function findById(id) {
  return conn().prepare('SELECT * FROM invoices WHERE id = ?').get(id);
}

function itemsFor(invoiceId) {
  return conn().prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position, id').all(invoiceId);
}

// invoice with items and customer, used by the detail page and the pdf
function getById(id) {
  var inv = findById(id);
  if (!inv) return null;
  inv.items = itemsFor(id);
  inv.customer = conn().prepare('SELECT * FROM customers WHERE id = ?').get(inv.customer_id);
  return inv;
}

function list(accountId, opts) {
  opts = opts || {};
  var sql = 'SELECT i.*, c.name AS customer_name FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.account_id = ?';
  var args = [accountId];
  if (opts.status) {
    sql += ' AND i.status = ?';
    args.push(opts.status);
  }
  if (opts.q) {
    sql += ' AND (i.number LIKE ? OR c.name LIKE ?)';
    args.push('%' + opts.q + '%', '%' + opts.q + '%');
  }
  if (opts.customer_id) {
    sql += ' AND i.customer_id = ?';
    args.push(Number(opts.customer_id));
  }
  sql += ' ORDER BY i.id DESC';
  var stmt = conn().prepare(sql);
  return stmt.all.apply(stmt, args);
}

function insertItems(invoiceId, items) {
  var stmt = conn().prepare('INSERT INTO invoice_items (invoice_id, position, description, quantity, unit_price) VALUES (?, ?, ?, ?, ?)');
  items.forEach(function (it, i) {
    stmt.run(invoiceId, i + 1, it.description, Number(it.quantity), Number(it.unit_price));
  });
}

function create(accountId, data) {
  var items = data.items || [];
  var vat = data.vat_rate !== undefined ? Number(data.vat_rate) : 0.19;
  var discount = Number(data.discount_percent) || 0;
  var totals = computeTotals(items, vat, discount);
  var c = conn();
  c.exec('BEGIN');
  try {
    var info = c.prepare('INSERT INTO invoices (account_id, customer_id, status, issue_date, due_date, vat_rate, discount_percent, note, total_net, total_tax, total_gross) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(accountId, Number(data.customer_id), 'draft', data.issue_date || null, data.due_date || null, vat, discount,
        data.note || null, totals.total_net, totals.total_tax, totals.total_gross);
    var id = Number(info.lastInsertRowid);
    insertItems(id, items);
    c.exec('COMMIT');
    return getById(id);
  } catch (err) {
    c.exec('ROLLBACK');
    throw err;
  }
}

function update(id, data) {
  var inv = findById(id);
  if (!inv) return null;
  var c = conn();
  var vat = data.vat_rate !== undefined ? Number(data.vat_rate) : inv.vat_rate;
  var discount = data.discount_percent !== undefined ? (Number(data.discount_percent) || 0) : inv.discount_percent;
  c.exec('BEGIN');
  try {
    if (data.items) {
      c.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
      insertItems(id, data.items);
    }
    var totals = computeTotals(itemsFor(id), vat, discount);
    c.prepare('UPDATE invoices SET customer_id = ?, issue_date = ?, due_date = ?, vat_rate = ?, discount_percent = ?, note = ?, total_net = ?, total_tax = ?, total_gross = ?, updated_at = ? WHERE id = ?')
      .run(data.customer_id !== undefined ? Number(data.customer_id) : inv.customer_id,
        data.issue_date !== undefined ? data.issue_date : inv.issue_date,
        data.due_date !== undefined ? data.due_date : inv.due_date,
        vat, discount,
        data.note !== undefined ? data.note : inv.note,
        totals.total_net, totals.total_tax, totals.total_gross, now(), id);
    c.exec('COMMIT');
  } catch (err) {
    c.exec('ROLLBACK');
    throw err;
  }
  return getById(id);
}

function pad(n, len) {
  var s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
}

// RE-2020-0001, counts per account and year
function nextNumber(accountId, year) {
  var prefix = 'RE-' + year + '-';
  var last = conn().prepare('SELECT number FROM invoices WHERE account_id = ? AND number LIKE ? ORDER BY number DESC LIMIT 1')
    .get(accountId, prefix + '%');
  var n = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
  return prefix + pad(n, 4);
}

function findByNumber(accountId, number) {
  return conn().prepare('SELECT * FROM invoices WHERE account_id = ? AND number = ?').get(accountId, number);
}

function addDays(dateStr, days) {
  var d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// draft -> issued. number is given out here, not on create, so drafts don't burn numbers
function issue(id) {
  var inv = findById(id);
  if (!inv) return null;
  if (inv.status !== 'draft') {
    var err = new Error('Rechnung ist schon gestellt');
    err.status = 409;
    throw err;
  }
  var issueDate = inv.issue_date || new Date().toISOString().slice(0, 10);
  var dueDate = inv.due_date || addDays(issueDate, 14);
  var number = nextNumber(inv.account_id, issueDate.slice(0, 4));
  conn().prepare("UPDATE invoices SET status = 'issued', number = ?, issue_date = ?, due_date = ?, updated_at = ? WHERE id = ?")
    .run(number, issueDate, dueDate, now(), id);
  return getById(id);
}

function setStatus(id, status) {
  conn().prepare('UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  return getById(id);
}

function markPaid(id, paidAt) {
  conn().prepare("UPDATE invoices SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?")
    .run(paidAt || new Date().toISOString().slice(0, 10), now(), id);
  return getById(id);
}

// only the note, works for issued invoices too
function setNote(id, note) {
  conn().prepare('UPDATE invoices SET note = ?, updated_at = ? WHERE id = ?').run(note || null, now(), id);
  return getById(id);
}

function remove(id) {
  conn().prepare('DELETE FROM invoices WHERE id = ?').run(id);
}

module.exports = {
  computeTotals: computeTotals,
  findById: findById,
  getById: getById,
  itemsFor: itemsFor,
  list: list,
  nextNumber: nextNumber,
  findByNumber: findByNumber,
  issue: issue,
  setStatus: setStatus,
  markPaid: markPaid,
  setNote: setNote,
  create: create,
  update: update,
  remove: remove
};
