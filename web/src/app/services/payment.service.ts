import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Payment {
  id: number;
  invoice_id: number;
  number?: string;
  customer_name?: string;
  amount: number;
  method: 'transfer' | 'card';
  paid_at: string;
  reference: string | null;
}

export interface InvoicePayments {
  invoice_id: number;
  total_gross: number;
  paid: number;
  open: number;
  payments: Payment[];
}

export interface PayLink {
  token: string;
  url: string;
  expires_at: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private base = '/api/v1/payments';

  constructor(private http: HttpClient) { }

  list(filter: { method?: string; from?: string; to?: string } = {}): Observable<Payment[]> {
    let params = new HttpParams();
    Object.keys(filter).forEach(k => {
      const v = (filter as any)[k];
      if (v) params = params.set(k, v);
    });
    return this.http.get<Payment[]>(this.base, { params });
  }

  forInvoice(invoiceId: number): Observable<InvoicePayments> {
    return this.http.get<InvoicePayments>(this.base, { params: new HttpParams().set('invoice_id', String(invoiceId)) });
  }

  recordTransfer(invoiceId: number, amount: number | string, paidAt?: string, reference?: string): Observable<Payment> {
    return this.http.post<Payment>(this.base, { invoice_id: invoiceId, amount, paid_at: paidAt, reference });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(this.base + '/' + id);
  }

  createLink(invoiceId: number, days = 30): Observable<PayLink> {
    return this.http.post<PayLink>(this.base + '/link', { invoice_id: invoiceId, days });
  }

  portalLink(customerId: number): Observable<PayLink> {
    return this.http.post<PayLink>('/api/v1/portal', { customer_id: customerId });
  }
}
