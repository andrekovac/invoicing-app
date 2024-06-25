import { Component, OnInit, computed, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EuroPipe, DateDePipe } from '../shared/format.pipes';
import { getJson } from '../shared/fetch';

interface Month {
  month: string;
  label: string;
  count: number;
  net: number;
  tax: number;
  gross: number;
  paid: number;
  drafts_gross: number;
}

interface Revenue {
  year: number;
  months: Month[];
  total: { count: number; net: number; tax: number; gross: number; paid: number };
}

interface OpenItems {
  as_of: string;
  count: number;
  open: number;
  buckets: { key: string; label: string; count: number; open: number }[];
  items: { id: number; number: string; customer_name: string; due_date: string; open: number; overdue: boolean; days_overdue: number; bucket: string }[];
}

interface Top {
  year: number;
  total_gross: number;
  customers: { rank: number; id: number; name: string; city: string; invoices: number; net: number; gross: number; share: number }[];
}

interface Tax {
  rates: { tax_rate: number; count: number; net: number; tax: number; gross: number }[];
}

type Tab = 'revenue' | 'open' | 'top' | 'tax';

@Component({
  selector: 'app-reports',
  imports: [NgIf, NgFor, FormsModule, RouterLink, EuroPipe, DateDePipe],
  template: `
    <h1>Berichte</h1>
    <div class="toolbar">
      <div class="tabs">
        <button [class.secondary]="tab() !== 'revenue'" (click)="tab.set('revenue')">Umsatz</button>
        <button [class.secondary]="tab() !== 'open'" (click)="tab.set('open')">Offene Posten</button>
        <button [class.secondary]="tab() !== 'top'" (click)="tab.set('top')">Top-Kunden</button>
        <button [class.secondary]="tab() !== 'tax'" (click)="tab.set('tax')">Umsatzsteuer</button>
      </div>
      <span class="spacer"></span>
      <label *ngIf="tab() !== 'open'">Jahr
        <select [ngModel]="year()" (ngModelChange)="setYear($event)">
          <option *ngFor="let y of years()" [ngValue]="y">{{ y }}</option>
        </select>
      </label>
      <label *ngIf="tab() === 'tax'">Quartal
        <select [ngModel]="quarter()" (ngModelChange)="quarter.set($event); loadTax()">
          <option [ngValue]="0">ganzes Jahr</option>
          <option [ngValue]="1">Q1</option>
          <option [ngValue]="2">Q2</option>
          <option [ngValue]="3">Q3</option>
          <option [ngValue]="4">Q4</option>
        </select>
      </label>
      <span class="muted" *ngIf="loading()">lädt ...</span>
    </div>
    <p class="error" *ngIf="error()">{{ error() }}</p>

    <!-- revenue -->
    <div *ngIf="tab() === 'revenue' && revenue() as r">
      <div class="summary">
        <span>Rechnungen: <b>{{ r.total.count }}</b></span>
        <span>Netto: <b>{{ r.total.net | euro }}</b></span>
        <span>Brutto: <b>{{ r.total.gross | euro }}</b></span>
        <span>Eingegangen: <b>{{ r.total.paid | euro }}</b></span>
      </div>
      <div class="chart card">
        <div class="bar-col" *ngFor="let m of r.months" [title]="m.label + ': ' + (m.gross | euro)">
          <div class="bars">
            <div class="bar billed" [style.height.%]="pct(m.gross)"></div>
            <div class="bar paid" [style.height.%]="pct(m.paid)"></div>
            <div class="bar planned" *ngIf="m.drafts_gross" [style.height.%]="pct(m.drafts_gross)"></div>
          </div>
          <div class="muted">{{ m.label }}</div>
        </div>
      </div>
      <p class="muted"><span class="dot billed"></span> berechnet <span class="dot paid"></span> eingegangen <span class="dot planned"></span> Entwürfe</p>
      <table>
        <thead><tr><th>Monat</th><th class="num">Anzahl</th><th class="num">Netto</th><th class="num">USt.</th><th class="num">Brutto</th><th class="num">Eingegangen</th><th class="num">Entwürfe</th></tr></thead>
        <tbody>
          <tr *ngFor="let m of r.months">
            <td>{{ m.label }} {{ r.year }}</td>
            <td class="num">{{ m.count || '' }}</td>
            <td class="num">{{ m.net ? (m.net | euro) : '' }}</td>
            <td class="num">{{ m.tax ? (m.tax | euro) : '' }}</td>
            <td class="num">{{ m.gross ? (m.gross | euro) : '' }}</td>
            <td class="num">{{ m.paid ? (m.paid | euro) : '' }}</td>
            <td class="num muted">{{ m.drafts_gross ? (m.drafts_gross | euro) : '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- open items -->
    <div *ngIf="tab() === 'open' && openItems() as o">
      <div class="summary">
        <span>Offen: <b>{{ o.count }}</b> Rechnungen, <b>{{ o.open | euro }}</b></span>
        <span class="muted">Stand {{ o.as_of | dateDe }}</span>
      </div>
      <div class="buckets">
        <div class="card bucket" *ngFor="let b of o.buckets" [class.bad]="b.key === 'older' && b.count" (click)="bucket.set(bucket() === b.key ? '' : b.key)" [class.active]="bucket() === b.key">
          <div class="muted">{{ b.label }}</div>
          <b>{{ b.open | euro }}</b>
          <div class="muted">{{ b.count }} Rechnungen</div>
        </div>
      </div>
      <table>
        <thead><tr><th>Rechnung</th><th>Kunde</th><th>Fällig</th><th class="num">Tage</th><th class="num">Offen</th></tr></thead>
        <tbody>
          <tr *ngFor="let i of openRows()">
            <td><a [routerLink]="['/invoices', i.id]">{{ i.number }}</a></td>
            <td>{{ i.customer_name }}</td>
            <td [class.overdue]="i.overdue">{{ i.due_date | dateDe }}</td>
            <td class="num">{{ i.days_overdue || '' }}</td>
            <td class="num">{{ i.open | euro }}</td>
          </tr>
          <tr *ngIf="!openRows().length"><td colspan="5" class="ok">Nichts offen</td></tr>
        </tbody>
      </table>
    </div>

    <!-- top customers -->
    <div *ngIf="tab() === 'top' && top() as t">
      <p class="muted">Umsatz {{ t.year }} gesamt: {{ t.total_gross | euro }}</p>
      <table>
        <thead><tr><th>#</th><th>Kunde</th><th>Ort</th><th class="num">Rechnungen</th><th class="num">Netto</th><th class="num">Brutto</th><th>Anteil</th></tr></thead>
        <tbody>
          <tr *ngFor="let c of t.customers">
            <td>{{ c.rank }}</td>
            <td><a [routerLink]="['/customers', c.id]">{{ c.name }}</a></td>
            <td>{{ c.city }}</td>
            <td class="num">{{ c.invoices }}</td>
            <td class="num">{{ c.net | euro }}</td>
            <td class="num">{{ c.gross | euro }}</td>
            <td><span class="share"><span [style.width.%]="c.share"></span></span> {{ c.share }} %</td>
          </tr>
          <tr *ngIf="!t.customers.length"><td colspan="7" class="muted">Keine Rechnungen in {{ t.year }}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- tax -->
    <div *ngIf="tab() === 'tax' && tax() as x">
      <table>
        <thead><tr><th>Steuersatz</th><th class="num">Rechnungen</th><th class="num">Netto</th><th class="num">USt.</th><th class="num">Brutto</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of x.rates">
            <td>{{ r.tax_rate }} %</td>
            <td class="num">{{ r.count }}</td>
            <td class="num">{{ r.net | euro }}</td>
            <td class="num">{{ r.tax | euro }}</td>
            <td class="num">{{ r.gross | euro }}</td>
          </tr>
          <tr *ngIf="!x.rates.length"><td colspan="5" class="muted">Keine Rechnungen im Zeitraum</td></tr>
        </tbody>
      </table>
      <p class="muted">Nach Rechnungsdatum (Soll-Versteuerung). Stornierte Rechnungen zählen nicht.</p>
    </div>
  `
})
export class ReportsComponent implements OnInit {
  tab = signal<Tab>('revenue');
  year = signal(new Date().getFullYear());
  quarter = signal(0);
  years = signal<number[]>([new Date().getFullYear()]);
  bucket = signal('');
  loading = signal(false);
  error = signal('');

  revenue = signal<Revenue | null>(null);
  openItems = signal<OpenItems | null>(null);
  top = signal<Top | null>(null);
  tax = signal<Tax | null>(null);

  // highest bar = 100 %
  private max = computed(() => {
    const r = this.revenue();
    if (!r) return 1;
    return Math.max(1, ...r.months.map(m => Math.max(m.gross, m.paid, m.drafts_gross)));
  });

  openRows = computed(() => {
    const o = this.openItems();
    if (!o) return [];
    return this.bucket() ? o.items.filter(i => i.bucket === this.bucket()) : o.items;
  });

  ngOnInit(): void {
    getJson<string[]>('/api/v1/reports/years').then(list => {
      const ys = list.map(Number).filter(y => !isNaN(y));
      if (ys.length) {
        this.years.set(ys);
        if (ys.indexOf(this.year()) === -1) this.year.set(ys[0]);
      }
      this.loadAll();
    }).catch(err => this.error.set(err.message));
  }

  setYear(y: number): void {
    this.year.set(Number(y));
    this.loadAll();
  }

  loadAll(): void {
    this.error.set('');
    this.loading.set(true);
    const y = this.year();
    Promise.all([
      getJson<Revenue>('/api/v1/reports/revenue?year=' + y).then(r => this.revenue.set(r)),
      getJson<OpenItems>('/api/v1/reports/open-items').then(o => this.openItems.set(o)),
      getJson<Top>('/api/v1/reports/top-customers?year=' + y).then(t => this.top.set(t)),
      this.loadTax()
    ]).catch(err => this.error.set(err.message)).finally(() => this.loading.set(false));
  }

  loadTax(): Promise<void> {
    const q = this.quarter();
    return getJson<Tax>('/api/v1/reports/tax?year=' + this.year() + (q ? '&quarter=' + q : '')).then(x => this.tax.set(x));
  }

  pct(v: number): number {
    return Math.round(v / this.max() * 1000) / 10;
  }
}
