// api v2, read only for now: /api/v2/invoices, /api/v2/invoices/:id, /api/v2/customers, /api/v2/customers/:id
// mounted from server.js (commonjs) with a dynamic import
import express from 'express';
import auth from '../../lib/auth.js';
import { STATUSES } from './types.ts';
import type { Customer, CustomerRow, ErrorBody, FieldError, InvoiceFilter, InvoiceStatus, Page } from './types.ts';
import { getInvoice, listInvoices } from './invoices.ts';
import { customer, customers } from './repo.ts';

import type { NextFunction, Request, Response } from 'express';

const MAX_PER_PAGE = 100;

export const router = express.Router();

function fail(res: Response, status: number, errors: FieldError[]): void {
  const body: ErrorBody = { errors };
  res.status(status).json(body);
}

function positiveInt(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  return Number(value);
}

function paging(query: Record<string, unknown>, errors: FieldError[]): { page: number; perPage: number } {
  let page = 1;
  let perPage = 25;
  if (query.page !== undefined) {
    const p = positiveInt(query.page);
    if (p === null) errors.push({ field: 'page', message: 'must be a positive integer' });
    else page = p;
  }
  if (query.perPage !== undefined) {
    const p = positiveInt(query.perPage);
    if (p === null || p > MAX_PER_PAGE) errors.push({ field: 'perPage', message: 'must be 1 to ' + MAX_PER_PAGE });
    else perPage = p;
  }
  return { page, perPage };
}

function pageOf<T>(all: T[], page: number, perPage: number): Page<T> {
  return { data: all.slice((page - 1) * perPage, page * perPage), page, perPage, total: all.length };
}

router.use(auth.requireLogin);

router.get('/invoices', function (req: Request, res: Response) {
  const query = req.query as Record<string, unknown>;
  const errors: FieldError[] = [];
  const filter: InvoiceFilter = {};
  if (query.status !== undefined) {
    if (STATUSES.indexOf(query.status as InvoiceStatus) === -1) errors.push({ field: 'status', message: 'unknown status' });
    else filter.status = query.status as InvoiceStatus;
  }
  if (query.customerId !== undefined) {
    const id = positiveInt(query.customerId);
    if (id === null) errors.push({ field: 'customerId', message: 'must be a positive integer' });
    else filter.customerId = id;
  }
  if (query.q !== undefined) {
    const q = String(query.q).trim();
    if (q.length < 2) errors.push({ field: 'q', message: 'at least 2 characters' });
    else filter.q = q;
  }
  const { page, perPage } = paging(query, errors);
  if (errors.length) return fail(res, 400, errors);
  res.json(pageOf(listInvoices((req as any).accountId, filter), page, perPage));
});

router.get('/invoices/:id', function (req: Request, res: Response) {
  const id = positiveInt(req.params.id);
  if (id === null) return fail(res, 400, [{ field: 'id', message: 'must be a positive integer' }]);
  const inv = getInvoice((req as any).accountId, id);
  if (!inv) return fail(res, 404, [{ message: 'invoice not found' }]);
  res.json(inv);
});

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    address: { street: row.street, zip: row.zip, city: row.city, country: row.country || null },
    email: row.email,
    phone: row.phone,
    vatId: row.vat_id,
    defaultTaxRate: row.default_tax_rate,
    imported: !!row.legacy_no
  };
}

router.get('/customers', function (req: Request, res: Response) {
  const query = req.query as Record<string, unknown>;
  const errors: FieldError[] = [];
  const q = query.q !== undefined ? String(query.q).trim() : '';
  if (query.q !== undefined && q.length < 2) errors.push({ field: 'q', message: 'at least 2 characters' });
  const { page, perPage } = paging(query, errors);
  if (errors.length) return fail(res, 400, errors);
  res.json(pageOf(customers((req as any).accountId, q).map(toCustomer), page, perPage));
});

function ownCustomer(req: Request, res: Response): CustomerRow | null {
  const id = positiveInt(req.params.id);
  if (id === null) {
    fail(res, 400, [{ field: 'id', message: 'must be a positive integer' }]);
    return null;
  }
  const row = customer(id);
  if (!row || row.account_id !== (req as any).accountId) {
    fail(res, 404, [{ message: 'customer not found' }]);
    return null;
  }
  return row;
}

router.get('/customers/:id', function (req: Request, res: Response) {
  const row = ownCustomer(req, res);
  if (row) res.json(toCustomer(row));
});

router.get('/customers/:id/invoices', function (req: Request, res: Response) {
  const row = ownCustomer(req, res);
  if (!row) return;
  const errors: FieldError[] = [];
  const { page, perPage } = paging(req.query as Record<string, unknown>, errors);
  if (errors.length) return fail(res, 400, errors);
  res.json(pageOf(listInvoices(row.account_id, { customerId: row.id }), page, perPage));
});

router.use(function (req: Request, res: Response) {
  fail(res, 404, [{ message: 'not found' }]);
});

router.use(function (err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) {
  if (!err.status || err.status >= 500) console.error('[v2]', err);
  fail(res, err.status || 500, [{ message: err.status && err.status < 500 ? err.message : 'server error' }]);
});
