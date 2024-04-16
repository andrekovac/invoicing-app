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
        this.total = res.total;
        this.loading = false;
      },
      err => {
        this.error = (err.error && err.error.error) || 'Fehler beim Laden';
        this.loading = false;
      }
    );
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
