// import from the old desktop program. it exports three csv files:
//   kunden.csv      KdNr;Firma;Ansprechpartner;Strasse;PLZ;Ort;Land;Email;Telefon;UStIdNr;StdUSt
//   rechnungen.csv  ReNr;KdNr;Datum;Faellig;Status;USt;Rabatt;Netto;Brutto;BezahltAm;Bemerkung
//   positionen.csv  ReNr;Pos;Text;Menge;Einzelpreis
//
// usage:
//   node scripts/import-legacy.js <folder> --account 2
//   node scripts/import-legacy.js <folder> --new "Firma GmbH"
//   add --dry to only check the files
//
// Achtung: Einzelpreise kommen mit 4 Nachkommastellen (12,3450) und werden genau so
// übernommen, sonst stimmen die Summen nicht mehr mit dem alten Programm überein.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const csv = require('../lib/csv');
const money = require('../lib/money');
const pricing = require('../lib/pricing');

const STATUS = { bezahlt: 'paid', offen: 'issued', storniert: 'cancelled', entwurf: 'draft' };

function readCsv(dir, name) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) throw new Error('missing ' + file);
  return csv.toObjects(csv.parse(fs.readFileSync(file, 'utf8')));
}

function num(s) {
  if (s === undefined || s === null || String(s).trim() === '') return 0;
  return money.parseEuro(s);
}

// totals like the old program did: sum of quantity * price, discount, then tax
function legacyTotals(items, rate, discount) {
  let net = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
  if (discount) net = net * (1 - discount / 100);
  const totalGross = money.round2(pricing.gross(net, rate));
  const totalNet = money.round2(net);
  return { total_net: totalNet, total_tax: money.round2(totalGross - totalNet), total_gross: totalGross };
}

function readExport(dir) {
  const kunden = readCsv(dir, 'kunden.csv');
  const rechnungen = readCsv(dir, 'rechnungen.csv');
  const positionen = readCsv(dir, 'positionen.csv');
  const warnings = [];

  const customers = kunden.map(k => ({
    legacy_no: k.KdNr,
    name: k.Firma,
    contact_name: k.Ansprechpartner || null,
    street: k.Strasse || null,
    zip: k.PLZ || null,
    city: k.Ort || null,
    country: k.Land || '',
    email: k.Email || null,
    phone: k.Telefon || null,
    vat_id: k.UStIdNr || null,
    default_tax_rate: k.StdUSt ? parseInt(k.StdUSt, 10) : null
  }));
  const known = {};
  customers.forEach(c => { known[c.legacy_no] = c; });

  const itemsByNr = {};
  positionen.forEach(p => {
    const it = {
      position: parseInt(p.Pos, 10) || 0,
      description: p.Text,
      quantity: num(p.Menge),
      unit_price: num(p.Einzelpreis)
    };
    if (isNaN(it.quantity) || isNaN(it.unit_price)) {
      warnings.push(`Position ${p.ReNr}/${p.Pos}: Menge oder Preis nicht lesbar`);
      return;
    }
    (itemsByNr[p.ReNr] = itemsByNr[p.ReNr] || []).push(it);
  });

  const invoices = [];
  rechnungen.forEach(r => {
    if (!known[r.KdNr]) {
      warnings.push(`Rechnung ${r.ReNr}: Kunde ${r.KdNr} fehlt`);
      return;
    }
    const status = STATUS[String(r.Status).toLowerCase()];
    if (!status) {
      warnings.push(`Rechnung ${r.ReNr}: Status "${r.Status}" unbekannt`);
      return;
    }
    const items = (itemsByNr[r.ReNr] || []).sort((a, b) => a.position - b.position);
    const rate = parseInt(r.USt, 10);
    if (!pricing.isValidRate(rate)) warnings.push(`Rechnung ${r.ReNr}: Steuersatz ${r.USt} %`);
    const discount = num(r.Rabatt) || 0;
    const totals = legacyTotals(items, rate, discount);
    const exported = num(r.Brutto);
    if (Math.abs(exported - totals.total_gross) > 0.005) {
      warnings.push(`Rechnung ${r.ReNr}: Brutto im Export ${r.Brutto}, berechnet ${money.formatEuro(totals.total_gross)}`);
    }
    invoices.push({
      legacy_no: r.ReNr,
      customer_no: r.KdNr,
      number: /^\d{4}-\d+$/.test(r.ReNr) ? 'RE-' + r.ReNr : r.ReNr,
      status: status,
      issue_date: csv.deDate(r.Datum),
      due_date: csv.deDate(r.Faellig),
      paid_at: csv.deDate(r.BezahltAm),
      rate: rate,
      discount_percent: discount,
      note: r.Bemerkung || null,
      items: items,
      totals: totals
    });
  });

  return { customers, invoices, warnings };
}

function importDir(dir, accountId, opts) {
  opts = opts || {};
  const data = readExport(dir);
  const stats = { customers: 0, invoices: 0, items: 0, skipped: 0, warnings: data.warnings };
  if (opts.dry) {
    stats.customers = data.customers.length;
    stats.invoices = data.invoices.length;
    return stats;
  }

  const c = db.open();
  const findCustomer = c.prepare('SELECT id FROM customers WHERE account_id = ? AND legacy_no = ?');
  const addCustomer = c.prepare('INSERT INTO customers (account_id, legacy_no, name, contact_name, street, zip, city, country, email, phone, vat_id, default_tax_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const findInvoice = c.prepare('SELECT id FROM invoices WHERE account_id = ? AND legacy_no = ?');
  const addInvoice = c.prepare('INSERT INTO invoices (account_id, customer_id, legacy_no, number, status, issue_date, due_date, paid_at, vat_rate, discount_percent, note, total_net, total_tax, total_gross, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const addItem = c.prepare('INSERT INTO invoice_items (invoice_id, position, description, quantity, unit_price) VALUES (?, ?, ?, ?, ?)');

  c.exec('BEGIN');
  try {
    const ids = {};
    data.customers.forEach(k => {
      const old = findCustomer.get(accountId, k.legacy_no);
      if (old) {
        ids[k.legacy_no] = old.id;
        stats.skipped++;
        return;
      }
      const info = addCustomer.run(accountId, k.legacy_no, k.name, k.contact_name, k.street, k.zip, k.city, k.country,
        k.email, k.phone, k.vat_id, k.default_tax_rate);
      ids[k.legacy_no] = Number(info.lastInsertRowid);
      stats.customers++;
    });

    data.invoices.forEach(r => {
      if (findInvoice.get(accountId, r.legacy_no)) {
        stats.skipped++;
        return;
      }
      const t = r.totals;
      const info = addInvoice.run(accountId, ids[r.customer_no], r.legacy_no, r.number, r.status, r.issue_date, r.due_date,
        r.status === 'paid' ? r.paid_at : null, r.rate / 100, r.discount_percent, r.note,
        t.total_net, t.total_tax, t.total_gross, (r.issue_date || '') + ' 12:00:00');
      const id = Number(info.lastInsertRowid);
      // unit_price exactly as exported, 4 decimals
      r.items.forEach((it, i) => {
        addItem.run(id, it.position || i + 1, it.description, it.quantity, it.unit_price);
        stats.items++;
      });
      stats.invoices++;
    });

    c.prepare('INSERT INTO imports (account_id, source, customers, invoices, items, warnings) VALUES (?, ?, ?, ?, ?, ?)')
      .run(accountId, path.basename(path.resolve(dir)), stats.customers, stats.invoices, stats.items,
        data.warnings.length ? data.warnings.join('\n') : null);
    c.exec('COMMIT');
  } catch (err) {
    c.exec('ROLLBACK');
    throw err;
  }
  return stats;
}

function main(argv) {
  const dir = argv[0];
  if (!dir || dir.indexOf('--') === 0) {
    console.log('usage: node scripts/import-legacy.js <folder> (--account <id> | --new "<name>") [--dry]');
    process.exit(1);
  }
  const dry = argv.indexOf('--dry') !== -1;
  let accountId = null;
  const a = argv.indexOf('--account');
  const n = argv.indexOf('--new');
  if (a !== -1) accountId = Number(argv[a + 1]);
  const conn = db.open();
  if (n !== -1 && !dry) {
    accountId = Number(conn.prepare('INSERT INTO accounts (name) VALUES (?)').run(argv[n + 1]).lastInsertRowid);
    console.log('[import] new account ' + accountId + ' ' + argv[n + 1]);
  }
  if (!dry && (!accountId || !conn.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId))) {
    console.log('[import] account not found');
    process.exit(1);
  }
  const stats = importDir(dir, accountId, { dry: dry });
  stats.warnings.forEach(w => console.log('[import] warning: ' + w));
  console.log(`[import] ${dry ? '(dry) ' : ''}${stats.customers} customers, ${stats.invoices} invoices, ${stats.items} items, ${stats.skipped} skipped`);
  db.close();
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { importDir, readExport, legacyTotals };
