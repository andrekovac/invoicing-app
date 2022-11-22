import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CustomerService, Customer } from '../services/customer.service';

@Component({
  selector: 'app-customer-edit',
  templateUrl: './customer-edit.component.html'
})
export class CustomerEditComponent implements OnInit {
  customer: Customer = { name: '' };
  invoices: any[] = [];
  error = '';
  info = '';
  saved = false;

  constructor(private route: ActivatedRoute, private router: Router, private customerService: CustomerService) { }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.customerService.get(Number(id)).subscribe(c => this.customer = c);
      this.customerService.invoices(Number(id)).subscribe(rows => this.invoices = rows);
    }
  }

  save(): void {
    this.error = '';
    this.saved = false;
    this.customerService.save(this.customer).subscribe(
      c => {
        const isNew = !this.customer.id;
        this.customer = c;
        this.saved = true;
        if (isNew) this.router.navigate(['/customers', c.id]);
      },
      err => this.error = (err.error && err.error.error) || 'Fehler beim Speichern'
    );
  }

  portalMail(): void {
    if (!this.customer.id) return;
    this.error = '';
    this.info = '';
    this.customerService.sendPortalMail(this.customer.id).subscribe(
      mail => this.info = 'Portal-Link an ' + mail.to + ' liegt im Postausgang',
      err => this.error = (err.error && err.error.error) || 'Fehler beim Senden'
    );
  }

  remove(): void {
    if (!this.customer.id || !confirm('Kunde wirklich löschen?')) return;
    this.customerService.remove(this.customer.id).subscribe(
      () => this.back(),
      err => this.error = (err.error && err.error.error) || 'Fehler beim Löschen'
    );
  }

  back(): void {
    this.router.navigate(['/customers']);
  }
}
