import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { InvoiceService, Invoice } from '../services/invoice.service';
import { CustomerService, Customer } from '../services/customer.service';
import * as pricing from '../shared/pricing';

interface FormItem {
  description: string;
  quantity: string;
  unit_price: string;
}

// create and edit invoices. drafts: everything, issued: texts, dates and note only
@Component({
  selector: 'app-invoice-edit',
  templateUrl: './invoice-edit.component.html'
})
export class InvoiceEditComponent implements OnInit {
  invoice: Invoice | null = null;
  customers: Customer[] = [];
  rates = pricing.RATES;
  form: any = { customer_id: null, tax_rate: 19, discount_percent: '0', issue_date: '', due_date: '', note: '', items: [] };
  error = '';
  info = '';
  busy = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private invoiceService: InvoiceService,
    private customerService: CustomerService
  ) { }

  ngOnInit(): void {
    this.customerService.list().subscribe(rows => {
      this.customers = rows;
      if (!this.form.customer_id && rows.length) {
        this.form.customer_id = rows[0].id;
        this.customerChanged();
      }
    });
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.invoiceService.get(Number(id)).subscribe(inv => this.fill(inv));
    } else {
      this.addItem();
    }
  }

  fill(inv: Invoice): void {
    this.invoice = inv;
    this.form = {
      customer_id: inv.customer_id,
      tax_rate: inv.tax_rate,
      discount_percent: String(inv.discount_percent || 0).replace('.', ','),
      issue_date: inv.issue_date || '',
      due_date: inv.due_date || '',
      note: inv.note || '',
      items: (inv.items || []).map((it: any) => ({
        description: it.description,
        quantity: String(it.quantity).replace('.', ','),
        unit_price: String(it.unit_price).replace('.', ',')
      }))
    };
  }

  title(): string {
    if (!this.invoice) return 'Neue Rechnung';
    return 'Rechnung ' + (this.invoice.number || '(Entwurf)');
  }

  isDraft(): boolean {
    return !this.invoice || this.invoice.status === 'draft';
  }

  // new invoice: default tax rate of the customer, else 19
  customerChanged(): void {
    if (this.invoice) return;
    const c = this.customers.find(x => x.id === this.form.customer_id);
    this.form.tax_rate = c && c.default_tax_rate !== null && c.default_tax_rate !== undefined ? c.default_tax_rate : 19;
  }

  addItem(): void {
    this.form.items.push({ description: '', quantity: '1', unit_price: '' });
  }

  removeItem(i: number): void {
    this.form.items.splice(i, 1);
  }

  private parsedItems(): { description: string; quantity: number; unit_price: number }[] {
    return this.form.items.map((it: FormItem) => ({
      description: it.description,
      quantity: pricing.parseEuro(it.quantity),
      unit_price: pricing.parseEuro(it.unit_price)
    }));
  }

  line(it: FormItem): number {
    const v = pricing.lineTotal(pricing.parseEuro(it.quantity), pricing.parseEuro(it.unit_price));
    return isNaN(v) ? 0 : v;
  }

  totals(): { total_net: number; total_tax: number; total_gross: number } {
    if (this.invoice && !this.isDraft()) {
      return { total_net: this.invoice.total_net, total_tax: this.invoice.total_tax, total_gross: this.invoice.total_gross };
    }
    const items = this.parsedItems().filter(it => !isNaN(it.quantity) && !isNaN(it.unit_price));
    return pricing.totals(items, Number(this.form.tax_rate), pricing.parseEuro(this.form.discount_percent) || 0);
  }

  private payload(): any {
    return {
      customer_id: this.form.customer_id,
      tax_rate: this.form.tax_rate,
      discount_percent: pricing.parseEuro(this.form.discount_percent) || 0,
      issue_date: this.form.issue_date || null,
      due_date: this.form.due_date || null,
      note: this.form.note,
      // the whole list goes back, the api replaces the items
      items: this.form.items.map((it: FormItem) => ({ description: it.description, quantity: it.quantity, unit_price: it.unit_price }))
    };
  }

  save(): void {
    this.busy = true;
    this.error = '';
    this.info = '';
    const req = this.invoice ? this.invoiceService.update(this.invoice.id, this.payload()) : this.invoiceService.create(this.payload());
    req.subscribe(
      inv => {
        const isNew = !this.invoice;
        this.fill(inv);
        this.info = 'Gespeichert';
        this.busy = false;
        if (isNew) this.router.navigate(['/invoices', inv.id, 'edit']);
      },
      err => {
        this.error = (err.error && err.error.error) || 'Fehler beim Speichern';
        this.busy = false;
      }
    );
  }

  issue(): void {
    if (!this.invoice) return;
    this.invoiceService.issue(this.invoice.id).subscribe(
      inv => {
        this.fill(inv);
        this.info = 'Rechnung ' + inv.number + ' gestellt';
      },
      err => this.error = (err.error && err.error.error) || 'Fehler'
    );
  }

  sendMail(): void {
    if (!this.invoice) return;
    this.invoiceService.sendMail(this.invoice.id).subscribe(
      mail => this.info = 'Mail an ' + mail.to + ' liegt im Postausgang',
      err => this.error = (err.error && err.error.error) || 'Fehler'
    );
  }

  copy(): void {
    if (!this.invoice) return;
    this.invoiceService.copy(this.invoice.id).subscribe(inv => this.router.navigate(['/invoices', inv.id, 'edit']));
  }

  cancel(): void {
    if (!this.invoice || !confirm('Rechnung stornieren?')) return;
    this.invoiceService.cancel(this.invoice.id).subscribe(inv => this.fill(inv));
  }

  remove(): void {
    if (!this.invoice || !confirm('Entwurf löschen?')) return;
    this.invoiceService.remove(this.invoice.id).subscribe(() => this.router.navigate(['/invoices']));
  }

  pdfUrl(): string {
    return this.invoice ? this.invoiceService.pdfUrl(this.invoice.id) : '';
  }
}
