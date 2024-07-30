import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { InvoiceListComponent } from './invoice-list/invoice-list.component';
import { InvoiceEditComponent } from './invoice-edit/invoice-edit.component';
import { CustomerListComponent } from './customers/customer-list.component';
import { CustomerEditComponent } from './customers/customer-edit.component';
import { PaymentListComponent } from './payments/payment-list.component';
import { OverdueComponent } from './overdue/overdue.component';
import { SettingsComponent } from './settings/settings.component';
import { PortalComponent } from './portal/portal.component';
import { RecurringComponent } from './recurring/recurring.component';
import { CardFormComponent } from './portal/card-form.component';
import { PagerComponent } from './shared/pager.component';
import { EuroPipe, DateDePipe, StatusPipe } from './shared/format.pipes';

// the older pages are still declared here. new pages are standalone components
// (see app-routing.module.ts), move the others over when you touch them anyway
@NgModule({
  declarations: [
    AppComponent,
    InvoiceListComponent,
    InvoiceEditComponent,
    CustomerListComponent,
    CustomerEditComponent,
    PaymentListComponent,
    OverdueComponent,
    SettingsComponent,
    PortalComponent,
    RecurringComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    CardFormComponent,
    PagerComponent,
    EuroPipe,
    DateDePipe,
    StatusPipe
  ],
  providers: [provideHttpClient(withInterceptorsFromDi())],
  bootstrap: [AppComponent]
})
export class AppModule { }
