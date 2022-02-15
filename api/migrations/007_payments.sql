-- payments per invoice (bank transfer, card). an invoice is paid when the payments reach total_gross
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'transfer',
  paid_at TEXT NOT NULL,
  reference TEXT,
  provider_ref TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);

-- every try with CardPay, also the failed ones (support asks for them)
CREATE TABLE card_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  invoice_ids TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  provider_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
