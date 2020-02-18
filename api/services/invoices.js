const db = require('../db');
const pricing = require('../lib/pricing');
const money = require('../lib/money');

function conn() {
  return db.open();
}

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function computeTotals(items, vatRate) {
  var net = pricing.sumItems(items);
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
  var totals = computeTotals(items, vat);
  var c = conn();
  c.exec('BEGIN');
  try {
    var info = c.prepare('INSERT INTO invoices (account_id, customer_id, status, issue_date, due_date, vat_rate, total_net, total_tax, total_gross) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(accountId, Number(data.customer_id), 'draft', data.issue_date || null, data.due_date || null, vat,
        totals.total_net, totals.total_tax, totals.total_gross);
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
  c.exec('BEGIN');
  try {
    if (data.items) {
      c.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
      insertItems(id, data.items);
    }
    var totals = computeTotals(itemsFor(id), vat);
    c.prepare('UPDATE invoices SET customer_id = ?, issue_date = ?, due_date = ?, vat_rate = ?, total_net = ?, total_tax = ?, total_gross = ?, updated_at = ? WHERE id = ?')
      .run(data.customer_id !== undefined ? Number(data.customer_id) : inv.customer_id,
        data.issue_date !== undefined ? data.issue_date : inv.issue_date,
        data.due_date !== undefined ? data.due_date : inv.due_date,
        vat, totals.total_net, totals.total_tax, totals.total_gross, now(), id);
    c.exec('COMMIT');
  } catch (err) {
    c.exec('ROLLBACK');
    throw err;
  }
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
  create: create,
  update: update,
  remove: remove
};
