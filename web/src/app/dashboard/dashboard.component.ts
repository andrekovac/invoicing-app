import { Component, OnInit, computed, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EuroPipe, DateDePipe } from '../shared/format.pipes';
import { getJson } from '../shared/fetch';
import { getUser } from '../../session.js';

interface Summary {
  open_count: number;
  open_gross: number;
  overdue_count: number;
  overdue_gross: number;
  paid_this_year: number;
  draft_count: number;
  draft_gross: number;
}

interface Forecast {
  until: string;
  count: number;
  total_gross: number;
  invoices: { recurring_id: number; title: string | null; customer_name: string; date: string; total_gross: number }[];
}

interface MonthRow {
  month: string;
  label: string;
  gross: number;
  paid: number;
}

// start page after the login: the numbers from the overview, this year against last year
// and what the recurring invoices will bring
@Component({
  selector: 'app-dashboard',
  imports: [NgIf, NgFor, RouterLink, EuroPipe, DateDePipe],
  template: `
    <h1>Guten {{ dayTime() }}{{ name() ? ', ' + name() : '' }}</h1>
    <p class="error" *ngIf="error()">{{ error() }}</p>

    <div class="buckets" *ngIf="summary() as s">
      <a class="card bucket" routerLink="/invoices">
        <div class="muted">Offen</div>
        <b>{{ s.open_gross | euro }}</b>
        <div class="muted">{{ s.open_count }} Rechnungen</div>
      </a>
      <a class="card bucket" routerLink="/overdue" [class.bad]="s.overdue_count">
        <div class="muted">Überfällig</div>
        <b>{{ s.overdue_gross | euro }}</b>
        <div class="muted">{{ s.overdue_count }} Rechnungen</div>
      </a>
      <a class="card bucket" routerLink="/reports">
        <div class="muted">Bezahlt {{ year }}</div>
        <b>{{ s.paid_this_year | euro }}</b>
      </a>
      <a class="card bucket" routerLink="/invoices">
        <div class="muted">Entwürfe</div>
        <b>{{ s.draft_gross | euro }}</b>
        <div class="muted">{{ s.draft_count }} Entwürfe</div>
      </a>
    </div>

    <div class="cols">
      <div class="card">
        <h2>Umsatz {{ year }} und {{ year - 1 }}</h2>
        <div class="chart" style="height: 160px;">
          <div class="bar-col" *ngFor="let m of thisYear(); let i = index" [title]="m.label">
            <div class="bars">
              <div class="bar planned" [style.height.%]="pct(lastYear()[i]?.gross || 0)"></div>
              <div class="bar billed" [style.height.%]="pct(m.gross)"></div>
            </div>
            <div class="muted">{{ m.label }}</div>
          </div>
        </div>
        <p class="muted"><span class="dot billed"></span> {{ year }} <span class="dot planned"></span> {{ year - 1 }}
          <span style="margin-left: 12px;">bisher {{ sumThis() | euro }}, Vorjahr bis heute {{ sumLastToDate() | euro }}</span></p>
      </div>
      <div class="card">
        <h2>Serienrechnungen</h2>
        <table *ngIf="forecast() as f">
          <tbody>
            <tr *ngFor="let r of f.invoices.slice(0, 8)">
              <td>{{ r.date | dateDe }}</td>
              <td>{{ r.customer_name }}<div class="muted" *ngIf="r.title">{{ r.title }}</div></td>
              <td class="num">{{ r.total_gross | euro }}</td>
            </tr>
            <tr *ngIf="!f.invoices.length"><td class="muted">Keine in den nächsten 3 Monaten</td></tr>
            <tr *ngIf="f.invoices.length"><td colspan="2" class="muted">bis {{ f.until | dateDe }}, {{ f.count }} Rechnungen</td><td class="num"><b>{{ f.total_gross | euro }}</b></td></tr>
          </tbody>
        </table>
        <a routerLink="/invoices/recurring">alle Serien</a>
      </div>
    </div>

    <div class="toolbar" style="margin-top: 16px;">
      <button routerLink="/invoices/new">Neue Rechnung</button>
      <button class="secondary" routerLink="/customers/search">Kunde suchen</button>
      <button class="secondary" routerLink="/export">Export für den Steuerberater</button>
    </div>
  `
})
export class DashboardComponent implements OnInit {
  year = new Date().getFullYear();
  summary = signal<Summary | null>(null);
  forecast = signal<Forecast | null>(null);
  thisYear = signal<MonthRow[]>([]);
  lastYear = signal<MonthRow[]>([]);
  error = signal('');

  private max = computed(() => Math.max(1, ...this.thisYear().map(m => m.gross), ...this.lastYear().map(m => m.gross)));

  sumThis = computed(() => Math.round(this.thisYear().reduce((s, m) => s + m.gross, 0) * 100) / 100);

  // last year until the same month, so the numbers can be compared
  sumLastToDate = computed(() => {
    const month = new Date().getMonth();
    return Math.round(this.lastYear().slice(0, month + 1).reduce((s, m) => s + m.gross, 0) * 100) / 100;
  });

  ngOnInit(): void {
    const fail = (err: any) => this.error.set(err.message);
    getJson<Summary>('/api/v1/invoices/summary').then(s => this.summary.set(s)).catch(fail);
    getJson<Forecast>('/api/v1/reports/recurring?months=3').then(f => this.forecast.set(f)).catch(fail);
    getJson<any>('/api/v1/reports/revenue?year=' + this.year).then(r => this.thisYear.set(r.months)).catch(fail);
    getJson<any>('/api/v1/reports/revenue?year=' + (this.year - 1)).then(r => this.lastYear.set(r.months)).catch(() => this.lastYear.set([]));
  }

  name(): string {
    const u: any = getUser();
    return u && u.name ? String(u.name).split(' ')[0] : '';
  }

  dayTime(): string {
    const h = new Date().getHours();
    if (h < 11) return 'Morgen';
    if (h < 18) return 'Tag';
    return 'Abend';
  }

  pct(v: number): number {
    return Math.round(v / this.max() * 1000) / 10;
  }
}
