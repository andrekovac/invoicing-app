// recurring invoices of the demo data. Verlag Sonnenblick (Albers) prints its monthly
// magazine at Albers from 2025 on, the contract was set up in summer 2024.
// the copies for 2025 are made here like the job would have made them. the contract ends
// with the October issue
const db = require('../db');
const invoices = require('../services/invoices');
const recurring = require('../services/recurring');
const payments = require('../services/payments');
const addDays = require('../lib/utils').addDays;

const ALBERS = 2;

function sonnenblick() {
  const c = db.open().prepare('SELECT * FROM customers WHERE account_id = ? AND name = ?').get(ALBERS, 'Verlag Sonnenblick');
  if (!c) return null;

  // the test issue from August 2024 is the template
  let tpl = invoices.create(ALBERS, {
    customer_id: c.id,
    issue_date: '2024-08-05',
    tax_rate: 7,
    note: 'Vorlage für das Monatsheft ab 2025 (Vertrag vom 29.07.2024)',
    items: [
      { description: 'Monatsheft "Fränkisch genießen" {monat} {jahr}, 32 S., 4/4, 1.200 Ex.', quantity: 1, unit_price: 2860 },
      { description: 'Versand an Abonnenten (Stück)', quantity: 950, unit_price: 0.62 }
    ]
  });
  tpl = invoices.update(tpl.id, { due_date: addDays('2024-08-05', 14) });
  tpl = invoices.issue(tpl.id);
  payments.recordPayment(tpl, { amount: tpl.total_gross, paid_at: '2024-08-21', reference: tpl.number });

  const rec = recurring.create(ALBERS, {
    template_invoice_id: tpl.id,
    title: 'Monatsheft Fränkisch genießen 2025',
    start_date: '2025-01-01',
    end_date: '2025-10-31',
    day_of_month: 5,
    interval_months: 1,
    payment_days: 14
  });
  const created = recurring.runDue(ALBERS, '2025-10-05').filter(r => r.recurring_id === rec.id);

  // Jan to Jul are paid (what was on the invoice), the last three are open
  created.forEach(function (r) {
    if (r.date > '2025-07-31') return;
    const inv = invoices.findById(r.invoice_id);
    payments.recordPayment(inv, { amount: inv.total_gross, paid_at: addDays(r.date, 12), reference: inv.number });
  });
  return created.length;
}

function apply() {
  const n = sonnenblick();
  console.log('[seed] recurring: Verlag Sonnenblick monthly magazine, ' + n + ' invoices');
}

if (require.main === module) {
  apply();
}

module.exports = { apply: apply };
