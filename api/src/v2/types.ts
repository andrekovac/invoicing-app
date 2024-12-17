// v2 api types. camelCase in the api, snake_case only in the db rows

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled';

export const STATUSES: readonly InvoiceStatus[] = ['draft', 'issued', 'paid', 'cancelled'];

export interface Totals {
  net: number;
  tax: number;
  gross: number;
}

export interface InvoiceItem {
  id: number;
  position: number;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoiceSummary {
  id: number;
  number: string | null;
  status: InvoiceStatus;
  customerId: number;
  customerName: string;
  issueDate: string | null;
  dueDate: string | null;
  taxRate: number;
  totals: Totals;
  paid: number;
}

export interface Invoice extends InvoiceSummary {
  discountPercent: number;
  paidAt: string | null;
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string | null;
}

export interface Customer {
  id: number;
  name: string;
  contactName: string | null;
  address: {
    street: string | null;
    zip: string | null;
    city: string | null;
    country: string | null;
  };
  email: string | null;
  phone: string | null;
  vatId: string | null;
  defaultTaxRate: number | null;
  imported: boolean;
}

export interface Page<T> {
  data: T[];
  page: number;
  perPage: number;
  total: number;
}

export interface FieldError {
  field?: string;
  message: string;
}

export interface ErrorBody {
  errors: FieldError[];
}

// rows as they come from node:sqlite
export interface InvoiceRow {
  id: number;
  account_id: number;
  customer_id: number;
  number: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  tax_rate: number | null;
  legacy_tax_rate: number | null;
  discount_percent: number | null;
  note: string | null;
  total_net: number;
  total_tax: number;
  total_gross: number;
  created_at: string;
  updated_at: string | null;
  customer_name?: string;
  paid_amount?: number;
}

export interface ItemRow {
  id: number;
  invoice_id: number;
  position: number;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface CustomerRow {
  id: number;
  account_id: number;
  name: string;
  contact_name: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  vat_id: string | null;
  default_tax_rate: number | null;
  legacy_no: string | null;
  created_at: string;
}

export interface InvoiceFilter {
  status?: InvoiceStatus;
  customerId?: number;
  q?: string;
  year?: number;
}

export interface MonthRevenue {
  month: string;
  invoices: number;
  net: number;
  tax: number;
  gross: number;
  received: number;
}

export interface Revenue {
  year: number;
  months: MonthRevenue[];
  total: Omit<MonthRevenue, 'month'>;
}

export interface ProductRow {
  id: number;
  account_id: number;
  sku: string;
  name: string;
  unit: string | null;
  unit_price: number;
  tax_rate: number;
  active: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  unit: string | null;
  netPrice: number;
  taxRate: number;
  active: boolean;
}
