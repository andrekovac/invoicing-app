import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Customer {
  id?: number;
  name: string;
  contact_name?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  default_tax_rate?: number | null;
  email?: string | null;
  phone?: string | null;
  vat_id?: string | null;
  legacy_no?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private base = '/api/v1/customers';

  constructor(private http: HttpClient) { }

  list(q?: string): Observable<Customer[]> {
    const params = q ? new HttpParams().set('q', q) : undefined;
    return this.http.get<Customer[]>(this.base, { params });
  }

  get(id: number): Observable<Customer> {
    return this.http.get<Customer>(this.base + '/' + id);
  }

  invoices(id: number): Observable<any[]> {
    return this.http.get<any[]>(this.base + '/' + id + '/invoices');
  }

  save(c: Customer): Observable<Customer> {
    if (c.id) return this.http.put<Customer>(this.base + '/' + c.id, c);
    return this.http.post<Customer>(this.base, c);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(this.base + '/' + id);
  }
}
