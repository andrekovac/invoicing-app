import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CustomerService, Customer } from '../services/customer.service';

@Component({
  selector: 'app-customer-list',
  template: `
    <h1>Kunden</h1>
    <div class="toolbar">
      <input type="search" placeholder="Name, Ort oder Ansprechpartner" [(ngModel)]="q" (keyup.enter)="load()">
      <button class="secondary" (click)="load()">Suchen</button>
      <span class="spacer"></span>
      <button (click)="router.navigate(['/customers', 'new'])">Neuer Kunde</button>
    </div>
    <table>
      <thead><tr><th>Name</th><th>Ansprechpartner</th><th>Ort</th><th>Land</th><th>E-Mail</th><th class="num">Offen</th><th>Alt-Nr.</th></tr></thead>
      <tbody>
        <tr class="click" *ngFor="let c of customers" (click)="router.navigate(['/customers', c.id])">
          <td>{{ c.name }}</td>
          <td>{{ c.contact_name }}</td>
          <td>{{ c.zip }} {{ c.city }}</td>
          <td>{{ c.country }}</td>
          <td>{{ c.email }}</td>
          <td class="num">{{ c.open_amount ? (c.open_amount | euro) : '' }}</td>
          <td class="muted">{{ c.legacy_no }}</td>
        </tr>
        <tr *ngIf="!customers.length"><td colspan="7" class="muted">Keine Kunden gefunden</td></tr>
      </tbody>
    </table>
  `
})
export class CustomerListComponent implements OnInit {
  customers: Customer[] = [];
  q = '';

  constructor(private customerService: CustomerService, public router: Router) { }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.customerService.list(this.q).subscribe(rows => this.customers = rows);
  }
}
