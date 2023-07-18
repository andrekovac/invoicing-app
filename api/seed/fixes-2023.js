// changes the Albers staff made by hand in 2023, so the demo data looks like production.
// runs after the import in seed.js
const db = require('../db');
const customers = require('../services/customers');
const invoices = require('../services/invoices');

const ALBERS = 2;

// Krause GmbH moved in March 2023. They asked for all their invoices with the new
// address (for their auditor), so the office opened each one in the admin form and saved it
const KRAUSE_ADDRESS = {
  street: 'Carl-Benz-Str. 21',
  zip: '97424',
  city: 'Schweinfurt',
  contact_name: 'Thomas Krause',
  email: 'buchhaltung@krause-gmbh.example'
};

// what the admin form sends on save: all fields and all items
function formBody(inv) {
  return {
    customer_id: inv.customer_id,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    note: inv.note,
    items: inv.items.map(function (it) {
      return { description: it.description, quantity: it.quantity, unit_price: it.unit_price };
    })
  };
}

function krauseAddress() {
  const krause = db.open().prepare('SELECT * FROM customers WHERE account_id = ? AND name = ?').get(ALBERS, 'Krause GmbH');
  if (!krause) return 0;
  customers.update(krause.id, KRAUSE_ADDRESS);
  const list = invoices.list(ALBERS, { customer_id: krause.id });
  list.forEach(function (row) {
    const inv = invoices.getById(row.id);
    if (inv.status === 'cancelled') return;
    invoices.update(inv.id, formBody(inv));
  });
  return list.length;
}

function apply() {
  const n = krauseAddress();
  console.log('[seed] fixes 2023: Krause GmbH new address, ' + n + ' invoices saved');
}

if (require.main === module) {
  apply();
}

module.exports = { apply: apply, formBody: formBody };
