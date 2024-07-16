-- recurring invoices: a template invoice is copied every interval_months on day_of_month
CREATE TABLE recurring_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  template_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  title TEXT,
  interval_months INTEGER NOT NULL DEFAULT 1,
  day_of_month INTEGER NOT NULL DEFAULT 1,
  payment_days INTEGER NOT NULL DEFAULT 14,
  start_date TEXT NOT NULL,
  end_date TEXT,
  next_date TEXT,
  auto_issue INTEGER NOT NULL DEFAULT 1,
  send_mail INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_recurring_next ON recurring_invoices(active, next_date);

ALTER TABLE invoices ADD COLUMN recurring_id INTEGER REFERENCES recurring_invoices(id) ON DELETE SET NULL;
