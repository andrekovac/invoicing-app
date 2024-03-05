import { Pipe, PipeTransform } from '@angular/core';

// 1234.5 -> "1.234,50 €" (same as lib/money.js formatEuro in the api)
@Pipe({ name: 'euro', standalone: false })
export class EuroPipe implements PipeTransform {
  transform(n: number | null | undefined): string {
    if (n === null || n === undefined || isNaN(n)) return '';
    const neg = n < 0;
    const parts = Math.abs(Math.round(n * 100) / 100).toFixed(2).split('.');
    return (neg ? '-' : '') + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + parts[1] + ' €';
  }
}

@Pipe({ name: 'dateDe', standalone: false })
export class DateDePipe implements PipeTransform {
  transform(s: string | null | undefined): string {
    if (!s) return '';
    const p = s.slice(0, 10).split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }
}

const STATUS: { [k: string]: string } = { draft: 'Entwurf', issued: 'Gestellt', paid: 'Bezahlt', cancelled: 'Storniert' };

@Pipe({ name: 'status', standalone: false })
export class StatusPipe implements PipeTransform {
  transform(s: string): string {
    return STATUS[s] || s;
  }
}
