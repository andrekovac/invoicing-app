import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AuthGuard } from './shared/auth.guard';
import { LoginComponent } from './login/login.component';
import { InvoiceListComponent } from './invoice-list/invoice-list.component';
import { InvoiceEditComponent } from './invoice-edit/invoice-edit.component';
import { CustomerListComponent } from './customers/customer-list.component';
import { CustomerEditComponent } from './customers/customer-edit.component';
import { PaymentListComponent } from './payments/payment-list.component';
import { OverdueComponent } from './overdue/overdue.component';
import { SettingsComponent } from './settings/settings.component';
import { PortalComponent } from './portal/portal.component';
import { PayLinkComponent } from './portal/pay-link.component';
import { InvoiceViewComponent } from './invoice-view.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'invoices', component: InvoiceListComponent, canActivate: [AuthGuard] },
  { path: 'invoices/new', component: InvoiceEditComponent, canActivate: [AuthGuard] },
  { path: 'invoices/:id', component: InvoiceViewComponent, canActivate: [AuthGuard] },
  { path: 'invoices/:id/edit', component: InvoiceEditComponent, canActivate: [AuthGuard] },
  { path: 'customers', component: CustomerListComponent, canActivate: [AuthGuard] },
  { path: 'customers/:id', component: CustomerEditComponent, canActivate: [AuthGuard] },
  { path: 'payments', component: PaymentListComponent, canActivate: [AuthGuard] },
  { path: 'overdue', component: OverdueComponent, canActivate: [AuthGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [AuthGuard] },
  // customers, no login
  { path: 'portal/:token', component: PortalComponent },
  { path: 'pay/:token', component: PayLinkComponent },
  { path: '', pathMatch: 'full', redirectTo: 'invoices' },
  { path: '**', redirectTo: 'invoices' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
