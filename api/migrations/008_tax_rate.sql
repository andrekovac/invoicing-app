-- tax rate as percent (19, 7, 0) like in lib/pricing.js. the decimal column stays
-- and is still written: the DATEV export for the tax advisor and old pdfs read it
ALTER TABLE invoices RENAME COLUMN vat_rate TO legacy_tax_rate;
ALTER TABLE invoices ADD COLUMN tax_rate INTEGER;
UPDATE invoices SET tax_rate = CAST(round(legacy_tax_rate * 100) AS INTEGER);
