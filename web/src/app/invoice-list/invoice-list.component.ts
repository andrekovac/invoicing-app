import { Component, OnInit } from '@angular/core';
import { InvoiceService, Invoice, Summary } from '../services/invoice.service';

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

  constructor(private invoiceService: InvoiceService) { }

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
}
