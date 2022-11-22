import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './login/login.component';
import { InvoiceListComponent } from './invoice-list/invoice-list.component';
import { InvoiceEditComponent } from './invoice-edit/invoice-edit.component';
import { CustomerListComponent } from './customers/customer-list.component';
import { CustomerEditComponent } from './customers/customer-edit.component';
import { PaymentListComponent } from './payments/payment-list.component';
import { OverdueComponent } from './overdue/overdue.component';
import { PortalComponent } from './portal/portal.component';
import { PayLinkComponent } from './portal/pay-link.component';
import { CardFormComponent } from './portal/card-form.component';
import { EuroPipe, DateDePipe, StatusPipe } from './shared/format.pipes';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    InvoiceListComponent,
    InvoiceEditComponent,
    CustomerListComponent,
    CustomerEditComponent,
    PaymentListComponent,
    OverdueComponent,
    PortalComponent,
    PayLinkComponent,
    CardFormComponent,
    EuroPipe,
    DateDePipe,
    StatusPipe
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
