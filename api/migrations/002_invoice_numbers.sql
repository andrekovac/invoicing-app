CREATE UNIQUE INDEX idx_invoices_number ON invoices(account_id, number);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_items_invoice ON invoice_items(invoice_id);
