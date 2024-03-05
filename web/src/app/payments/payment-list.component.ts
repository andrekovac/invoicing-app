import { Component, OnInit } from '@angular/core';
import { PaymentService, Payment } from '../services/payment.service';
import { InvoiceService, Invoice } from '../services/invoice.service';

@Component({
  selector: 'app-payment-list',
  standalone: false,
  templateUrl: './payment-list.component.html'
})
export class PaymentListComponent implements OnInit {
  payments: Payment[] = [];
  openInvoices: Invoice[] = [];
  method = '';
  from = '';
  to = '';

  invoiceId: number | null = null;
  amount = '';
  paidAt = new Date().toISOString().slice(0, 10);
  reference = '';
  error = '';
  info = '';

  constructor(private paymentService: PaymentService, private invoiceService: InvoiceService) { }

  ngOnInit(): void {
    this.load();
    this.loadOpen();
  }

  load(): void {
    this.paymentService.list({ method: this.method, from: this.from, to: this.to }).subscribe(rows => this.payments = rows);
  }

  loadOpen(): void {
    this.invoiceService.list({ status: 'issued' }).subscribe(rows => this.openInvoices = rows);
  }

  open(inv: Invoice): number {
    return Math.round((inv.total_gross - (inv.paid_amount || 0)) * 100) / 100;
  }

  pickInvoice(): void {
    const inv = this.openInvoices.find(i => i.id === this.invoiceId);
    if (inv) {
      this.amount = this.open(inv).toFixed(2).replace('.', ',');
      this.reference = inv.number || '';
    }
  }

  sum(): number {
    return this.payments.reduce((s, p) => s + p.amount, 0);
  }

  record(): void {
    if (!this.invoiceId) return;
    this.error = '';
    this.info = '';
    this.paymentService.recordTransfer(this.invoiceId, this.amount, this.paidAt, this.reference).subscribe(
      (p: any) => {
        this.info = p.open > 0 ? 'Teilzahlung erfasst, noch offen: ' + String(p.open).replace('.', ',') + ' €' : 'Rechnung ist bezahlt';
        this.invoiceId = null;
        this.amount = '';
        this.reference = '';
        this.load();
        this.loadOpen();
      },
      err => this.error = (err.error && err.error.error) || 'Fehler beim Speichern'
    );
  }

  remove(p: Payment): void {
    if (!confirm('Zahlung löschen?')) return;
    this.paymentService.remove(p.id).subscribe(() => {
      this.load();
      this.loadOpen();
    });
  }
}
