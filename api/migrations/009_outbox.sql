-- mails are written here first. a mail service picks them up later (sent_at), for now we only log them
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  template TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE INDEX idx_outbox_invoice ON outbox(invoice_id, template);
