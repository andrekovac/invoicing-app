// invoice mapping for v2: db row -> api shape
import pricing from '../../lib/pricing.js';
import money from '../../lib/money.js';
import { invoice, invoices, items } from './repo.ts';
import type { Invoice, InvoiceFilter, InvoiceItem, InvoiceRow, InvoiceSummary, ItemRow, Totals } from './types.ts';

// tax rate in percent. rows from before the tax_rate column only have the decimal
export function taxRateOf(row: InvoiceRow): number {
  if (row.tax_rate !== null && row.tax_rate !== undefined) return row.tax_rate;
  return Math.round((row.legacy_tax_rate ?? 0.19) * 100);
}

// drafts: computed from the items (stored totals of a draft can be old),
// everything else: the stored totals, that is what the customer got
export function totalsOf(row: InvoiceRow, rows?: ItemRow[]): Totals {
  if (row.status === 'draft') {
    const list = rows ?? items(row.id);
    let net = pricing.sumItems(list);
    if (row.discount_percent) net = net * (1 - row.discount_percent / 100);
    const gross = money.round2(pricing.gross(net, taxRateOf(row)));
    return { net: money.round2(net), tax: money.round2(gross - net), gross };
  }
  return { net: row.total_net, tax: row.total_tax, gross: row.total_gross };
}

export function toItem(row: ItemRow): InvoiceItem {
  return {
    id: row.id,
    position: row.position,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    lineTotal: money.round2(pricing.lineTotal(row.quantity, row.unit_price))
  };
}

export function toSummary(row: InvoiceRow): InvoiceSummary {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    customerId: row.customer_id,
    customerName: row.customer_name ?? '',
    issueDate: row.issue_date,
    dueDate: row.due_date,
    taxRate: taxRateOf(row),
    totals: totalsOf(row),
    paid: money.round2(row.paid_amount ?? 0)
  };
}

export function toInvoice(row: InvoiceRow): Invoice {
  const rows = items(row.id);
  return {
    ...toSummary(row),
    totals: totalsOf(row, rows),
    discountPercent: row.discount_percent ?? 0,
    paidAt: row.paid_at,
    items: rows.map(toItem),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listInvoices(accountId: number, filter: InvoiceFilter): InvoiceSummary[] {
  return invoices(accountId, filter).map(toSummary);
}

// null when it does not exist or belongs to another account
export function getInvoice(accountId: number, id: number): Invoice | null {
  const row = invoice(id);
  if (!row || row.account_id !== accountId) return null;
  return toInvoice(row);
}
