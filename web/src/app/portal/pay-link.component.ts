import { Component, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { get, post } from '../../api/client.js';
import { CardData, CardFormComponent } from './card-form.component';
import { EuroPipe, DateDePipe } from '../shared/format.pipes';

// /pay/<token> from the invoice mail: pay one invoice
@Component({
  selector: 'app-pay-link',
  imports: [NgIf, CardFormComponent, EuroPipe, DateDePipe],
  template: `
    <div class="card" style="max-width: 520px; margin: 40px auto;">
      <p class="error" *ngIf="error">{{ error }}</p>
      <div *ngIf="inv">
        <h2>Rechnung {{ inv.number }}</h2>
        <p>{{ inv.account_name }}<span *ngIf="inv.account_city">, {{ inv.account_city }}</span></p>
        <p>an {{ inv.customer_name }}, vom {{ inv.issue_date | dateDe }}, fällig {{ inv.due_date | dateDe }}</p>
        <p>Betrag: <b>{{ inv.total_gross | euro }}</b><span *ngIf="inv.open !== inv.total_gross">, noch offen: <b>{{ inv.open | euro }}</b></span></p>
        <p class="ok" *ngIf="inv.status === 'paid' || paid">Bezahlt, vielen Dank!</p>
        <app-card-form *ngIf="inv.status === 'issued' && !paid" [amount]="inv.open" [busy]="busy" (pay)="pay($event)"></app-card-form>
        <p class="error" *ngIf="payError">{{ payError }}</p>
      </div>
    </div>
  `
})
export class PayLinkComponent implements OnInit {
  token = '';
  inv: any = null;
  error = '';
  payError = '';
  busy = false;
  paid = false;

  constructor(private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    get('/payments/link/' + this.token).then((d: any) => this.inv = d).catch((err: any) => this.error = err.message);
  }

  pay(card: CardData): void {
    this.busy = true;
    this.payError = '';
    post('/payments/link/' + this.token + '/card', { card: card })
      .then(() => this.paid = true)
      .catch((err: any) => this.payError = err.status === 402 ? 'Karte abgelehnt' : 'Zahlung fehlgeschlagen')
      .then(() => this.busy = false);
  }
}
