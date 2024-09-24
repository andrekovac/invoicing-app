import { Component, OnInit, computed, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EuroPipe } from '../shared/format.pipes';
import { getJson, errorText } from '../shared/fetch';

interface BookingSum {
  tax_rate: number;
  account: string;
  key: string;
  bookings: number;
  gross: number;
}

interface Preset {
  label: string;
  from: string;
  to: string;
}

const KINDS = [
  { key: 'invoices', file: 'invoices.csv', label: 'Rechnungen', hint: 'eine Zeile pro Rechnung, Excel' },
  { key: 'items', file: 'items.csv', label: 'Positionen', hint: 'eine Zeile pro Position' },
  { key: 'customers', file: 'customers.csv', label: 'Debitoren', hint: 'Kundenliste mit Debitorennummer' },
  { key: 'datev', file: 'datev.csv', label: 'Buchungsstapel (Steuerberater)', hint: 'altes Format wie aus dem Desktop-Programm' }
];

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function lastDay(y: number, m: number): string {
  return y + '-' + pad(m) + '-' + pad(new Date(y, m, 0).getDate());
}

// downloads with fetch + blob: a plain link would lose the error message of the api
@Component({
  selector: 'app-export',
  imports: [NgIf, NgFor, FormsModule, EuroPipe],
  template: `
    <h1>Export für den Steuerberater</h1>
    <div class="card">
      <div class="toolbar">
        <button class="secondary" *ngFor="let p of presets" (click)="usePreset(p)" [class.active]="from() === p.from && to() === p.to">{{ p.label }}</button>
      </div>
      <div class="form-row">
        <label>von <input type="date" [ngModel]="from()" (ngModelChange)="from.set($event); loadSummary()"></label>
        <label>bis <input type="date" [ngModel]="to()" (ngModelChange)="to.set($event); loadSummary()"></label>
        <label class="inline"><input type="checkbox" [ngModel]="withCancelled()" (ngModelChange)="withCancelled.set($event)"> stornierte mit ausgeben</label>
      </div>
    </div>

    <p class="error" *ngIf="error()">{{ error() }}</p>

    <div class="buckets">
      <div class="card bucket" *ngFor="let k of kinds">
        <b>{{ k.label }}</b>
        <div class="muted">{{ k.hint }}</div>
        <button style="margin-top: 8px;" [disabled]="busy() === k.key" (click)="download(k)">{{ busy() === k.key ? 'lädt ...' : 'Herunterladen' }}</button>
      </div>
    </div>

    <div *ngIf="summary().length" class="card">
      <h2>Buchungsstapel im Zeitraum</h2>
      <table>
        <thead><tr><th>USt-Satz</th><th>Erlöskonto</th><th>BU-Schlüssel</th><th class="num">Buchungen</th><th class="num">Umsatz brutto</th></tr></thead>
        <tbody>
          <tr *ngFor="let s of summary()">
            <td>{{ s.tax_rate }} %</td>
            <td>{{ s.account }}</td>
            <td>{{ s.key || '-' }}</td>
            <td class="num">{{ s.bookings }}</td>
            <td class="num">{{ s.gross | euro }}</td>
          </tr>
          <tr><td colspan="4" class="num"><b>Summe</b></td><td class="num"><b>{{ summaryTotal() | euro }}</b></td></tr>
        </tbody>
      </table>
    </div>
    <p class="muted" *ngIf="lastFile()">Zuletzt: {{ lastFile() }}</p>
  `
})
export class ExportComponent implements OnInit {
  kinds = KINDS;
  presets: Preset[] = [];
  from = signal('');
  to = signal('');
  withCancelled = signal(false);
  summary = signal<BookingSum[]>([]);
  busy = signal('');
  error = signal('');
  lastFile = signal('');

  summaryTotal = computed(() => Math.round(this.summary().reduce((s, x) => s + x.gross, 0) * 100) / 100);

  ngOnInit(): void {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const q = Math.floor((m - 1) / 3) + 1;
    const prevM = m === 1 ? 12 : m - 1;
    const prevMY = m === 1 ? y - 1 : y;
    const prevQ = q === 1 ? 4 : q - 1;
    const prevQY = q === 1 ? y - 1 : y;
    this.presets = [
      { label: 'Letzter Monat', from: prevMY + '-' + pad(prevM) + '-01', to: lastDay(prevMY, prevM) },
      { label: 'Letztes Quartal', from: prevQY + '-' + pad((prevQ - 1) * 3 + 1) + '-01', to: lastDay(prevQY, prevQ * 3) },
      { label: 'Dieses Jahr', from: y + '-01-01', to: y + '-12-31' },
      { label: 'Letztes Jahr', from: (y - 1) + '-01-01', to: (y - 1) + '-12-31' }
    ];
    this.usePreset(this.presets[1]);
  }

  usePreset(p: Preset): void {
    this.from.set(p.from);
    this.to.set(p.to);
    this.loadSummary();
  }

  private query(): string {
    const parts: string[] = [];
    if (this.from()) parts.push('from=' + this.from());
    if (this.to()) parts.push('to=' + this.to());
    if (this.withCancelled()) parts.push('cancelled=1');
    return parts.length ? '?' + parts.join('&') : '';
  }

  loadSummary(): void {
    this.error.set('');
    getJson<BookingSum[]>('/api/v1/export/datev/summary' + this.query())
      .then(rows => this.summary.set(rows))
      .catch(err => {
        this.summary.set([]);
        this.error.set(err.message);
      });
  }

  async download(k: { key: string; file: string }): Promise<void> {
    this.busy.set(k.key);
    this.error.set('');
    try {
      const res = await fetch('/api/v1/export/' + k.file + (k.key === 'customers' ? '' : this.query()), { credentials: 'same-origin' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(errorText(data, res.status));
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name ? name[1] : k.file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      this.lastFile.set(a.download);
    } catch (err: any) {
      this.error.set(err.message);
    } finally {
      this.busy.set('');
    }
  }
}
