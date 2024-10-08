-- products / services with a fixed price ("Artikel"), picked in the invoice form.
-- the invoice items keep their own copy of text and price
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  unit_price REAL NOT NULL,
  tax_rate INTEGER NOT NULL DEFAULT 19,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE (account_id, sku)
);
