// products ("Artikel"): text, unit and net price to pick in the invoice form
const db = require('../db');
const money = require('../lib/money');
const pricing = require('../lib/pricing');
const csv = require('../lib/csv');

const FIELDS = ['sku', 'name', 'unit', 'unit_price', 'tax_rate'];

function conn() {
  return db.open();
}

// with the gross price, the form shows both
function withGross(p) {
  if (!p) return p;
  p.gross_price = money.round2(p.unit_price + pricing.taxAmount(p.unit_price, p.tax_rate));
  return p;
}

function list(accountId, opts) {
  opts = opts || {};
  var sql = 'SELECT * FROM products WHERE account_id = ?';
  var args = [accountId];
  if (!opts.all) sql += ' AND active = 1';
  if (opts.q) {
    sql += ' AND (sku LIKE ? OR name LIKE ?)';
    args.push(opts.q + '%', '%' + opts.q + '%');
  }
  sql += ' ORDER BY sku';
  var stmt = conn().prepare(sql);
  return stmt.all.apply(stmt, args).map(withGross);
}

function findById(id) {
  return withGross(conn().prepare('SELECT * FROM products WHERE id = ?').get(id));
}

function findBySku(accountId, sku) {
  return withGross(conn().prepare('SELECT * FROM products WHERE account_id = ? AND sku = ?').get(accountId, sku));
}

function create(accountId, data) {
  var info = conn().prepare('INSERT INTO products (account_id, sku, name, unit, unit_price, tax_rate) VALUES (?, ?, ?, ?, ?, ?)')
    .run(accountId, String(data.sku).trim(), String(data.name).trim(), data.unit || null, money.roundPrice(data.unit_price),
      data.tax_rate !== undefined ? Number(data.tax_rate) : 19);
  return findById(Number(info.lastInsertRowid));
}

function update(id, data) {
  var sets = [];
  var vals = [];
  FIELDS.concat(['active']).forEach(function (f) {
    if (data[f] === undefined) return;
    var v = data[f];
    if (f === 'unit_price') v = money.roundPrice(v);
    if (f === 'active') v = v ? 1 : 0;
    sets.push(f + ' = ?');
    vals.push(v);
  });
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    var stmt = conn().prepare('UPDATE products SET ' + sets.join(', ') + ' WHERE id = ?');
    stmt.run.apply(stmt, vals);
  }
  return findById(id);
}

// used on invoices: archive only (the items have their own copy anyway, but people asked)
function usedOn(accountId, p) {
  return conn().prepare('SELECT count(*) AS n FROM invoice_items it JOIN invoices i ON i.id = it.invoice_id WHERE i.account_id = ? AND it.description = ?')
    .get(accountId, p.name).n;
}

function remove(accountId, id) {
  var p = findById(id);
  if (!p) return false;
  if (usedOn(accountId, p)) {
    update(id, { active: false });
    return 'archived';
  }
  conn().prepare('DELETE FROM products WHERE id = ?').run(id);
  return 'deleted';
}

// "Artikelnummer;Bezeichnung;Einheit;Preis;USt" like the price list of the desktop program.
// existing numbers are updated, new ones added
function importCsv(accountId, text) {
  var rows = csv.toObjects(csv.parse(text));
  var result = { created: 0, updated: 0, errors: [] };
  rows.forEach(function (r, i) {
    var sku = r.Artikelnummer || r.sku;
    var name = r.Bezeichnung || r.name;
    var price = money.parseEuro(r.Preis || r.unit_price);
    var rate = r.USt === undefined || r.USt === '' ? 19 : Number(String(r.USt).replace('%', '').trim());
    if (!sku || !name) return result.errors.push({ line: i + 2, message: 'Artikelnummer oder Bezeichnung fehlt' });
    if (isNaN(price) || price < 0) return result.errors.push({ line: i + 2, message: 'Preis ungültig' });
    if (!pricing.isValidRate(rate)) return result.errors.push({ line: i + 2, message: 'Steuersatz ungültig' });
    var old = findBySku(accountId, sku);
    if (old) {
      update(old.id, { name: name, unit: r.Einheit || old.unit, unit_price: price, tax_rate: rate, active: true });
      result.updated++;
    } else {
      create(accountId, { sku: sku, name: name, unit: r.Einheit || null, unit_price: price, tax_rate: rate });
      result.created++;
    }
  });
  return result;
}

module.exports = {
  FIELDS: FIELDS,
  list: list,
  findById: findById,
  findBySku: findBySku,
  create: create,
  update: update,
  remove: remove,
  importCsv: importCsv
};
