// money helpers. amounts are plain euros (numbers), formatted the german way

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

// unit prices are stored with cents only. Number.EPSILON so 1.005 becomes 1.01 and not 1.00
function roundPrice(n) {
  var x = Number(n);
  if (isNaN(x)) return x;
  return Math.round((x + (x < 0 ? -Number.EPSILON : Number.EPSILON)) * 100) / 100;
}

function formatEuro(n) {
  if (n === null || n === undefined || isNaN(n)) return '';
  var neg = n < 0;
  var parts = Math.abs(round2(n)).toFixed(2).split('.');
  var int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + int + ',' + parts[1] + ' €';
}

// "1.234,56 €" -> 1234.56, "12,5" -> 12.5, "12.50" -> 12.5
function parseEuro(str) {
  if (typeof str === 'number') return str;
  if (str === null || str === undefined) return NaN;
  var s = String(str).replace(/€|EUR/gi, '').replace(/\s/g, '');
  if (s === '') return NaN;
  if (s.indexOf(',') !== -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return parseFloat(s);
}

module.exports = { round2: round2, roundPrice: roundPrice, formatEuro: formatEuro, parseEuro: parseEuro };
