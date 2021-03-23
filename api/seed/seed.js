// demo data for development. run via `npm run db:reset`
const db = require('../db');
const invoices = require('../services/invoices');
const customers = require('../services/customers');
const auth = require('../lib/auth');
const addDays = require('../lib/utils').addDays;

var CUSTOMERS = [
  { name: 'Bäckerei Lindner', street: 'Severinstr. 41', zip: '50678', city: 'Köln', email: 'info@baeckerei-lindner.example' },
  { name: 'Schulz Immobilien GmbH', contact_name: 'Mia Schulz', street: 'Poppelsdorfer Allee 8', zip: '53115', city: 'Bonn', email: 'mia.schulz@example.com', phone: '0228 4711 20' },
  { name: 'Hofmann Logistik GmbH', contact_name: 'Peter Hofmann', street: 'Industriestr. 112', zip: '51373', city: 'Leverkusen', email: 'rechnung@hofmann-logistik.example', vat_id: 'DE281734992' },
  { name: 'Praxis Dr. Weber', contact_name: 'Dr. Anja Weber', street: 'Aachener Str. 220', zip: '50931', city: 'Köln', email: 'praxis@dr-weber.example' },
  { name: 'Café Rosenrot', street: 'Kasernenstr. 6', zip: '40213', city: 'Düsseldorf', email: 'hallo@cafe-rosenrot.example' }
];

// [customer index, issue date, status, vat, items, extra]
var INVOICES = [
  [0, '2020-01-14', 'paid', 0.19, [['Website Relaunch, Konzept', 1, 1450], ['Fotografie Produkte (halber Tag)', 1, 380]]],
  [1, '2020-01-28', 'paid', 0.19, [['Exposé Vorlage InDesign', 1, 640], ['Druckdaten Aufbereitung', 3, 65]], { note: 'Zahlt immer spät, Mahnung sofort raus' }],
  [2, '2020-02-03', 'paid', 0.19, [['Wartung Website Februar', 1, 120], ['Hosting Q1', 3, 14.9]]],
  [3, '2020-02-11', 'paid', 0.19, [['Online Terminbuchung Einrichtung', 1, 890], ['Schulung Praxisteam', 2, 95]]],
  [4, '2020-02-17', 'paid', 0.19, [['Speisekarte Layout', 1, 280], ['Speisekarte Druck 200 Stk.', 200, 1.35]], { discount_percent: 5, note: 'Stammkunde, 5 % Rabatt vereinbart' }],
  [2, '2020-05-04', 'paid', 0.19, [['Wartung Website Mai', 1, 120], ['Hosting Q2', 3, 14.9]]],
  [1, '2020-06-15', 'paid', 0.19, [['Social Media Paket Juni', 1, 450]], { note: 'Zahlt immer spät, Mahnung sofort raus' }],
  [3, '2020-09-21', 'paid', 0.19, [['Hygienekonzept Aushänge (Layout)', 4, 35], ['Website Hinweisbanner', 1, 60]]],
  [0, '2020-11-30', 'issued', 0.19, [['Weihnachtsflyer', 1, 190], ['Druck 500 Stk.', 500, 0.18]]],
  [4, '2020-12-08', 'issued', 0.19, [['Online Bestellseite (Abholung)', 1, 980]], { discount_percent: 5 }],
  [1, '2021-01-18', 'issued', 0.19, [['Exposé Vorlage Gewerbe', 1, 520], ['Fotos Objekt Kessenich', 1, 240]], { note: 'Zahlt immer spät, Mahnung sofort raus. Mia Schulz direkt anrufen' }],
  [2, '2021-02-01', 'draft', 0.19, [['Wartung Website Februar', 1, 125], ['Hosting Q1', 3, 14.9]]],
  [4, '2021-02-05', 'draft', 0.07, [['Speisekarte Druck 100 Stk.', 100, 1.4]], { note: 'Steuersatz klären (Druckerzeugnis?)' }]
];

function seed() {
  var conn = db.open();
  var acc = conn.prepare('SELECT id FROM accounts WHERE id = 1').get();
  if (!acc) {
    conn.prepare('INSERT INTO accounts (id, name, street, zip, city, iban, tax_number) VALUES (1, ?, ?, ?, ?, ?, ?)')
      .run('Agentur Brandt', 'Hansaring 12', '50670', 'Köln', 'DE02 1001 0010 0123 4567 89', '214/5678/1234');
  }

  var addUser = conn.prepare('INSERT INTO users (account_id, email, name, password_hash, role) VALUES (1, ?, ?, ?, ?)');
  addUser.run('jonas@agentur-brandt.example', 'Jonas Brandt', auth.hashPasswordSync('rechnungen'), 'admin');
  addUser.run('buero@agentur-brandt.example', 'Büro', auth.hashPasswordSync('rechnungen'), 'user');

  var ids = CUSTOMERS.map(function (c) {
    return customers.create(1, c).id;
  });

  INVOICES.forEach(function (row) {
    var extra = row[5] || {};
    var inv = invoices.create(1, {
      customer_id: ids[row[0]],
      issue_date: row[1],
      vat_rate: row[3],
      discount_percent: extra.discount_percent,
      note: extra.note,
      items: row[4].map(function (it) {
        return { description: it[0], quantity: it[1], unit_price: it[2] };
      })
    });
    if (row[2] !== 'draft') {
      invoices.update(inv.id, { due_date: addDays(row[1], 14) });
      invoices.issue(inv.id);
      if (row[2] === 'paid') invoices.markPaid(inv.id, addDays(row[1], row[5] && row[5].note ? 30 : 10));
      else if (row[2] !== 'issued') invoices.setStatus(inv.id, row[2]);
    }
  });

  console.log('[seed] ' + CUSTOMERS.length + ' customers, ' + INVOICES.length + ' invoices');
}

if (require.main === module) {
  seed();
}

module.exports = { seed: seed };
