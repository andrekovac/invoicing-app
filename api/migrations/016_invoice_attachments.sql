-- files that belong to an invoice: delivery note, order of the customer, signed offer.
-- small files only (the api takes 1 mb json), kept in the db so a backup of app.db has everything
CREATE TABLE invoice_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  data BLOB NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_invoice_attachments_invoice ON invoice_attachments(invoice_id, id);
