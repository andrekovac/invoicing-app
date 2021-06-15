-- customers and invoices from the old desktop program (csv export, see scripts/import-legacy.js)
ALTER TABLE customers ADD COLUMN country TEXT;
ALTER TABLE customers ADD COLUMN default_tax_rate INTEGER;
ALTER TABLE customers ADD COLUMN legacy_no TEXT;
ALTER TABLE invoices ADD COLUMN legacy_no TEXT;

CREATE TABLE imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  source TEXT NOT NULL,
  customers INTEGER NOT NULL DEFAULT 0,
  invoices INTEGER NOT NULL DEFAULT 0,
  items INTEGER NOT NULL DEFAULT 0,
  warnings TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
