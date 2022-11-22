import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface OverdueRow {
  id: number;
  number: string;
  customer_name: string;
  customer_email: string | null;
  due_date: string;
  total_gross: number;
  open: number;
  reminded_at: string | null;
}

// overdue invoices. the job sends the first reminder by itself, here you can send one by hand
@Component({
  selector: 'app-overdue',
  template: `
    <h1>Überfällig</h1>
    <p class="muted">Die erste Zahlungserinnerung geht automatisch raus (stündlich geprüft).</p>
    <p class="ok" *ngIf="info">{{ info }}</p>
    <p class="error" *ngIf="error">{{ error }}</p>
    <table>
      <thead>
        <tr><th>Rechnung</th><th>Kunde</th><th>Fällig seit</th><th class="num">Offen</th><th>Erinnert</th><th></th></tr>
      </thead>
      <tbody>
        <tr *ngFor="let r of rows">
          <td><a [routerLink]="['/invoices', r.id, 'edit']">{{ r.number }}</a></td>
          <td>{{ r.customer_name }} <span class="muted" *ngIf="!r.customer_email">(keine E-Mail)</span></td>
          <td class="overdue">{{ r.due_date | dateDe }} ({{ days(r) }} Tage)</td>
          <td class="num">{{ r.open | euro }}</td>
          <td>{{ r.reminded_at ? (r.reminded_at | dateDe) : '-' }}</td>
          <td><button class="secondary" [disabled]="!r.customer_email" (click)="remind(r)">Erinnerung senden</button></td>
        </tr>
        <tr *ngIf="!rows.length"><td colspan="6" class="ok">Nichts überfällig</td></tr>
      </tbody>
    </table>
  `
})
export class OverdueComponent implements OnInit {
  rows: OverdueRow[] = [];
  info = '';
  error = '';

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.http.get<OverdueRow[]>('/api/v1/invoices/overdue').subscribe(rows => this.rows = rows);
  }

  days(r: OverdueRow): number {
    return Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86400000);
  }

  remind(r: OverdueRow): void {
    this.info = '';
    this.error = '';
    this.http.post<any>('/api/v1/invoices/' + r.id + '/remind', {}).subscribe(
      mail => {
        this.info = 'Erinnerung an ' + mail.to + ' liegt im Postausgang';
        this.load();
      },
      err => this.error = (err.error && err.error.error) || 'Fehler'
    );
  }
}
