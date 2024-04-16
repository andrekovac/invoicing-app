import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';

// pager under a list. total comes from the X-Total-Count header of the api
@Component({
  selector: 'app-pager',
  imports: [NgIf, NgFor],
  template: `
    <div class="pager" *ngIf="pages() > 1">
      <button class="secondary" [disabled]="page() <= 1" (click)="go(page() - 1)">&lsaquo;</button>
      <ng-container *ngFor="let p of numbers()">
        <span class="muted" *ngIf="p === 0">...</span>
        <button *ngIf="p !== 0" [class.secondary]="p !== page()" (click)="go(p)">{{ p }}</button>
      </ng-container>
      <button class="secondary" [disabled]="page() >= pages()" (click)="go(page() + 1)">&rsaquo;</button>
      <span class="muted">{{ total() }} Rechnungen, Seite {{ page() }} von {{ pages() }}</span>
    </div>
  `
})
export class PagerComponent {
  total = signal(0);
  perPage = signal(25);
  page = signal(1);

  @Input('total') set totalInput(v: number) { this.total.set(v || 0); }
  @Input('perPage') set perPageInput(v: number) { this.perPage.set(v || 25); }
  @Input('page') set pageInput(v: number) { this.page.set(v || 1); }
  @Output() pageChange = new EventEmitter<number>();

  pages = computed(() => Math.max(1, Math.ceil(this.total() / this.perPage())));

  // 1 ... 4 5 [6] 7 8 ... 20   (0 = gap)
  numbers = computed(() => {
    const n = this.pages();
    const cur = this.page();
    const out: number[] = [];
    for (let p = 1; p <= n; p++) {
      if (p === 1 || p === n || Math.abs(p - cur) <= 2) out.push(p);
      else if (out[out.length - 1] !== 0) out.push(0);
    }
    return out;
  });

  go(p: number): void {
    if (p < 1 || p > this.pages() || p === this.page()) return;
    this.page.set(p);
    this.pageChange.emit(p);
  }
}
