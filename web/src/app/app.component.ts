import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { getUser, clear } from '../session.js';
import { post } from '../api/client.js';

@Component({
  selector: 'app-root',
  template: `
    <header class="top" *ngIf="user()">
      <strong>Rechnungen</strong>
      <a routerLink="/invoices" routerLinkActive="active">Rechnungen</a>
      <a routerLink="/customers" routerLinkActive="active">Kunden</a>
      <span class="spacer"></span>
      <span class="muted">{{ user()?.account_name }}</span>
      <span>{{ user()?.name || user()?.email }}</span>
      <a href="/admin-old/">Alte Ansicht</a>
      <a href="" (click)="logout($event)">Abmelden</a>
    </header>
    <main><router-outlet></router-outlet></main>
  `
})
export class AppComponent {
  constructor(private router: Router) { }

  user(): any {
    return getUser();
  }

  logout(ev: Event): void {
    ev.preventDefault();
    post('/auth/logout').then(() => {
      clear();
      this.router.navigate(['/login']);
    });
  }
}
