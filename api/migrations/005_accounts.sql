-- more than one company uses the tool now. the agency stays account 1
ALTER TABLE accounts ADD COLUMN email TEXT;
ALTER TABLE accounts ADD COLUMN plan TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE accounts ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
CREATE INDEX idx_customers_account ON customers(account_id);
CREATE INDEX idx_invoices_account ON invoices(account_id, status);
