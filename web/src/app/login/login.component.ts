import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { post, get } from '../../api/client.js';
import { setUser } from '../../session.js';

@Component({
  selector: 'app-login',
  imports: [NgIf, FormsModule],
  template: `
    <div class="card" style="max-width: 360px; margin: 60px auto;">
      <h2>Anmelden</h2>
      <form (ngSubmit)="login()">
        <div class="form-row"><label>E-Mail <input name="email" type="email" [(ngModel)]="email" required></label></div>
        <div class="form-row"><label>Passwort <input name="password" type="password" [(ngModel)]="password" required></label></div>
        <p class="error" *ngIf="error">{{ error }}</p>
        <button type="submit" [disabled]="busy">Anmelden</button>
      </form>
    </div>
  `
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  busy = false;

  constructor(private router: Router) { }

  login(): void {
    this.busy = true;
    this.error = '';
    post('/auth/login', { email: this.email, password: this.password })
      .then(() => get('/auth/me'))
      .then((me: any) => {
        setUser(me);
        this.router.navigate(['/invoices']);
      })
      .catch((err: any) => { this.error = err.message; })
      .then(() => { this.busy = false; });
  }
}
