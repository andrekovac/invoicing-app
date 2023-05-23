-- the invoice list is filtered by status and sorted by date, paging made it slow on big accounts
CREATE INDEX idx_invoices_account_status ON invoices(account_id, status);
CREATE INDEX idx_invoices_account_issue_date ON invoices(account_id, issue_date);
