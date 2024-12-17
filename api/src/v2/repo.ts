// db access for v2. node:sqlite is sync, so these are plain sync functions.
// same connection as v1 (db.js), when we move to postgres only this file changes
import db from '../../db.js';
import type { CustomerRow, InvoiceFilter, InvoiceRow, ItemRow, ProductRow } from './types.ts';

interface Statement {
  all(...args: unknown[]): unknown[];
  get(...args: unknown[]): unknown;
}

function prepare(sql: string): Statement {
  return db.open().prepare(sql) as Statement;
}

export function customers(accountId: number, q?: string): CustomerRow[] {
  if (q) {
    const like = '%' + q + '%';
    return prepare('SELECT * FROM customers WHERE account_id = ? AND (name LIKE ? OR city LIKE ?) ORDER BY name')
      .all(accountId, like, like) as CustomerRow[];
  }
  return prepare('SELECT * FROM customers WHERE account_id = ? ORDER BY name').all(accountId) as CustomerRow[];
}

export function customer(id: number): CustomerRow | undefined {
  return prepare('SELECT * FROM customers WHERE id = ?').get(id) as CustomerRow | undefined;
}

export function invoices(accountId: number, filter: InvoiceFilter = {}): InvoiceRow[] {
  let sql = 'SELECT i.*, c.name AS customer_name, ' +
    '(SELECT coalesce(sum(p.amount), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid_amount ' +
    'FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.account_id = ?';
  const args: unknown[] = [accountId];
  if (filter.status) {
    sql += ' AND i.status = ?';
    args.push(filter.status);
  }
  if (filter.customerId) {
    sql += ' AND i.customer_id = ?';
    args.push(filter.customerId);
  }
  if (filter.year) {
    sql += ' AND substr(i.issue_date, 1, 4) = ?';
    args.push(String(filter.year));
  }
  if (filter.q) {
    sql += ' AND (i.number LIKE ? OR c.name LIKE ?)';
    args.push('%' + filter.q + '%', '%' + filter.q + '%');
  }
  sql += ' ORDER BY i.issue_date IS NULL, i.issue_date DESC, i.id DESC';
  return prepare(sql).all(...args) as InvoiceRow[];
}

export function invoice(id: number): InvoiceRow | undefined {
  return prepare('SELECT i.*, c.name AS customer_name, ' +
    '(SELECT coalesce(sum(p.amount), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid_amount ' +
    'FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = ?').get(id) as InvoiceRow | undefined;
}

export function items(invoiceId: number): ItemRow[] {
  return prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position, id').all(invoiceId) as ItemRow[];
}

export interface MonthSumRow {
  m: string;
  n: number;
  net: number;
  tax: number;
  gross: number;
}

// billed per month (issue date), only issued and paid invoices
export function billedPerMonth(accountId: number, year: number): MonthSumRow[] {
  return prepare("SELECT substr(issue_date, 6, 2) AS m, count(*) AS n, sum(total_net) AS net, sum(total_tax) AS tax, sum(total_gross) AS gross " +
    "FROM invoices WHERE account_id = ? AND status IN ('issued', 'paid') AND substr(issue_date, 1, 4) = ? GROUP BY m")
    .all(accountId, String(year)) as MonthSumRow[];
}

// received per month (payment date)
export function receivedPerMonth(accountId: number, year: number): { m: string; paid: number }[] {
  return prepare("SELECT substr(p.paid_at, 6, 2) AS m, sum(p.amount) AS paid FROM payments p JOIN invoices i ON i.id = p.invoice_id " +
    "WHERE p.account_id = ? AND i.status <> 'cancelled' AND substr(p.paid_at, 1, 4) = ? GROUP BY m")
    .all(accountId, String(year)) as { m: string; paid: number }[];
}

export function products(accountId: number, all = false): ProductRow[] {
  return prepare('SELECT * FROM products WHERE account_id = ?' + (all ? '' : ' AND active = 1') + ' ORDER BY sku').all(accountId) as ProductRow[];
}
