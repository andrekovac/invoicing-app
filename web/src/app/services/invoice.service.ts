import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Invoice {
  id: number;
  number: string | null;
  status: string;
  customer_id: number;
  customer_name?: string;
  issue_date: string | null;
  due_date: string | null;
  tax_rate: number;
  legacy_tax_rate?: number;
  paid_amount?: number;
  total_net: number;
  total_tax: number;
  total_gross: number;
  note?: string | null;
  items?: any[];
  customer?: any;
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

  list(filter: { q?: string; status?: string; customer_id?: number } = {}): Observable<Invoice[]> {
    let params = new HttpParams();
    Object.keys(filter).forEach(k => {
      const v = (filter as any)[k];
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<Invoice[]>(this.base, { params });
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

  pdfUrl(id: number): string {
    return this.base + '/' + id + '/pdf';
  }
}
