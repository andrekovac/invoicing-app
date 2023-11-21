// invoice numbers: RE-YYYY-NNNN, counted per account and year (see services/invoices.nextNumber)
const PREFIX = 'RE';
const PATTERN = /^RE-(\d{4})-(\d{4,})$/;

function pad(n, len) {
  let s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
}

function format(year, seq) {
  return PREFIX + '-' + year + '-' + pad(seq, 4);
}

function isValid(number) {
  const m = PATTERN.exec(String(number || ''));
  if (!m) return false;
  const year = Number(m[1]);
  return year >= 2000 && year <= 2099 && Number(m[2]) > 0;
}

// { year: 2021, seq: 87 } or null
function parse(number) {
  if (!isValid(number)) return null;
  const m = PATTERN.exec(number);
  return { year: Number(m[1]), seq: Number(m[2]) };
}

// what people type into the search or copy from a bank statement:
// "re-2021-87", " RE 2021 0087 ", "2021-0087" (number of the old desktop program)
function normalize(input) {
  const s = String(input || '').trim().toUpperCase().replace(/[\s_/]+/g, '-');
  let m = /^(?:RE-?)?(\d{4})-(\d{1,6})$/.exec(s);
  if (!m) m = /^RE(\d{4})(\d{4})$/.exec(s);
  if (!m) return s;
  return format(m[1], Number(m[2]));
}

// number after `last` in `year`; last can be null (first invoice of the year)
function next(last, year) {
  const p = last ? parse(last) : null;
  if (p && String(p.year) === String(year)) return format(year, p.seq + 1);
  return format(year, 1);
}

// missing numbers per year. the tax office (GoBD) wants numbers without gaps,
// so this goes into the yearly check. numbers in another format are ignored
//   gaps(['RE-2023-0001', 'RE-2023-0004']) -> [{ year: 2023, missing: ['RE-2023-0002', 'RE-2023-0003'] }]
function gaps(numbers, opts) {
  opts = opts || {};
  const max = opts.max || 500;
  const byYear = {};
  (numbers || []).forEach(function (n) {
    const p = parse(n);
    if (!p) return;
    (byYear[p.year] = byYear[p.year] || []).push(p.seq);
  });
  return Object.keys(byYear).sort().map(function (year) {
    const seqs = byYear[year].sort(function (a, b) { return a - b; });
    const missing = [];
    const duplicates = [];
    let expected = opts.fromOne === false ? seqs[0] : 1;
    for (let i = 0; i < seqs.length; i++) {
      if (i > 0 && seqs[i] === seqs[i - 1]) {
        duplicates.push(format(year, seqs[i]));
        continue;
      }
      for (let s = expected; s < seqs[i] && missing.length < max; s++) missing.push(format(year, s));
      expected = seqs[i] + 1;
    }
    return { year: Number(year), first: format(year, seqs[0]), last: format(year, seqs[seqs.length - 1]), count: seqs.length, missing: missing, duplicates: duplicates };
  });
}

module.exports = { PREFIX, PATTERN, format, isValid, parse, normalize, next, gaps };
