// tiny pdf writer, text only. good enough for invoices, no dependency needed.
// layout is line based (courier) so the txt version is the same lines.
const pricing = require('./pricing');
const money = require('./money');

const PAGE_W = 595; // A4 in pt
const PAGE_H = 842;
const LEFT = 56;
const TOP = 780;
const LINE_H = 13;
const LINES_PER_PAGE = 54;
const WIDTH = 78; // chars per line in courier 10

function pad(s, n, right) {
  s = String(s);
  if (s.length > n) return s.slice(0, n);
  var fill = new Array(n - s.length + 1).join(' ');
  return right ? fill + s : s + fill;
}

function dateDe(s) {
  if (!s) return '';
  var p = String(s).slice(0, 10).split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}

function qty(n) {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

// invoices before 2022 were written with the decimal column only, print them like back then
function rateFor(inv) {
  if ((inv.tax_rate === null || inv.tax_rate === undefined) || (inv.issue_date && inv.issue_date < '2022-01-01' && inv.legacy_tax_rate !== null)) {
    return Math.round(inv.legacy_tax_rate * 100);
  }
  return inv.tax_rate;
}

// totals are computed from the items again, so the pdf always matches its positions
function totals(inv) {
  var sum = pricing.sumItems(inv.items);
  var discount = inv.discount_percent ? sum * inv.discount_percent / 100 : 0;
  var net = sum - discount;
  var gross = money.round2(pricing.gross(net, rateFor(inv)));
  return { sum: money.round2(sum), discount: money.round2(discount), net: money.round2(net), tax: money.round2(gross - money.round2(net)), gross: gross };
}

function invoiceLines(inv, account) {
  account = account || {};
  var c = inv.customer || {};
  var lines = [];
  var rate = rateFor(inv);

  lines.push(account.name || '');
  lines.push([account.street, [account.zip, account.city].join(' ').trim()].filter(Boolean).join(', '));
  lines.push('');
  lines.push('');
  lines.push(c.name || '');
  if (c.contact_name) lines.push(c.contact_name);
  if (c.street) lines.push(c.street);
  lines.push([c.zip, c.city].filter(Boolean).join(' '));
  lines.push('');
  lines.push('');
  lines.push(pad('RECHNUNG ' + (inv.number || '(Entwurf)'), 50) + pad('Datum: ' + dateDe(inv.issue_date), 28, true));
  if (inv.due_date) lines.push(pad('', 50) + pad('Fällig: ' + dateDe(inv.due_date), 28, true));
  if (c.vat_id) lines.push(pad('', 50) + pad('USt-IdNr.: ' + c.vat_id, 28, true));
  lines.push('');
  lines.push(pad('Pos', 4) + pad('Beschreibung', 40) + pad('Menge', 8, true) + pad('Einzel', 13, true) + pad('Summe', 13, true));
  lines.push(new Array(WIDTH + 1).join('-'));

  (inv.items || []).forEach(function (it, i) {
    var desc = String(it.description || '');
    var first = true;
    while (first || desc.length) {
      var part = desc.slice(0, 39);
      desc = desc.slice(39);
      if (first) {
        lines.push(pad(i + 1, 4) + pad(part, 40) + pad(qty(it.quantity), 8, true) +
          pad(money.formatEuro(it.unit_price), 13, true) +
          pad(money.formatEuro(pricing.lineTotal(it.quantity, it.unit_price)), 13, true));
      } else {
        lines.push(pad('', 4) + part);
      }
      first = false;
    }
  });

  var t = totals(inv);
  lines.push(new Array(WIDTH + 1).join('-'));
  if (t.discount) {
    lines.push(pad('Zwischensumme', 65, true) + pad(money.formatEuro(t.sum), 13, true));
    lines.push(pad('Rabatt ' + String(inv.discount_percent).replace('.', ',') + ' %', 65, true) + pad(money.formatEuro(-t.discount), 13, true));
  }
  lines.push(pad('Netto', 65, true) + pad(money.formatEuro(t.net), 13, true));
  lines.push(pad('USt. ' + rate + ' %', 65, true) + pad(money.formatEuro(t.tax), 13, true));
  lines.push(pad('Gesamt', 65, true) + pad(money.formatEuro(t.gross), 13, true));
  lines.push('');
  if (rate === 0) {
    lines.push('Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).');
  }
  lines.push('');
  if (inv.due_date) {
    lines.push('Bitte überweisen Sie den Betrag bis zum ' + dateDe(inv.due_date) + '.');
  }
  if (account.iban) lines.push('IBAN: ' + account.iban);
  if (account.tax_number) lines.push('Steuernummer: ' + account.tax_number);
  return lines;
}

// second layout (flag NEW_PDF_LAYOUT): sender line above the address window, info block on
// the right, gross per position. not finished: footer (bank, tax number) and reverse charge
// text are still missing, so the flag stays off until that is done
function invoiceLinesNew(inv, account) {
  account = account || {};
  var c = inv.customer || {};
  var rate = rateFor(inv);
  var lines = [];
  var sender = [account.name, account.street, [account.zip, account.city].join(' ').trim()].filter(Boolean).join(' · ');

  lines.push(pad(account.name || '', 50) + pad('RECHNUNG', 28, true));
  lines.push('');
  lines.push(sender.length > WIDTH ? sender.slice(0, WIDTH) : sender);
  lines.push(new Array(sender.length > WIDTH ? WIDTH + 1 : sender.length + 1).join('-'));
  var info = [
    'Nummer:  ' + (inv.number || '(Entwurf)'),
    'Datum:   ' + dateDe(inv.issue_date),
    inv.due_date ? 'Fällig:  ' + dateDe(inv.due_date) : '',
    c.vat_id ? 'USt-Id:  ' + c.vat_id : ''
  ].filter(Boolean);
  var address = [c.name, c.contact_name, c.street, [c.zip, c.city].filter(Boolean).join(' '), c.country].filter(Boolean);
  for (var i = 0; i < Math.max(info.length, address.length); i++) {
    lines.push(pad(address[i] || '', 48) + pad(info[i] || '', 30));
  }
  lines.push('');
  lines.push('');
  lines.push(pad('Pos', 4) + pad('Beschreibung', 34) + pad('Menge', 7, true) + pad('Netto', 11, true) + pad('USt.', 9, true) + pad('Brutto', 13, true));
  lines.push(new Array(WIDTH + 1).join('='));
  (inv.items || []).forEach(function (it, n) {
    var lineNet = pricing.lineTotal(it.quantity, it.unit_price);
    var lineGross = money.round2(pricing.gross(lineNet, rate));
    lines.push(pad(n + 1, 4) + pad(it.description || '', 34) + pad(qty(it.quantity), 7, true) +
      pad(money.formatEuro(lineNet), 11, true) + pad(rate + ' %', 9, true) + pad(money.formatEuro(lineGross), 13, true));
    var rest = String(it.description || '').slice(34);
    while (rest.length) {
      lines.push(pad('', 4) + rest.slice(0, 34));
      rest = rest.slice(34);
    }
  });
  var t = totals(inv);
  lines.push(new Array(WIDTH + 1).join('='));
  if (t.discount) lines.push(pad('Rabatt ' + String(inv.discount_percent).replace('.', ',') + ' %', 65, true) + pad(money.formatEuro(-t.discount), 13, true));
  lines.push(pad('Summe netto', 65, true) + pad(money.formatEuro(t.net), 13, true));
  lines.push(pad('zzgl. USt. ' + rate + ' %', 65, true) + pad(money.formatEuro(t.tax), 13, true));
  lines.push(pad('Rechnungsbetrag', 65, true) + pad(money.formatEuro(t.gross), 13, true));
  lines.push('');
  if (inv.due_date) lines.push('Zahlbar ohne Abzug bis ' + dateDe(inv.due_date) + '.');
  // TODO footer: bank, tax number, reverse charge (see invoiceLines)
  return lines;
}

// statement of account for a customer (services/customers.statement), same courier lines
function statementLines(st, account) {
  account = account || {};
  var c = st.customer || {};
  var lines = [];
  lines.push(account.name || '');
  lines.push([account.street, [account.zip, account.city].join(' ').trim()].filter(Boolean).join(', '));
  lines.push('');
  lines.push('');
  lines.push(c.name || '');
  if (c.contact_name) lines.push(c.contact_name);
  if (c.street) lines.push(c.street);
  lines.push([c.zip, c.city].filter(Boolean).join(' '));
  lines.push('');
  lines.push('');
  lines.push(pad('KONTOAUSZUG', 40) + pad(dateDe(st.from) + ' bis ' + dateDe(st.to), 38, true));
  lines.push('');
  lines.push(pad('Datum', 11) + pad('Buchung', 37) + pad('Soll', 10, true) + pad('Haben', 10, true) + pad('Saldo', 10, true));
  lines.push(new Array(WIDTH + 1).join('-'));
  lines.push(pad('', 11) + pad('Saldovortrag', 37) + pad('', 20) + pad(money.formatEuro(st.opening_balance).replace(' €', ''), 10, true));
  st.lines.forEach(function (l) {
    lines.push(pad(dateDe(l.date), 11) + pad(l.text, 37) +
      pad(l.debit ? money.formatEuro(l.debit).replace(' €', '') : '', 10, true) +
      pad(l.credit ? money.formatEuro(l.credit).replace(' €', '') : '', 10, true) +
      pad(money.formatEuro(l.balance).replace(' €', ''), 10, true));
  });
  lines.push(new Array(WIDTH + 1).join('-'));
  lines.push(pad('Summe', 48) + pad(money.formatEuro(st.debit).replace(' €', ''), 10, true) + pad(money.formatEuro(st.credit).replace(' €', ''), 10, true));
  lines.push(pad(st.closing_balance > 0 ? 'Offener Betrag' : 'Saldo', 68, true) + pad(money.formatEuro(st.closing_balance), 10, true));
  lines.push('');
  lines.push('Alle Beträge in Euro.');
  if (st.closing_balance > 0 && account.iban) lines.push('Bitte überweisen Sie den offenen Betrag auf IBAN ' + account.iban + '.');
  return lines;
}

function linesFor(inv, account, layout) {
  return layout === 'new' ? invoiceLinesNew(inv, account) : invoiceLines(inv, account);
}

// pdf strings: latin1 + WinAnsi euro sign, escape \ ( )
function pdfString(s) {
  return '(' + String(s)
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    .replace(/€/g, '\x80')
    .replace(/[^\x00-\xff]/g, '?') + ')';
}

function pageStream(lines, first) {
  var out = ['BT'];
  var y = TOP;
  lines.forEach(function (line, i) {
    if (first && i === 0) {
      out.push('/F2 14 Tf');
    } else if (first && i === 1) {
      out.push('/F1 10 Tf');
    }
    if (!first && i === 0) out.push('/F1 10 Tf');
    out.push('1 0 0 1 ' + LEFT + ' ' + y + ' Tm');
    out.push(pdfString(line) + ' Tj');
    y -= (first && i === 0) ? LINE_H + 4 : LINE_H;
  });
  out.push('ET');
  return out.join('\n');
}

function render(lines) {
  var pages = [];
  for (var i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }
  if (!pages.length) pages.push([]);

  // object numbers: 1 catalog, 2 pages, 3 font courier, 4 font helvetica bold, then page + content pairs
  var objects = [];
  var kids = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach(function (pageLines, p) {
    var pageNo = 5 + p * 2;
    var contentNo = pageNo + 1;
    var stream = pageStream(pageLines, p === 0);
    kids.push(pageNo + ' 0 R');
    objects[pageNo] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + '] ' +
      '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentNo + ' 0 R >>';
    objects[contentNo] = '<< /Length ' + Buffer.byteLength(stream, 'latin1') + ' >>\nstream\n' + stream + '\nendstream';
  });
  objects[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>';

  var out = '%PDF-1.4\n';
  var offsets = [];
  for (var n = 1; n < objects.length; n++) {
    offsets[n] = Buffer.byteLength(out, 'latin1');
    out += n + ' 0 obj\n' + objects[n] + '\nendobj\n';
  }
  var xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (var k = 1; k < objects.length; k++) {
    out += pad(offsets[k], 10, true).replace(/ /g, '0') + ' 00000 n \n';
  }
  out += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}

function invoicePdf(inv, account, layout) {
  return render(linesFor(inv, account, layout));
}

module.exports = {
  invoicePdf: invoicePdf,
  invoiceLines: invoiceLines,
  invoiceLinesNew: invoiceLinesNew,
  statementLines: statementLines,
  linesFor: linesFor,
  totals: totals,
  rateFor: rateFor,
  render: render
};
