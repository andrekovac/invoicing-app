import { Component, OnInit } from '@angular/core';
import { get, put, post, del } from '../../api/client.js';
import { getUser } from '../../session.js';

// admin only (the api answers 403 for normal users)
@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html'
})
export class SettingsComponent implements OnInit {
  account: any = null;
  users: any[] = [];
  outbox: any[] = [];
  imports: any[] = [];
  openMail: any = null;
  me: any = getUser();
  newUser = { name: '', email: '', password: '' };
  accountSaved = false;
  error = '';

  ngOnInit(): void {
    get('/admin/account').then((a: any) => this.account = a).catch((err: any) => this.error = err.message);
    this.loadUsers();
    get('/admin/imports').then((rows: any) => this.imports = rows).catch(() => { /* not admin */ });
    get('/admin/outbox?limit=50').then((rows: any) => this.outbox = rows).catch(() => { /* not admin */ });
  }

  loadUsers(): void {
    get('/admin/users').then((rows: any) => this.users = rows).catch(() => { /* not admin */ });
  }

  saveAccount(): void {
    this.accountSaved = false;
    this.error = '';
    const a = this.account;
    put('/admin/account', { name: a.name, email: a.email, street: a.street, zip: a.zip, city: a.city, iban: a.iban, tax_number: a.tax_number })
      .then((res: any) => {
        this.account = res;
        this.accountSaved = true;
      })
      .catch((err: any) => this.error = err.message);
  }

  addUser(): void {
    this.error = '';
    post('/admin/users', this.newUser)
      .then(() => {
        this.newUser = { name: '', email: '', password: '' };
        this.loadUsers();
      })
      .catch((err: any) => this.error = err.message);
  }

  setRole(u: any, role: string): void {
    put('/admin/users/' + u.id, { role: role }).then(() => this.loadUsers()).catch((err: any) => this.error = err.message);
  }

  removeUser(u: any): void {
    if (!confirm(u.email + ' löschen?')) return;
    del('/admin/users/' + u.id).then(() => this.loadUsers()).catch((err: any) => this.error = err.message);
  }
}
