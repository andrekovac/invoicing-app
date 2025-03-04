-- when and how the invoice went to the customer (mail from here, by post, own mail program)
ALTER TABLE invoices ADD COLUMN sent_at TEXT;
ALTER TABLE invoices ADD COLUMN sent_via TEXT;
