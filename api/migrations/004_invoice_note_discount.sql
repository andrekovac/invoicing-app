-- note is internal, never printed
ALTER TABLE invoices ADD COLUMN note TEXT;
ALTER TABLE invoices ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN paid_at TEXT;
