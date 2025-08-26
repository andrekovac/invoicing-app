import { Component, OnInit } from '@angular/core';
import { InvoiceService, Invoice, Summary } from '../services/invoice.service';
import { PaymentService } from '../services/payment.service';

@Component({
  selector: 'app-invoice-list',
  standalone: false,
  templateUrl: './invoice-list.component.html'
})
export class InvoiceListComponent implements OnInit {
  invoices: Invoice[] = [];
  summary: Summary | null = null;
  q = '';
  status = '';
  sort = 'id';
  order: 'asc' | 'desc' = 'desc';
  page = 1;
  perPage = 25;
  total = 0;
  loading = false;
  error = '';
  info = '';
  selected: number[] = [];
  busy = false;
  bulkErrors: string[] = [];

  constructor(private invoiceService: InvoiceService, private paymentService: PaymentService) { }

  ngOnInit(): void {
    this.load();
    this.invoiceService.summary().subscribe(s => this.summary = s);
  }

  // new search: back to page 1
  search(): void {
    this.page = 1;
    this.load();
  }

  goTo(p: number): void {
    this.page = p;
    this.load();
  }

  sortBy(col: string): void {
    if (this.sort === col) this.order = this.order === 'asc' ? 'desc' : 'asc';
    else {
      this.sort = col;
      this.order = col === 'customer_name' || col === 'number' ? 'asc' : 'desc';
    }
    this.search();
  }

  arrow(col: string): string {
    if (this.sort !== col) return '';
    return this.order === 'asc' ? ' ▲' : ' ▼';
  }

  load(): void {
    this.loading = true;
    this.error = '';
    const filter = { q: this.q, status: this.status, sort: this.sort, order: this.order };
    this.invoiceService.page(filter, this.page, this.perPage).subscribe(
      res => {
        this.invoices = res.rows;
        this.selected = this.selected.filter(id => res.rows.some(r => r.id === id));
        this.total = res.total;
        this.loading = false;
      },
      err => {
        this.error = (err.error && err.error.error) || 'Fehler beim Laden';
        this.loading = false;
      }
    );
  }

  isSelected(inv: Invoice): boolean {
    return this.selected.indexOf(inv.id) !== -1;
  }

  toggle(inv: Invoice): void {
    this.selected = this.isSelected(inv) ? this.selected.filter(id => id !== inv.id) : this.selected.concat([inv.id]);
  }

  allSelected(): boolean {
    return this.invoices.length > 0 && this.invoices.every(inv => this.isSelected(inv));
  }

  toggleAll(): void {
    this.selected = this.allSelected() ? [] : this.invoices.map(inv => inv.id);
  }

  // what the selected invoices allow (drafts can only be issued, ...)
  canDo(action: string): boolean {
    const rows = this.invoices.filter(inv => this.isSelected(inv));
    if (!rows.length) return false;
    if (action === 'issue') return rows.some(r => r.status === 'draft');
    if (action === 'paid' || action === 'mail') return rows.some(r => r.status === 'issued');
    if (action === 'remind') return rows.some(r => this.isOverdue(r));
    if (action === 'cancel') return rows.some(r => r.status === 'issued' || r.status === 'draft');
    if (action === 'sent') return rows.some(r => r.status === 'issued' && !r.sent_at);
    if (action === 'delete') return rows.some(r => r.status === 'draft');
    return false;
  }

  bulk(action: string): void {
    const texts: { [k: string]: string } = { issue: 'stellen', paid: 'als bezahlt markieren', cancel: 'stornieren', remind: 'erinnern', mail: 'per Mail senden', sent: 'als per Post versendet markieren', delete: 'löschen (nur Entwürfe)' };
    if (!confirm(this.selected.length + ' Rechnungen ' + texts[action] + '?')) return;
    this.busy = true;
    this.info = '';
    this.error = '';
    this.bulkErrors = [];
    this.invoiceService.bulk(action, this.selected).subscribe(
      res => {
        this.busy = false;
        this.info = res.done + ' erledigt' + (res.failed ? ', ' + res.failed + ' nicht möglich' : '');
        this.bulkErrors = res.results.filter(r => !r.ok).map(r => {
          const inv = this.invoices.find(i => i.id === r.id);
          return (inv && inv.number ? inv.number : '#' + r.id) + ': ' + r.error;
        });
        this.selected = [];
        this.load();
        this.invoiceService.summary().subscribe(s => this.summary = s);
      },
      err => {
        this.busy = false;
        this.error = (err.error && err.error.error) || 'Fehler';
      }
    );
  }

  csvUrl(): string {
    return this.invoiceService.csvUrl({ q: this.q, status: this.status, sort: this.sort, order: this.order });
  }

  pdfUrl(inv: Invoice): string {
    return this.invoiceService.pdfUrl(inv.id);
  }

  open(inv: Invoice): number {
    return Math.round((inv.total_gross - (inv.paid_amount || 0)) * 100) / 100;
  }

  // same rule as payments.isOverdue in the api
  isOverdue(inv: Invoice): boolean {
    return inv.status === 'issued' && !!inv.due_date && new Date(inv.due_date) < new Date();
  }

  copyLink(inv: Invoice, ev: Event): void {
    ev.preventDefault();
    this.paymentService.createLink(inv.id).subscribe(link => {
      navigator.clipboard.writeText(link.url).then(
        () => this.info = 'Zahlungslink für ' + inv.number + ' kopiert',
        () => this.info = link.url
      );
    });
  }
}
