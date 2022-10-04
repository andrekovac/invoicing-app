import { Component, OnInit } from '@angular/core';
import { InvoiceService, Invoice, Summary } from '../services/invoice.service';
import { PaymentService } from '../services/payment.service';

@Component({
  selector: 'app-invoice-list',
  templateUrl: './invoice-list.component.html'
})
export class InvoiceListComponent implements OnInit {
  invoices: Invoice[] = [];
  summary: Summary | null = null;
  q = '';
  status = '';
  loading = false;
  error = '';
  info = '';

  constructor(private invoiceService: InvoiceService, private paymentService: PaymentService) { }

  ngOnInit(): void {
    this.load();
    this.invoiceService.summary().subscribe(s => this.summary = s);
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.invoiceService.list({ q: this.q, status: this.status }).subscribe(
      rows => {
        this.invoices = rows;
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
