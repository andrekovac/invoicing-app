// csv for the desktop export (semicolon, "quotes", CRLF, BOM) and for exports later
const SEP = ';';

function parse(text, sep) {
  sep = sep || SEP;
  text = String(text || '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.length > 1 || r[0] !== '');
}

// first row = header -> array of objects
function toObjects(rows) {
  const head = rows[0] || [];
  return rows.slice(1).map(r => {
    const o = {};
    head.forEach((h, i) => { o[h.trim()] = r[i] === undefined ? '' : r[i].trim(); });
    return o;
  });
}

function field(v, sep) {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.indexOf(sep || SEP) !== -1 || s.indexOf('"') !== -1 || /[\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function stringify(rows, sep) {
  return rows.map(r => r.map(v => field(v, sep)).join(sep || SEP)).join('\r\n') + '\r\n';
}

// "07.06.2021" -> "2021-06-07"
function deDate(s) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
}

module.exports = { parse, toObjects, stringify, field, deDate, SEP };
