import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './login/login.component';
import { InvoiceListComponent } from './invoice-list/invoice-list.component';
import { EuroPipe, DateDePipe, StatusPipe } from './shared/format.pipes';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    InvoiceListComponent,
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
