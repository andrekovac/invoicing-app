import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AuthGuard } from './shared/auth.guard';
import { LoginComponent } from './login/login.component';
import { InvoiceListComponent } from './invoice-list/invoice-list.component';
import { CustomerListComponent } from './customers/customer-list.component';
import { CustomerEditComponent } from './customers/customer-edit.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'invoices', component: InvoiceListComponent, canActivate: [AuthGuard] },
  { path: 'customers', component: CustomerListComponent, canActivate: [AuthGuard] },
  { path: 'customers/:id', component: CustomerEditComponent, canActivate: [AuthGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'invoices' },
  { path: '**', redirectTo: 'invoices' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
