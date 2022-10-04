import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { get, post } from '../../api/client.js';
import * as cart from '../../cart.js';
import { CardData } from './card-form.component';

// no login here, the token in the url is the access
@Component({
  selector: 'app-portal',
  templateUrl: './portal.component.html'
})
export class PortalComponent implements OnInit {
  token = '';
  data: any = null;
  cartIds: number[] = [];
  error = '';
  payError = '';
  done = '';
  busy = false;

  constructor(private route: ActivatedRoute) { }

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    this.load();
  }

  load(): void {
    get('/portal/' + this.token).then((d: any) => {
      this.data = d;
      this.cartIds = cart.sync(this.token, d.invoices);
    }).catch((err: any) => this.error = err.message);
  }

  inCart(inv: any): boolean {
    return this.cartIds.indexOf(inv.id) !== -1;
  }

  toggle(inv: any): void {
    this.cartIds = cart.toggle(this.token, inv.id);
  }

  all(): void {
    this.data.invoices.forEach((inv: any) => cart.add(this.token, inv.id));
    this.cartIds = cart.ids(this.token);
  }

  total(): number {
    return this.data ? cart.total(this.token, this.data.invoices) : 0;
  }

  pdfUrl(inv: any): string {
    return '/api/v1/portal/' + this.token + '/invoices/' + inv.id + '/pdf';
  }

  pay(card: CardData): void {
    this.busy = true;
    this.payError = '';
    post('/portal/' + this.token + '/pay', { invoice_ids: this.cartIds, card: card })
      .then((res: any) => {
        this.done = 'Danke! ' + res.paid.join(', ') + ' bezahlt.';
        cart.clear(this.token);
        this.load();
      })
      .catch((err: any) => {
        // Achtung: CardPay sagt nicht immer warum, dann nur die allgemeine Meldung
        this.payError = err.status === 402 ? 'Karte abgelehnt' : 'Zahlung fehlgeschlagen';
      })
      .then(() => this.busy = false);
  }
}
