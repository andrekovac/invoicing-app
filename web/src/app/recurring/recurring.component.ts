import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RecurringService, Recurring } from '../services/recurring.service';
import { InvoiceService, Invoice } from '../services/invoice.service';

@Component({
  selector: 'app-recurring',
  standalone: false,
  templateUrl: './recurring.component.html'
})
export class RecurringComponent implements OnInit {
  rows: Recurring[] = [];
  templates: Invoice[] = [];
  selected: Recurring | null = null;
  edit: any = {};
  intervals = [1, 2, 3, 6, 12];
  form: any = this.emptyForm();
  error = '';
  info = '';

  constructor(private recurringService: RecurringService, private invoiceService: InvoiceService, private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.load();
    this.invoiceService.list({ sort: 'issue_date', order: 'desc' }).subscribe(rows => {
      this.templates = rows.filter(i => i.status !== 'cancelled').slice(0, 200);
    });
    const id = Number(this.route.snapshot.queryParamMap.get('id'));
    if (id) this.recurringService.get(id).subscribe(r => this.show(r));
  }

  emptyForm(): any {
    return { template_invoice_id: null, title: '', start_date: '', interval_months: 1, day_of_month: 1, end_date: '' };
  }

  load(): void {
    this.recurringService.list().subscribe(rows => this.rows = rows, err => this.fail(err));
  }

  intervalText(n: number): string {
    if (n === 1) return 'monatlich';
    if (n === 3) return 'vierteljährlich';
    if (n === 6) return 'halbjährlich';
    if (n === 12) return 'jährlich';
    return 'alle ' + n + ' Monate';
  }

  select(r: Recurring): void {
    this.recurringService.get(r.id).subscribe(full => this.show(full), err => this.fail(err));
  }

  private show(r: Recurring): void {
    this.selected = r;
    this.edit = {
      title: r.title || '',
      interval_months: r.interval_months,
      day_of_month: r.day_of_month,
      payment_days: r.payment_days,
      end_date: r.end_date || '',
      auto_issue: !!r.auto_issue,
      send_mail: !!r.send_mail
    };
  }

  private fail(err: any): void {
    const e = err.error || {};
    this.error = e.error || (e.errors ? e.errors.map((x: any) => x.message).join(', ') : 'Fehler');
  }

  private reset(): void {
    this.error = '';
    this.info = '';
  }

  save(): void {
    if (!this.selected) return;
    this.reset();
    this.recurringService.update(this.selected.id, this.edit).subscribe(() => {
      this.info = 'Gespeichert';
      this.select(this.selected!);
      this.load();
    }, err => this.fail(err));
  }

  pause(): void {
    if (!this.selected) return;
    this.reset();
    this.recurringService.pause(this.selected.id).subscribe(r => { this.select(r); this.load(); }, err => this.fail(err));
  }

  resume(): void {
    if (!this.selected) return;
    this.reset();
    this.recurringService.resume(this.selected.id).subscribe(r => { this.select(r); this.load(); }, err => this.fail(err));
  }

  runNow(): void {
    if (!this.selected || !confirm('Nächste Rechnung jetzt erstellen?')) return;
    this.reset();
    this.recurringService.runNow(this.selected.id).subscribe(inv => {
      this.info = 'Rechnung ' + (inv.number || '(Entwurf)') + ' erstellt';
      this.select(this.selected!);
      this.load();
    }, err => this.fail(err));
  }

  remove(): void {
    if (!this.selected || !confirm('Serie löschen? Die erstellten Rechnungen bleiben.')) return;
    this.reset();
    this.recurringService.remove(this.selected.id).subscribe(() => {
      this.selected = null;
      this.load();
    }, err => this.fail(err));
  }

  create(): void {
    this.reset();
    const data = Object.assign({}, this.form);
    if (!data.end_date) delete data.end_date;
    this.recurringService.create(data).subscribe(r => {
      this.info = 'Serie angelegt, erste Rechnung am ' + r.next_date;
      this.form = this.emptyForm();
      this.load();
      this.select(r);
    }, err => this.fail(err));
  }
}
