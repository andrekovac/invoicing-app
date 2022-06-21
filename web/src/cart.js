// cart for the customer portal: which open invoices the customer wants to pay.
// plain js like session.js, kept per portal link in sessionStorage.
var PREFIX = 'rechnungen.cart.';

function key(token) {
  return PREFIX + String(token).slice(-16);
}

export function ids(token) {
  try {
    var raw = sessionStorage.getItem(key(token));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function save(token, list) {
  sessionStorage.setItem(key(token), JSON.stringify(list));
}

export function has(token, id) {
  return ids(token).indexOf(id) !== -1;
}

export function add(token, id) {
  var list = ids(token);
  if (list.indexOf(id) === -1) list.push(id);
  save(token, list);
  return list;
}

export function remove(token, id) {
  var list = ids(token).filter(function (x) { return x !== id; });
  save(token, list);
  return list;
}

export function toggle(token, id) {
  return has(token, id) ? remove(token, id) : add(token, id);
}

// drop ids that are not open any more (paid in the meantime)
export function sync(token, openInvoices) {
  var open = openInvoices.map(function (i) { return i.id; });
  var list = ids(token).filter(function (id) { return open.indexOf(id) !== -1; });
  save(token, list);
  return list;
}

// sum of the open amounts in the cart
export function total(token, openInvoices) {
  var list = ids(token);
  var sum = openInvoices.reduce(function (s, inv) {
    return list.indexOf(inv.id) !== -1 ? s + inv.open : s;
  }, 0);
  return Math.round(sum * 100) / 100;
}

export function clear(token) {
  sessionStorage.removeItem(key(token));
}
