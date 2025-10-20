import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EuroPipe } from '../shared/format.pipes';

export interface CardData {
  number: string;
  exp_month: number;
  exp_year: number;
  cvc: string;
}

// card fields for the portal and the payment link page
@Component({
  selector: 'app-card-form',
  imports: [FormsModule, EuroPipe],
  template: `
    <form (ngSubmit)="submit()">
      <div class="form-row">
        <label>Kartennummer <input name="number" [(ngModel)]="number" autocomplete="cc-number" size="22" placeholder="4242 4242 4242 4242"></label>
      </div>
      <div class="form-row">
        <label>Gültig bis (MM/JJ) <input name="exp" [(ngModel)]="exp" autocomplete="cc-exp" size="6" placeholder="12/30"></label>
        <label>CVC <input name="cvc" [(ngModel)]="cvc" autocomplete="cc-csc" size="4"></label>
      </div>
      <button type="submit" [disabled]="busy || !amount">{{ busy ? 'Bitte warten ...' : 'Jetzt ' + (amount | euro) + ' bezahlen' }}</button>
    </form>
  `
})
export class CardFormComponent {
  @Input() amount = 0;
  @Input() busy = false;
  @Output() pay = new EventEmitter<CardData>();

  number = '';
  exp = '';
  cvc = '';

  submit(): void {
    const parts = this.exp.split('/');
    this.pay.emit({
      number: this.number.replace(/\s/g, ''),
      exp_month: Number(parts[0]),
      exp_year: Number(parts[1]),
      cvc: this.cvc.trim()
    });
  }
}
