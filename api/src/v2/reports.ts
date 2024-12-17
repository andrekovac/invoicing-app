// revenue per month for v2. same numbers as GET /api/v1/reports/revenue, camelCase and
// without the drafts (v2 only reads what was billed)
import { billedPerMonth, receivedPerMonth } from './repo.ts';
import type { MonthRevenue, Revenue } from './types.ts';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

export function revenue(accountId: number, year: number): Revenue {
  const months: MonthRevenue[] = [];
  for (let m = 1; m <= 12; m++) {
    months.push({ month: year + '-' + pad2(m), invoices: 0, net: 0, tax: 0, gross: 0, received: 0 });
  }
  for (const r of billedPerMonth(accountId, year)) {
    const row = months[Number(r.m) - 1];
    row.invoices = r.n;
    row.net = round2(r.net);
    row.tax = round2(r.tax);
    row.gross = round2(r.gross);
  }
  for (const r of receivedPerMonth(accountId, year)) {
    months[Number(r.m) - 1].received = round2(r.paid);
  }
  const total = { invoices: 0, net: 0, tax: 0, gross: 0, received: 0 };
  for (const m of months) {
    total.invoices += m.invoices;
    total.net += m.net;
    total.tax += m.tax;
    total.gross += m.gross;
    total.received += m.received;
  }
  total.net = round2(total.net);
  total.tax = round2(total.tax);
  total.gross = round2(total.gross);
  total.received = round2(total.received);
  return { year, months, total };
}
