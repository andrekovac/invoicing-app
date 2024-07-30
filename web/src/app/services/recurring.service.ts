import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Recurring {
  id: number;
  customer_id: number;
  customer_name?: string;
  template_invoice_id: number | null;
  template_number?: string | null;
  title: string | null;
  interval_months: number;
  day_of_month: number;
  payment_days: number;
  start_date: string;
  end_date: string | null;
  next_date: string | null;
  auto_issue: number;
  send_mail: number;
  active: number;
  last_run_at: string | null;
  copies?: any;
  next?: { date: string; tax_rate: number; items: any[]; total_net: number; total_gross: number } | null;
}

@Injectable({ providedIn: 'root' })
export class RecurringService {
  private base = '/api/v1/invoices/recurring';

  constructor(private http: HttpClient) { }

  list(): Observable<Recurring[]> {
    return this.http.get<Recurring[]>(this.base);
  }

  get(id: number): Observable<Recurring> {
    return this.http.get<Recurring>(this.base + '/' + id);
  }

  create(data: any): Observable<Recurring> {
    return this.http.post<Recurring>(this.base, data);
  }

  update(id: number, data: any): Observable<Recurring> {
    return this.http.put<Recurring>(this.base + '/' + id, data);
  }

  pause(id: number): Observable<Recurring> {
    return this.http.post<Recurring>(this.base + '/' + id + '/pause', {});
  }

  resume(id: number): Observable<Recurring> {
    return this.http.post<Recurring>(this.base + '/' + id + '/resume', {});
  }

  runNow(id: number): Observable<any> {
    return this.http.post<any>(this.base + '/' + id + '/run', {});
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(this.base + '/' + id);
  }
}
