// demo data for development. run via `npm run db:reset`
const db = require('../db');
const invoices = require('../services/invoices');
const customers = require('../services/customers');
const auth = require('../lib/auth');
const addDays = require('../lib/utils').addDays;
const path = require('path');
const importer = require('../scripts/import-legacy');
const payments = require('../services/payments');
const pricing = require('../lib/pricing');
const money = require('../lib/money');
const products = require('../services/products');

var CUSTOMERS = [
  { name: 'Bäckerei Lindner', street: 'Severinstr. 41', zip: '50678', city: 'Köln', email: 'info@baeckerei-lindner.example' },
  { name: 'Schulz Immobilien GmbH', contact_name: 'Mia Schulz', street: 'Poppelsdorfer Allee 8', zip: '53115', city: 'Bonn', email: 'mia.schulz@example.com', phone: '0228 4711 20' },
  { name: 'Hofmann Logistik GmbH', contact_name: 'Peter Hofmann', street: 'Industriestr. 112', zip: '51373', city: 'Leverkusen', email: 'rechnung@hofmann-logistik.example', vat_id: 'DE281734992' },
  { name: 'Praxis Dr. Weber', contact_name: 'Dr. Anja Weber', street: 'Aachener Str. 220', zip: '50931', city: 'Köln', email: 'praxis@dr-weber.example' },
  { name: 'Café Rosenrot', street: 'Kasernenstr. 6', zip: '40213', city: 'Düsseldorf', email: 'hallo@cafe-rosenrot.example' }
];

// [customer index, issue date, status, tax rate %, items, extra]
var INVOICES = [
  [0, '2020-01-14', 'paid', 19, [['Website Relaunch, Konzept', 1, 1450], ['Fotografie Produkte (halber Tag)', 1, 380]]],
  [1, '2020-01-28', 'paid', 19, [['Exposé Vorlage InDesign', 1, 640], ['Druckdaten Aufbereitung', 3, 65]], { note: 'Zahlt immer spät, Mahnung sofort raus' }],
  [2, '2020-02-03', 'paid', 19, [['Wartung Website Februar', 1, 120], ['Hosting Q1', 3, 14.9]]],
  [3, '2020-02-11', 'paid', 19, [['Online Terminbuchung Einrichtung', 1, 890], ['Schulung Praxisteam', 2, 95]]],
  [4, '2020-02-17', 'paid', 19, [['Speisekarte Layout', 1, 280], ['Speisekarte Druck 200 Stk.', 200, 1.35]], { discount_percent: 5, note: 'Stammkunde, 5 % Rabatt vereinbart' }],
  [2, '2020-05-04', 'paid', 19, [['Wartung Website Mai', 1, 120], ['Hosting Q2', 3, 14.9]]],
  [1, '2020-06-15', 'paid', 19, [['Social Media Paket Juni', 1, 450]], { note: 'Zahlt immer spät, Mahnung sofort raus' }],
  [3, '2020-09-21', 'paid', 19, [['Hygienekonzept Aushänge (Layout)', 4, 35], ['Website Hinweisbanner', 1, 60]]],
  [0, '2020-11-30', 'issued', 19, [['Weihnachtsflyer', 1, 190], ['Druck 500 Stk.', 500, 0.18]]],
  [4, '2020-12-08', 'issued', 19, [['Online Bestellseite (Abholung)', 1, 980]], { discount_percent: 5 }],
  [1, '2021-01-18', 'issued', 19, [['Exposé Vorlage Gewerbe', 1, 520], ['Fotos Objekt Kessenich', 1, 240]], { note: 'Zahlt immer spät, Mahnung sofort raus. Mia Schulz direkt anrufen' }],
  [2, '2021-02-01', 'draft', 19, [['Wartung Website Februar', 1, 125], ['Hosting Q1', 3, 14.9]]],
  [4, '2021-02-05', 'draft', 7, [['Speisekarte Druck 100 Stk.', 100, 1.4]], { note: 'Steuersatz klären (Druckerzeugnis?)' }]
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
      tax_rate: row[3],
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

  seedAlbers(conn);
  require('./fixes-2023').apply();
  require('./recurring').apply();
}

// account 2: first customer from the old desktop program, data comes from its csv export
function seedAlbers(conn) {
  conn.prepare('INSERT INTO accounts (id, name, street, zip, city, iban, tax_number, email, plan) VALUES (2, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('Druckerei Albers KG', 'Nürnberger Str. 88', '97076', 'Würzburg', 'DE45 7905 0000 0042 1876 33', '257/141/30552',
      'info@druckerei-albers.example', 'pro');
  var addUser = conn.prepare('INSERT INTO users (account_id, email, name, password_hash, role) VALUES (2, ?, ?, ?, ?)');
  addUser.run('anna@druckerei-albers.example', 'Anna Albers', auth.hashPasswordSync('rechnungen'), 'admin');
  addUser.run('buchhaltung@druckerei-albers.example', 'Buchhaltung', auth.hashPasswordSync('rechnungen'), 'user');
  var stats = importer.importDir(path.join(__dirname, 'legacy'), 2);
  console.log('[seed] Druckerei Albers: ' + stats.customers + ' customers, ' + stats.invoices + ' invoices imported');
  seedAlbers2022();
}

// typed in by the Albers staff in 2022, with the new form (country is free text there)
var ALBERS_2022_CUSTOMERS = [
  { name: 'Buchbinderei Gruber', contact_name: 'Martin Gruber', street: 'Linzer Gasse 17', zip: '5020', city: 'Salzburg', country: 'Österreich', email: 'office@buchbinderei-gruber.example', vat_id: 'ATU63829417' },
  { name: 'Atelier Brunner', contact_name: 'Lena Brunner', street: 'Spalenberg 30', zip: '4051', city: 'Basel', country: 'Schweiz', email: 'lena@atelier-brunner.example' },
  { name: '=Huber & Co', contact_name: 'Herr Huber', street: 'Sanderstr. 4', zip: '97070', city: 'Würzburg', country: 'Deutschland', email: 'huber@huber-co.example', default_tax_rate: 19 },
  { name: 'Kanzlei Seidel', contact_name: 'Dr. Paul Seidel', street: 'Hofstr. 11', zip: '97070', city: 'Würzburg', country: 'Deutschland', email: 'post@kanzlei-seidel.example', default_tax_rate: 19 },
  { name: 'Fotostudio Licht', street: 'Eichhornstr. 2', zip: '97070', city: 'Würzburg', country: 'DE', email: 'studio@foto-licht.example' }
];

// [customer name, issue date, status, tax rate, items, extra]
var ALBERS_2022_INVOICES = [
  ['Buchbinderei Gruber', '2022-03-14', 'paid', 19, [['Umschläge Sonderformat 4/0', 400, 0.85], ['Prägefolie Gold', 1, 120]]],
  ['Atelier Brunner', '2022-04-04', 'issued', 19, [['Ausstellungskatalog 32 S., 4/4', 300, 4.2], ['Einladungskarten A6', 500, 0.32]]],
  ['=Huber & Co', '2022-05-09', 'paid', 19, [['Briefbogen 1/0', 2000, 0.06], ['Visitenkarten 4/4', 500, 0.09]]],
  ['Kanzlei Seidel', '2022-06-20', 'issued', 19, [['Mandantenbroschüre A5, 16 S.', 1200, 1], ['Satz und Layout (Std.)', 4, 55]], { partial: true }],
  ['Verlag Sonnenblick', '2022-07-11', 'issued', 7, [['Buch "Fränkische Küche", 2. Auflage', 800, 8.95], ['Lesebändchen', 800, 0.12]], { note: 'Bücher 7 %, Lieferung in zwei Teilen' }],
  ['Buchbinderei Gruber', '2022-09-05', 'issued', 19, [['Vorsatzpapier bedruckt', 600, 0.55], ['Andruck', 1, 85]], { note: 'Zahlt immer spät, Mahnung sofort raus' }],
  ['Fotostudio Licht', '2022-09-26', 'paid', 19, [['Fotobuch Hardcover 30x30', 12, 48.5]]],
  ['Weingut Hartmann', '2022-10-10', 'issued', 19, [['Messeflyer A5 4/4 (je 1000 St.)', 4, 69.9], ['Rollup 85x200 inkl. Kassette', 1, 92]]],
  ['=Huber & Co', '2022-10-17', 'draft', 19, [['Kalender 2023 A3', 100, 7.2]]]
];

function seedAlbers2022() {
  var ids = {};
  customers.list(2).forEach(function (c) { ids[c.name] = c.id; });
  ALBERS_2022_CUSTOMERS.forEach(function (c) {
    ids[c.name] = customers.create(2, c).id;
  });
  ALBERS_2022_INVOICES.forEach(function (row) {
    var extra = row[5] || {};
    var inv = invoices.create(2, {
      customer_id: ids[row[0]],
      issue_date: row[1],
      tax_rate: row[3],
      note: extra.note,
      items: row[4].map(function (it) {
        return { description: it[0], quantity: it[1], unit_price: it[2] };
      })
    });
    if (row[2] === 'draft') return;
    invoices.update(inv.id, { due_date: addDays(row[1], 14) });
    inv = invoices.issue(inv.id);
    if (row[2] === 'paid') {
      payments.recordPayment(inv, { amount: inv.total_gross, paid_at: addDays(row[1], 12), reference: inv.number });
    } else if (extra.partial) {
      // Anzahlung 50 % vom Nettobetrag der Broschüren, Rest offen
      payments.recordPayment(inv, { amount: money.round2(pricing.gross(1200, row[3]) / 2), paid_at: addDays(row[1], 7), reference: 'Anzahlung ' + inv.number });
    }
  });
  console.log('[seed] Druckerei Albers 2022: ' + ALBERS_2022_CUSTOMERS.length + ' customers, ' + ALBERS_2022_INVOICES.length + ' invoices');
  seedAlbers2024(ids);
}

// new customers 2024, typed in with the web app
var ALBERS_2024_CUSTOMERS = [
  { name: 'Müller Gartenbau', contact_name: 'Jana Müller', street: 'Am Mühlbach 9', zip: '97337', city: 'Dettelbach', country: 'Deutschland', email: 'jana@mueller-gartenbau.example', default_tax_rate: 19 },
  { name: 'Weingut Schäfer', contact_name: 'Tobias Schäfer', street: 'Hauptstr. 54', zip: '97332', city: 'Volkach', country: 'Deutschland', email: 'info@weingut-schaefer.example', default_tax_rate: 19 }
];

var ALBERS_2024_INVOICES = [
  ['Müller Gartenbau', '2024-03-18', 'paid', 19, [['Flyer DIN lang 4/4 (je 1000 St.)', 3, 58], ['Fahrzeugbeschriftung Entwurf', 1, 240]]],
  ['Weingut Schäfer', '2024-04-08', 'issued', 19, [['Etiketten Silvaner 2023, 4/0', 6000, 0.07], ['Halsschleifen', 6000, 0.03]]],
  ['Müller Gartenbau', '2024-04-22', 'issued', 19, [['Bautafel 120x80 Alu-Dibond', 2, 89.5]]]
];

// price list of the desktop program, typed into the new products page in 2024
var ALBERS_PRODUCTS = [
  ['VK-100', 'Visitenkarten 4/4, 350g (je 100 St.)', 'Pack', 3.85, 19],
  ['FL-A5', 'Flyer A5 4/4 (je 1000 St.)', 'Pack', 69.9, 19],
  ['FL-DL', 'Flyer DIN lang 4/4 (je 1000 St.)', 'Pack', 58, 19],
  ['BB-1000', 'Briefbogen 2-farbig (je 1000 St.)', 'Pack', 71.2, 19],
  ['RU-85', 'Rollup 85x200 inkl. Kassette', 'Stück', 92, 19],
  ['SATZ-H', 'Satz und Layout (Std.)', 'Std.', 55, 19],
  ['VERS-ST', 'Versand an Abonnenten (Stück)', 'Stück', 0.62, 19],
  ['DATEN', 'Datencheck', 'pauschal', 24.5, 19]
];

function seedAlbers2024(ids) {
  ALBERS_PRODUCTS.forEach(function (p) {
    products.create(2, { sku: p[0], name: p[1], unit: p[2], unit_price: p[3], tax_rate: p[4] });
  });
  ALBERS_2024_CUSTOMERS.forEach(function (c) {
    ids[c.name] = customers.create(2, c).id;
  });
  ALBERS_2024_INVOICES.forEach(function (row) {
    var inv = invoices.create(2, {
      customer_id: ids[row[0]],
      issue_date: row[1],
      tax_rate: row[3],
      items: row[4].map(function (it) {
        return { description: it[0], quantity: it[1], unit_price: it[2] };
      })
    });
    invoices.update(inv.id, { due_date: addDays(row[1], 14) });
    inv = invoices.issue(inv.id);
    if (row[2] === 'paid') payments.recordPayment(inv, { amount: inv.total_gross, paid_at: addDays(row[1], 9), reference: inv.number });
  });
  console.log('[seed] Druckerei Albers 2024: ' + ALBERS_2024_CUSTOMERS.length + ' customers, ' + ALBERS_2024_INVOICES.length + ' invoices');
}

if (require.main === module) {
  seed();
}

module.exports = { seed: seed };
