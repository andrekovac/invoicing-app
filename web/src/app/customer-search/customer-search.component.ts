import { Component, OnDestroy, computed, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EuroPipe, DateDePipe } from '../shared/format.pipes';
import { getJson } from '../shared/fetch';

interface Hit {
  id: number;
  name: string;
  contact_name: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  legacy_no: string | null;
  invoice_count: number;
  last_invoice_date: string | null;
  open_amount: number;
}

const RECENT_KEY = 'rechnungen.customerSearch.recent';

// search while typing (after 2 letters, 250 ms pause). the last searches are kept per browser tab
@Component({
  selector: 'app-customer-search',
  imports: [NgIf, NgFor, FormsModule, RouterLink, EuroPipe, DateDePipe],
  template: `
    <h1>Kundensuche</h1>
    <div class="toolbar">
      <input type="search" size="40" placeholder="Firmenname, z. B. Krause" autofocus
             [ngModel]="q()" (ngModelChange)="typed($event)" (keyup.enter)="searchNow()">
      <label><input type="checkbox" [ngModel]="onlyOpen()" (ngModelChange)="onlyOpen.set($event); searchNow()"> nur mit offenen Rechnungen</label>
      <span class="spacer"></span>
      <a routerLink="/customers">Alle Kunden</a>
      <span class="muted" *ngIf="loading()">sucht ...</span>
    </div>

    <p class="muted" *ngIf="!q() && recent().length">
      Zuletzt gesucht:
      <a href="" *ngFor="let r of recent()" (click)="pick(r, $event)" style="margin-right: 8px;">{{ r }}</a>
    </p>
    <p class="error" *ngIf="error()">{{ error() }}</p>

    <table *ngIf="searched()">
      <thead>
        <tr><th>Name</th><th>Ort</th><th>E-Mail</th><th class="num">Rechnungen</th><th>Letzte</th><th class="num">Offen</th></tr>
      </thead>
      <tbody>
        <tr class="click" *ngFor="let c of hits()" (click)="open(c)">
          <td>{{ c.name }} <span class="muted" *ngIf="c.legacy_no">({{ c.legacy_no }})</span>
            <div class="muted" *ngIf="c.contact_name">{{ c.contact_name }}</div></td>
          <td>{{ c.zip }} {{ c.city }}<span class="muted" *ngIf="c.country">, {{ c.country }}</span></td>
          <td>{{ c.email }}</td>
          <td class="num">{{ c.invoice_count }}</td>
          <td>{{ c.last_invoice_date | dateDe }}</td>
          <td class="num" [class.overdue]="c.open_amount > 0">{{ c.open_amount ? (c.open_amount | euro) : '' }}</td>
        </tr>
        <tr *ngIf="!hits().length"><td colspan="6" class="muted">Kein Kunde gefunden</td></tr>
      </tbody>
      <tfoot *ngIf="hits().length > 1">
        <tr><td colspan="5" class="muted">{{ hits().length }} Treffer{{ hits().length >= 50 ? ' (nur die ersten 50)' : '' }}</td>
          <td class="num">{{ openSum() | euro }}</td></tr>
      </tfoot>
    </table>
  `
})
export class CustomerSearchComponent implements OnDestroy {
  q = signal('');
  onlyOpen = signal(false);
  hits = signal<Hit[]>([]);
  searched = signal(false);
  loading = signal(false);
  error = signal('');
  recent = signal<string[]>(this.loadRecent());

  openSum = computed(() => Math.round(this.hits().reduce((s, c) => s + (c.open_amount || 0), 0) * 100) / 100);

  private timer: any = null;
  private seq = 0;

  constructor(private router: Router) { }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  typed(v: string): void {
    this.q.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.searchNow(), 250);
  }

  searchNow(): void {
    clearTimeout(this.timer);
    const q = this.q().trim();
    this.error.set('');
    if (q.length < 2) {
      this.hits.set([]);
      this.searched.set(false);
      return;
    }
    // only the answer of the last request counts
    const mine = ++this.seq;
    this.loading.set(true);
    getJson<Hit[]>('/api/v1/customers/search?q=' + encodeURIComponent(q) + (this.onlyOpen() ? '&with_open=1' : ''))
      .then(rows => {
        if (mine !== this.seq) return;
        this.hits.set(rows);
        this.searched.set(true);
        if (rows.length) this.remember(q);
      })
      .catch(err => {
        if (mine === this.seq) this.error.set(err.message);
      })
      .finally(() => {
        if (mine === this.seq) this.loading.set(false);
      });
  }

  pick(q: string, ev: Event): void {
    ev.preventDefault();
    this.q.set(q);
    this.searchNow();
  }

  open(c: Hit): void {
    this.router.navigate(['/customers', c.id]);
  }

  private loadRecent(): string[] {
    try {
      return JSON.parse(sessionStorage.getItem(RECENT_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  private remember(q: string): void {
    const list = [q].concat(this.recent().filter(r => r.toLowerCase() !== q.toLowerCase())).slice(0, 5);
    this.recent.set(list);
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(list));
  }
}
