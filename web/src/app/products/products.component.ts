import { Component, OnInit, computed, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EuroPipe } from '../shared/format.pipes';
import { getJson, sendJson } from '../shared/fetch';
import { RATES, gross, round2, parseEuro } from '../shared/pricing';

interface Product {
  id: number;
  sku: string;
  name: string;
  unit: string | null;
  unit_price: number;
  tax_rate: number;
  gross_price: number;
  active: number;
}

interface Draft {
  sku: string;
  name: string;
  unit: string;
  unit_price: string;
  tax_rate: number;
}

function emptyDraft(): Draft {
  return { sku: '', name: '', unit: '', unit_price: '', tax_rate: 19 };
}

@Component({
  selector: 'app-products',
  imports: [NgIf, NgFor, FormsModule, EuroPipe],
  template: `
    <h1>Artikel</h1>
    <div class="toolbar">
      <input type="search" placeholder="Nummer oder Bezeichnung" [ngModel]="q()" (ngModelChange)="q.set($event)">
      <label class="inline"><input type="checkbox" [ngModel]="showAll()" (ngModelChange)="showAll.set($event); load()"> auch archivierte</label>
      <span class="spacer"></span>
      <button class="secondary" (click)="importOpen.set(!importOpen())">Preisliste importieren</button>
    </div>
    <p class="error" *ngIf="error()">{{ error() }}</p>
    <p class="ok" *ngIf="info()">{{ info() }}</p>

    <div class="card" *ngIf="importOpen()">
      <p class="muted">CSV mit Semikolon: Artikelnummer;Bezeichnung;Einheit;Preis;USt (wie die Preisliste aus dem alten Programm)</p>
      <textarea rows="6" style="width: 100%;" [ngModel]="importText()" (ngModelChange)="importText.set($event)"></textarea>
      <input type="file" accept=".csv,text/csv" (change)="readFile($event)">
      <button (click)="doImport()" [disabled]="!importText().trim()">Importieren</button>
    </div>

    <table>
      <thead>
        <tr><th>Nummer</th><th>Bezeichnung</th><th>Einheit</th><th class="num">Netto</th><th>USt.</th><th class="num">Brutto</th><th></th></tr>
      </thead>
      <tbody>
        <tr *ngFor="let p of filtered()" [class.muted]="!p.active">
          <ng-container *ngIf="editId() !== p.id">
            <td>{{ p.sku }}</td>
            <td>{{ p.name }}</td>
            <td>{{ p.unit }}</td>
            <td class="num">{{ p.unit_price | euro }}</td>
            <td>{{ p.tax_rate }} %</td>
            <td class="num">{{ p.gross_price | euro }}</td>
            <td>
              <a href="" (click)="startEdit(p, $event)">ändern</a>
              <a href="" *ngIf="p.active" (click)="remove(p, $event)"> löschen</a>
              <a href="" *ngIf="!p.active" (click)="reactivate(p, $event)"> wieder aktiv</a>
            </td>
          </ng-container>
          <ng-container *ngIf="editId() === p.id">
            <td><input [(ngModel)]="edit.sku" size="8"></td>
            <td><input [(ngModel)]="edit.name" size="36"></td>
            <td><input [(ngModel)]="edit.unit" size="6"></td>
            <td class="num"><input [(ngModel)]="edit.unit_price" size="8"></td>
            <td><select [(ngModel)]="edit.tax_rate"><option *ngFor="let r of rates" [ngValue]="r">{{ r }} %</option></select></td>
            <td class="num">{{ grossOf(edit) | euro }}</td>
            <td><button (click)="saveEdit(p)">Speichern</button> <a href="" (click)="cancelEdit($event)">abbrechen</a></td>
          </ng-container>
        </tr>
        <tr *ngIf="!filtered().length"><td colspan="7" class="muted">Keine Artikel</td></tr>
      </tbody>
      <tfoot>
        <tr>
          <td><input [(ngModel)]="draft.sku" size="8" placeholder="Nr."></td>
          <td><input [(ngModel)]="draft.name" size="36" placeholder="Bezeichnung"></td>
          <td><input [(ngModel)]="draft.unit" size="6" placeholder="Stück"></td>
          <td class="num"><input [(ngModel)]="draft.unit_price" size="8" placeholder="0,00"></td>
          <td><select [(ngModel)]="draft.tax_rate"><option *ngFor="let r of rates" [ngValue]="r">{{ r }} %</option></select></td>
          <td class="num muted">{{ grossOf(draft) | euro }}</td>
          <td><button (click)="add()" [disabled]="!draft.sku || !draft.name">Anlegen</button></td>
        </tr>
      </tfoot>
    </table>
  `
})
export class ProductsComponent implements OnInit {
  rates = RATES;
  products = signal<Product[]>([]);
  q = signal('');
  showAll = signal(false);
  editId = signal<number | null>(null);
  importOpen = signal(false);
  importText = signal('');
  error = signal('');
  info = signal('');
  edit: Draft = emptyDraft();
  draft: Draft = emptyDraft();

  filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    if (!q) return this.products();
    return this.products().filter(p => p.sku.toLowerCase().indexOf(q) === 0 || p.name.toLowerCase().indexOf(q) !== -1);
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    getJson<Product[]>('/api/v1/products' + (this.showAll() ? '?all=1' : ''))
      .then(rows => this.products.set(rows))
      .catch(err => this.error.set(err.message));
  }

  grossOf(d: Draft): number {
    const net = parseEuro(d.unit_price);
    return isNaN(net) ? 0 : round2(gross(net, Number(d.tax_rate)));
  }

  private done(text: string): void {
    this.error.set('');
    this.info.set(text);
    this.load();
  }

  startEdit(p: Product, ev: Event): void {
    ev.preventDefault();
    this.edit = { sku: p.sku, name: p.name, unit: p.unit || '', unit_price: String(p.unit_price).replace('.', ','), tax_rate: p.tax_rate };
    this.editId.set(p.id);
  }

  cancelEdit(ev: Event): void {
    ev.preventDefault();
    this.editId.set(null);
  }

  saveEdit(p: Product): void {
    sendJson('PUT', '/api/v1/products/' + p.id, this.edit)
      .then(() => {
        this.editId.set(null);
        this.done('Gespeichert');
      })
      .catch(err => this.error.set(err.message));
  }

  add(): void {
    sendJson('POST', '/api/v1/products', this.draft)
      .then((p: any) => {
        this.draft = emptyDraft();
        this.done('Artikel ' + p.sku + ' angelegt');
      })
      .catch(err => this.error.set(err.message));
  }

  remove(p: Product, ev: Event): void {
    ev.preventDefault();
    if (!confirm('Artikel ' + p.sku + ' löschen?')) return;
    sendJson<any>('DELETE', '/api/v1/products/' + p.id)
      .then(res => this.done(res && res.archived ? 'Artikel wird auf Rechnungen verwendet, er ist jetzt archiviert' : 'Gelöscht'))
      .catch(err => this.error.set(err.message));
  }

  reactivate(p: Product, ev: Event): void {
    ev.preventDefault();
    sendJson('PUT', '/api/v1/products/' + p.id, { active: true }).then(() => this.done('Wieder aktiv')).catch(err => this.error.set(err.message));
  }

  readFile(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    // the old program writes windows-1252
    reader.onload = () => this.importText.set(String(reader.result || ''));
    reader.readAsText(file, 'windows-1252');
  }

  doImport(): void {
    sendJson<any>('POST', '/api/v1/products/import', { csv: this.importText() })
      .then(res => {
        const errs = res.errors.map((e: any) => 'Zeile ' + e.line + ': ' + e.message).join(', ');
        this.done(res.created + ' neu, ' + res.updated + ' aktualisiert' + (errs ? '. Fehler: ' + errs : ''));
        if (!res.errors.length) {
          this.importText.set('');
          this.importOpen.set(false);
        }
      })
      .catch(err => this.error.set(err.message));
  }
}
