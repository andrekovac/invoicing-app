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

// totals are computed from the items again, so the pdf always matches its positions
function totals(inv) {
  var net = pricing.sumItems(inv.items);
  var gross = money.round2(pricing.gross(net, inv.vat_rate * 100));
  return { net: money.round2(net), tax: money.round2(gross - net), gross: gross };
}

function invoiceLines(inv, account) {
  account = account || {};
  var c = inv.customer || {};
  var lines = [];
  var rate = Math.round(inv.vat_rate * 100);

  lines.push(account.name || '');
  lines.push([account.street, [account.zip, account.city].join(' ').trim()].filter(Boolean).join(', '));
  lines.push('');
  lines.push('');
  lines.push(c.name || '');
  if (c.street) lines.push(c.street);
  lines.push([c.zip, c.city].filter(Boolean).join(' '));
  lines.push('');
  lines.push('');
  lines.push(pad('RECHNUNG ' + (inv.number || '(Entwurf)'), 50) + pad('Datum: ' + dateDe(inv.issue_date), 28, true));
  if (inv.due_date) lines.push(pad('', 50) + pad('Fällig: ' + dateDe(inv.due_date), 28, true));
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
  lines.push(pad('Netto', 65, true) + pad(money.formatEuro(t.net), 13, true));
  lines.push(pad('USt. ' + rate + ' %', 65, true) + pad(money.formatEuro(t.tax), 13, true));
  lines.push(pad('Gesamt', 65, true) + pad(money.formatEuro(t.gross), 13, true));
  lines.push('');
  lines.push('');
  if (inv.due_date) {
    lines.push('Bitte überweisen Sie den Betrag bis zum ' + dateDe(inv.due_date) + '.');
  }
  if (account.iban) lines.push('IBAN: ' + account.iban);
  if (account.tax_number) lines.push('Steuernummer: ' + account.tax_number);
  return lines;
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

function invoicePdf(inv, account) {
  return render(invoiceLines(inv, account));
}

module.exports = { invoicePdf: invoicePdf, invoiceLines: invoiceLines, totals: totals, render: render };
