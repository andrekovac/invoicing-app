import { Component, OnInit, computed, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EuroPipe, DateDePipe, StatusPipe } from './shared/format.pipes';
import { getJson, sendJson } from './shared/fetch';
import { lineTotal } from './shared/pricing';

interface ViewItem {
  id: number;
  position: number;
  description: string;
  quantity: number;
  unit_price: number;
}

interface ViewInvoice {
  id: number;
  number: string | null;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  tax_rate: number;
  discount_percent: number;
  total_net: number;
  total_tax: number;
  total_gross: number;
  note: string | null;
  items: ViewItem[];
  customer: { id: number; name: string; contact_name?: string; street?: string; zip?: string; city?: string; country?: string; email?: string; vat_id?: string };
}

interface PaymentRow {
  id: number;
  amount: number;
  method: string;
  paid_at: string;
  reference: string | null;
}

interface EventRow {
  id: number;
  type: string;
  created_at: string;
  user_name: string | null;
  data: any;
}

const EVENT_TEXT: { [k: string]: string } = {
  created: 'angelegt',
  updated: 'geändert',
  issued: 'gestellt',
  paid: 'bezahlt',
  cancelled: 'storniert',
  note: 'Notiz geändert',
  status: 'Status geändert',
  reminder: 'Erinnerung gesendet'
};

// read only page of one invoice. the amounts are the stored ones (what the customer got),
// the pdf is the document itself
@Component({
  selector: 'app-invoice-view',
  imports: [NgIf, NgFor, RouterLink, EuroPipe, DateDePipe, StatusPipe],
  template: `
    <p class="error" *ngIf="error()">{{ error() }}</p>
    <ng-container *ngIf="invoice() as inv">
      <div class="toolbar">
        <h1 style="margin: 0;">Rechnung {{ inv.number || '(Entwurf)' }}</h1>
        <span class="status status-{{ inv.status }}">{{ inv.status | status }}</span>
        <span class="spacer"></span>
        <a [href]="pdfUrl()" target="_blank">PDF öffnen</a>
        <a [href]="pdfUrl() + '?download=1'">PDF herunterladen</a>
        <button class="secondary" [routerLink]="['/invoices', inv.id, 'edit']">Bearbeiten</button>
      </div>

      <div class="card view-head">
        <div>
          <b>{{ inv.customer.name }}</b><br>
          <span *ngIf="inv.customer.contact_name">{{ inv.customer.contact_name }}<br></span>
          <span *ngIf="inv.customer.street">{{ inv.customer.street }}<br></span>
          {{ inv.customer.zip }} {{ inv.customer.city }}<span *ngIf="inv.customer.country">, {{ inv.customer.country }}</span>
        </div>
        <div class="muted">
          <div>Datum: {{ inv.issue_date | dateDe }}</div>
          <div [class.overdue]="overdue()">Fällig: {{ inv.due_date | dateDe }}</div>
          <div *ngIf="inv.paid_at">Bezahlt am: {{ inv.paid_at | dateDe }}</div>
          <div *ngIf="inv.customer.vat_id">USt-IdNr.: {{ inv.customer.vat_id }}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Pos</th><th>Beschreibung</th><th class="num">Menge</th><th class="num">Einzelpreis</th><th class="num">Summe</th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let it of inv.items; let i = index">
            <td>{{ i + 1 }}</td>
            <td>{{ it.description }}</td>
            <td class="num">{{ qty(it.quantity) }}</td>
            <td class="num">{{ it.unit_price | euro }}</td>
            <td class="num">{{ line(it) | euro }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr *ngIf="inv.discount_percent"><td colspan="4" class="num">Rabatt</td><td class="num">{{ inv.discount_percent }} %</td></tr>
          <tr><td colspan="4" class="num">Netto</td><td class="num">{{ inv.total_net | euro }}</td></tr>
          <tr><td colspan="4" class="num">USt. {{ inv.tax_rate }} %</td><td class="num">{{ inv.total_tax | euro }}</td></tr>
          <tr><td colspan="4" class="num"><b>Gesamt</b></td><td class="num"><b>{{ inv.total_gross | euro }}</b></td></tr>
          <tr *ngIf="paid() > 0"><td colspan="4" class="num">Bezahlt</td><td class="num">{{ paid() | euro }}</td></tr>
          <tr *ngIf="paid() > 0 && open() > 0"><td colspan="4" class="num"><b>Offen</b></td><td class="num"><b>{{ open() | euro }}</b></td></tr>
        </tfoot>
      </table>

      <div class="card" *ngIf="inv.note" style="margin-top: 16px;">
        <div class="muted">Interne Notiz</div>
        {{ inv.note }}
      </div>

      <div class="cols" style="margin-top: 16px;">
        <div>
          <h2>Zahlungen</h2>
          <table>
            <tbody>
              <tr *ngFor="let p of payments()">
                <td>{{ p.paid_at | dateDe }}</td>
                <td>{{ p.method === 'card' ? 'Karte' : 'Überweisung' }}</td>
                <td class="muted">{{ p.reference }}</td>
                <td class="num">{{ p.amount | euro }}</td>
              </tr>
              <tr *ngIf="!payments().length"><td class="muted">Noch keine Zahlung</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h2>Verlauf</h2>
          <table>
            <tbody>
              <tr *ngFor="let e of events()">
                <td>{{ e.created_at | dateDe }}</td>
                <td>{{ eventText(e) }}</td>
                <td class="muted">{{ e.user_name }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="toolbar" style="margin-top: 16px;">
        <button class="secondary" (click)="back()">Zurück zur Liste</button>
        <button class="secondary" *ngIf="inv.status === 'issued'" (click)="copyPayLink()">Zahlungslink kopieren</button>
        <span class="ok" *ngIf="info()">{{ info() }}</span>
      </div>
    </ng-container>
  `
})
export class InvoiceViewComponent implements OnInit {
  invoice = signal<ViewInvoice | null>(null);
  payments = signal<PaymentRow[]>([]);
  events = signal<EventRow[]>([]);
  error = signal('');
  info = signal('');

  paid = computed(() => Math.round(this.payments().reduce((s, p) => s + p.amount, 0) * 100) / 100);
  open = computed(() => {
    const inv = this.invoice();
    return inv ? Math.round((inv.total_gross - this.paid()) * 100) / 100 : 0;
  });
  overdue = computed(() => {
    const inv = this.invoice();
    return !!inv && inv.status === 'issued' && !!inv.due_date && new Date(inv.due_date) < new Date();
  });

  constructor(private route: ActivatedRoute, private router: Router) { }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    getJson<ViewInvoice>('/api/v1/invoices/' + id)
      .then(inv => this.invoice.set(inv))
      .catch(err => this.error.set(err.status === 404 ? 'Rechnung nicht gefunden' : err.message));
    getJson<any>('/api/v1/payments?invoice_id=' + id)
      .then(res => this.payments.set(res.payments || []))
      .catch(() => this.payments.set([]));
    getJson<EventRow[]>('/api/v1/invoices/' + id + '/events')
      .then(rows => this.events.set(rows))
      .catch(() => this.events.set([]));
  }

  pdfUrl(): string {
    const inv = this.invoice();
    return inv ? '/api/v1/invoices/' + inv.id + '/pdf' : '';
  }

  qty(n: number): string {
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }

  line(it: ViewItem): number {
    return lineTotal(it.quantity, it.unit_price);
  }

  eventText(e: EventRow): string {
    let text = EVENT_TEXT[e.type] || e.type;
    if (e.type === 'issued' && e.data && e.data.number) text += ' (' + e.data.number + ')';
    if (e.type === 'created' && e.data && e.data.copied_from) text += ' als Kopie von ' + e.data.copied_from;
    if (e.type === 'created' && e.data && e.data.recurring_from) text += ' (Serienrechnung)';
    return text;
  }

  copyPayLink(): void {
    const inv = this.invoice();
    if (!inv) return;
    sendJson<any>('POST', '/api/v1/payments/link', { invoice_id: inv.id, days: 30 })
      .then(link => navigator.clipboard.writeText(link.url).then(() => this.info.set('Zahlungslink kopiert'), () => this.info.set(link.url)))
      .catch(err => this.error.set(err.message));
  }

  back(): void {
    this.router.navigate(['/invoices']);
  }
}
