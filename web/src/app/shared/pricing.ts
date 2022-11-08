// same math as api/lib/pricing.js + services/invoices.computeTotals,
// so the form can show totals while typing without asking the api every time
export const RATES = [19, 7, 0];

export interface ItemLike {
  quantity: number;
  unit_price: number;
}

export function gross(net: number, rate: number): number {
  return net * (1 + rate / 100);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return Number(quantity) * Number(unitPrice);
}

export function sumItems(items: ItemLike[]): number {
  return (items || []).reduce((sum, it) => sum + lineTotal(it.quantity, it.unit_price), 0);
}

export function totals(items: ItemLike[], rate: number, discountPercent: number): { total_net: number; total_tax: number; total_gross: number } {
  let net = sumItems(items);
  if (discountPercent) net = net * (1 - discountPercent / 100);
  const totalGross = round2(gross(net, rate));
  const totalNet = round2(net);
  return { total_net: totalNet, total_tax: round2(totalGross - totalNet), total_gross: totalGross };
}

// "1.234,56" -> 1234.56
export function parseEuro(s: string | number): number {
  if (typeof s === 'number') return s;
  let v = String(s || '').replace(/€|\s/g, '');
  if (v.indexOf(',') !== -1) v = v.replace(/\./g, '').replace(',', '.');
  return v === '' ? NaN : Number(v);
}
