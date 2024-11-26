import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Invoice {
  id: number;
  number: string | null;
  status: string;
  customer_id: number;
  customer_name?: string;
  issue_date: string | null;
  due_date: string | null;
  tax_rate: number;
  discount_percent?: number;
  legacy_tax_rate?: number;
  paid_amount?: number;
  total_net: number;
  total_tax: number;
  total_gross: number;
  note?: string | null;
  items?: any[];
  customer?: any;
}

export interface InvoiceFilter {
  q?: string;
  status?: string;
  customer_id?: number;
  from?: string;
  to?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface InvoicePage {
  rows: Invoice[];
  total: number;
  page: number;
  perPage: number;
}

export interface Summary {
  open_count: number;
  open_gross: number;
  overdue_count: number;
  overdue_gross: number;
  paid_this_year: number;
  draft_count: number;
  draft_gross: number;
}

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private base = '/api/v1/invoices';

  constructor(private http: HttpClient) { }

  private params(filter: InvoiceFilter): HttpParams {
    let params = new HttpParams();
    Object.keys(filter).forEach(k => {
      const v = (filter as any)[k];
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return params;
  }

  // everything at once (payments page, customer page)
  list(filter: InvoiceFilter = {}): Observable<Invoice[]> {
    return this.http.get<Invoice[]>(this.base, { params: this.params(filter) });
  }

  // one page, total from X-Total-Count
  page(filter: InvoiceFilter, page: number, perPage: number): Observable<InvoicePage> {
    const params = this.params(filter).set('page', String(page)).set('per_page', String(perPage));
    return this.http.get<Invoice[]>(this.base, { params, observe: 'response' }).pipe(
      map(res => ({
        rows: res.body || [],
        total: Number(res.headers.get('X-Total-Count')) || 0,
        page: Number(res.headers.get('X-Page')) || page,
        perPage: Number(res.headers.get('X-Per-Page')) || perPage
      }))
    );
  }

  summary(): Observable<Summary> {
    return this.http.get<Summary>(this.base + '/summary');
  }

  get(id: number): Observable<Invoice> {
    return this.http.get<Invoice>(this.base + '/' + id);
  }

  issue(id: number): Observable<Invoice> {
    return this.http.post<Invoice>(this.base + '/' + id + '/issue', {});
  }

  markPaid(id: number, paidAt?: string): Observable<Invoice> {
    return this.http.post<Invoice>(this.base + '/' + id + '/paid', { paid_at: paidAt });
  }

  create(data: any): Observable<Invoice> {
    return this.http.post<Invoice>(this.base, data);
  }

  update(id: number, data: any): Observable<Invoice> {
    return this.http.put<Invoice>(this.base + '/' + id, data);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(this.base + '/' + id);
  }

  cancel(id: number): Observable<Invoice> {
    return this.http.post<Invoice>(this.base + '/' + id + '/cancel', {});
  }

  copy(id: number): Observable<Invoice> {
    return this.http.post<Invoice>(this.base + '/' + id + '/copy', {});
  }

  sendMail(id: number): Observable<any> {
    return this.http.post<any>(this.base + '/' + id + '/mail', {});
  }

  bulk(action: string, ids: number[], paidAt?: string): Observable<{ done: number; failed: number; results: { id: number; ok: boolean; error?: string; number?: string }[] }> {
    return this.http.post<any>(this.base + '/bulk', { action, ids, paid_at: paidAt });
  }

  csvUrl(filter: InvoiceFilter): string {
    const q = this.params(filter).toString();
    return this.base + '/export.csv' + (q ? '?' + q : '');
  }

  pdfUrl(id: number): string {
    return this.base + '/' + id + '/pdf';
  }
}
