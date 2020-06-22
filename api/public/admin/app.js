/* admin page, plain js, no build step */
(function () {
  'use strict';

  var API = '/api/v1';
  var STATUS = { draft: 'Entwurf', issued: 'Gestellt', paid: 'Bezahlt', cancelled: 'Storniert' };

  var state = {
    invoice: null,
    customers: [],
    customer: null,
    user: null
  };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function euro(n) {
    if (n === null || n === undefined || isNaN(n)) return '';
    var parts = (Math.round(n * 100) / 100).toFixed(2).split('.');
    return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + parts[1] + ' €';
  }

  function dateDe(s) {
    if (!s) return '';
    var p = s.slice(0, 10).split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  function api(method, url, body) {
    var opts = { method: method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(API + url, opts).then(function (res) {
      if (res.status === 204) return null;
      return res.json().then(function (data) {
        if (res.status === 401 && url !== '/auth/login') {
          state.user = null;
          show('login');
        }
        if (!res.ok) {
          var err = new Error(data.error || ('Fehler ' + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  var msgTimer = null;
  function message(text, isError) {
    var el = $('msg');
    el.textContent = text;
    el.className = 'msg' + (isError ? ' error' : '');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () { el.className = 'msg hidden'; }, 4000);
  }

  function fail(err) {
    message(err.message || String(err), true);
  }

  function show(view) {
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) views[i].classList.add('hidden');
    $('view-' + view).classList.remove('hidden');
  }

  // ---------- invoices ----------

  function loadInvoices() {
    var q = $('inv-q').value.trim();
    var status = $('inv-status').value;
    var params = [];
    if (q) params.push('q=' + encodeURIComponent(q));
    if (status) params.push('status=' + status);
    api('GET', '/invoices' + (params.length ? '?' + params.join('&') : '')).then(function (rows) {
      $('inv-rows').innerHTML = rows.map(function (inv) {
        return '<tr data-id="' + inv.id + '">' +
          '<td>' + esc(inv.number || '(Entwurf)') + '</td>' +
          '<td>' + esc(inv.customer_name) + '</td>' +
          '<td>' + dateDe(inv.issue_date) + '</td>' +
          '<td>' + dateDe(inv.due_date) + '</td>' +
          '<td><span class="status status-' + inv.status + '">' + STATUS[inv.status] + '</span></td>' +
          '<td class="num">' + euro(inv.total_gross) + '</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="6">Keine Rechnungen</td></tr>';
    }).catch(fail);
  }

  function loadCustomerOptions() {
    return api('GET', '/customers').then(function (rows) {
      state.customers = rows;
      $('inv-customer').innerHTML = rows.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
      }).join('');
    });
  }

  function itemRow(it) {
    return '<tr>' +
      '<td><input class="desc" value="' + esc(it.description) + '"></td>' +
      '<td><input class="qty" value="' + esc(String(it.quantity).replace('.', ',')) + '"></td>' +
      '<td><input class="price" value="' + esc(euro(it.unit_price).replace(' €', '')) + '"></td>' +
      '<td class="num line"></td>' +
      '<td><button type="button" class="danger del">x</button></td>' +
      '</tr>';
  }

  function num(s) {
    s = String(s).replace(/\s|€/g, '');
    if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s);
  }

  function readItems() {
    var rows = $('item-rows').querySelectorAll('tr');
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      items.push({
        description: r.querySelector('.desc').value,
        quantity: num(r.querySelector('.qty').value),
        unit_price: num(r.querySelector('.price').value)
      });
    }
    return items;
  }

  function readInvoiceForm() {
    var f = $('inv-form');
    return {
      customer_id: Number(f.customer_id.value),
      vat_rate: Number(f.vat_rate.value),
      issue_date: f.issue_date.value || null,
      due_date: f.due_date.value || null,
      items: readItems()
    };
  }

  var previewTimer = null;
  function updateTotals() {
    var items = readItems();
    var rows = $('item-rows').querySelectorAll('tr');
    items.forEach(function (it, i) {
      rows[i].querySelector('.line').textContent = isNaN(it.quantity * it.unit_price) ? '' : euro(it.quantity * it.unit_price);
    });
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      var valid = items.filter(function (it) { return it.description && !isNaN(it.quantity) && !isNaN(it.unit_price); });
      api('POST', '/invoices/preview', { vat_rate: Number($('inv-form').vat_rate.value), items: valid }).then(function (t) {
        $('t-net').textContent = euro(t.total_net);
        $('t-tax').textContent = euro(t.total_tax);
        $('t-gross').textContent = euro(t.total_gross);
      }).catch(function () { /* ignore while typing */ });
    }, 250);
  }

  function fillInvoice(inv) {
    state.invoice = inv;
    var f = $('inv-form');
    var isDraft = !inv.id || inv.status === 'draft';
    $('inv-title').textContent = inv.id ? ('Rechnung ' + (inv.number || '(Entwurf)') + ' - ' + STATUS[inv.status]) : 'Neue Rechnung';
    f.customer_id.value = inv.customer_id || (state.customers[0] && state.customers[0].id) || '';
    f.vat_rate.value = String(inv.vat_rate === undefined ? 0.19 : inv.vat_rate);
    f.issue_date.value = inv.issue_date || '';
    f.due_date.value = inv.due_date || '';
    var items = inv.items && inv.items.length ? inv.items : [{ description: '', quantity: 1, unit_price: 0 }];
    $('item-rows').innerHTML = items.map(itemRow).join('');

    var inputs = f.querySelectorAll('input, select');
    for (var i = 0; i < inputs.length; i++) inputs[i].disabled = !isDraft;
    $('item-add').classList.toggle('hidden', !isDraft);
    $('inv-save').classList.toggle('hidden', !isDraft);
    $('inv-issue').classList.toggle('hidden', !inv.id || inv.status !== 'draft');
    $('inv-paid').classList.toggle('hidden', inv.status !== 'issued');
    $('inv-cancel').classList.toggle('hidden', !inv.id || inv.status === 'cancelled' || inv.status === 'draft');
    $('inv-delete').classList.toggle('hidden', !inv.id || inv.status !== 'draft');
    $('inv-pdf').classList.toggle('hidden', !inv.id);
    if (inv.id) $('inv-pdf').href = API + '/invoices/' + inv.id + '/pdf';
    updateTotals();
  }

  function openInvoice(id) {
    show('invoice');
    loadCustomerOptions().then(function () {
      if (id === 'new') return fillInvoice({ status: 'draft', items: [] });
      return api('GET', '/invoices/' + id).then(fillInvoice);
    }).catch(fail);
  }

  function saveInvoice(e) {
    e.preventDefault();
    var data = readInvoiceForm();
    var inv = state.invoice;
    var p = inv && inv.id ? api('PUT', '/invoices/' + inv.id, data) : api('POST', '/invoices', data);
    p.then(function (saved) {
      message('Gespeichert');
      if (!inv || !inv.id) location.hash = '#/invoices/' + saved.id;
      else fillInvoice(saved);
    }).catch(fail);
  }

  function invoiceAction(action, confirmText) {
    return function () {
      if (confirmText && !confirm(confirmText)) return;
      api('POST', '/invoices/' + state.invoice.id + '/' + action).then(function (inv) {
        message('OK');
        fillInvoice(inv);
      }).catch(fail);
    };
  }

  function deleteInvoice() {
    if (!confirm('Entwurf wirklich löschen?')) return;
    api('DELETE', '/invoices/' + state.invoice.id).then(function () {
      message('Gelöscht');
      location.hash = '#/invoices';
    }).catch(fail);
  }

  // ---------- customers ----------

  var CUST_FIELDS = ['name', 'contact_name', 'street', 'zip', 'city', 'email', 'phone', 'vat_id'];

  function loadCustomers() {
    var q = $('cust-q').value.trim();
    api('GET', '/customers' + (q ? '?q=' + encodeURIComponent(q) : '')).then(function (rows) {
      $('cust-rows').innerHTML = rows.map(function (c) {
        return '<tr data-id="' + c.id + '"><td>' + esc(c.name) + '</td><td>' + esc(c.city) + '</td><td>' + esc(c.email) + '</td></tr>';
      }).join('') || '<tr><td colspan="3">Keine Kunden</td></tr>';
    }).catch(fail);
  }

  function fillCustomer(c) {
    state.customer = c;
    var f = $('cust-form');
    $('cust-title').textContent = c.id ? c.name : 'Neuer Kunde';
    CUST_FIELDS.forEach(function (k) {
      if (f[k]) f[k].value = c[k] || '';
    });
    $('cust-delete').classList.toggle('hidden', !c.id);
  }

  function openCustomer(id) {
    show('customer');
    if (id === 'new') return fillCustomer({});
    api('GET', '/customers/' + id).then(fillCustomer).catch(fail);
  }

  function saveCustomer(e) {
    e.preventDefault();
    var f = $('cust-form');
    var data = {};
    CUST_FIELDS.forEach(function (k) {
      if (f[k]) data[k] = f[k].value.trim();
    });
    var c = state.customer;
    var p = c && c.id ? api('PUT', '/customers/' + c.id, data) : api('POST', '/customers', data);
    p.then(function (saved) {
      message('Gespeichert');
      location.hash = '#/customers/' + saved.id;
      fillCustomer(saved);
    }).catch(fail);
  }

  function deleteCustomer() {
    if (!confirm('Kunde wirklich löschen?')) return;
    api('DELETE', '/customers/' + state.customer.id).then(function () {
      message('Gelöscht');
      location.hash = '#/customers';
    }).catch(fail);
  }

  // ---------- settings ----------

  var ACC_FIELDS = ['name', 'street', 'zip', 'city', 'iban', 'tax_number'];

  function openSettings() {
    show('settings');
    api('GET', '/admin/account').then(function (acc) {
      var f = $('acc-form');
      ACC_FIELDS.forEach(function (k) { f[k].value = acc[k] || ''; });
    }).catch(fail);
    loadUsers();
  }

  function loadUsers() {
    api('GET', '/admin/users').then(function (rows) {
      $('user-rows').innerHTML = rows.map(function (u) {
        return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td>' + esc(u.role) + '</td>' +
          '<td>' + (u.id === state.user.id ? '' : '<button type="button" class="danger" data-del="' + u.id + '">Löschen</button>') + '</td></tr>';
      }).join('');
    }).catch(fail);
  }

  function saveAccount(e) {
    e.preventDefault();
    var f = $('acc-form');
    var data = {};
    ACC_FIELDS.forEach(function (k) { data[k] = f[k].value.trim(); });
    api('PUT', '/admin/account', data).then(function () { message('Gespeichert'); }).catch(fail);
  }

  function addUser(e) {
    e.preventDefault();
    var f = $('user-form');
    api('POST', '/admin/users', { name: f.name.value, email: f.email.value, password: f.password.value, role: f.role.value })
      .then(function () {
        f.reset();
        message('Benutzer angelegt');
        loadUsers();
      }).catch(fail);
  }

  function deleteUser(e) {
    var id = e.target.getAttribute('data-del');
    if (!id || !confirm('Benutzer löschen?')) return;
    api('DELETE', '/admin/users/' + id).then(loadUsers).catch(fail);
  }

  // ---------- login ----------

  function login(e) {
    e.preventDefault();
    var f = $('login-form');
    api('POST', '/auth/login', { email: f.email.value, password: f.password.value }).then(function (user) {
      state.user = user;
      f.password.value = '';
      $('nav-settings').classList.toggle('hidden', user.role !== 'admin');
      route();
    }).catch(fail);
  }

  function logout(e) {
    e.preventDefault();
    api('POST', '/auth/logout').then(function () {
      state.user = null;
      show('login');
    }).catch(fail);
  }

  // ---------- routing ----------

  function route() {
    if (!state.user) return;
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'settings') return openSettings();
    if (parts[0] === 'customers' && parts[1]) return openCustomer(parts[1]);
    if (parts[0] === 'customers') { show('customers'); return loadCustomers(); }
    if (parts[0] === 'invoices' && parts[1]) return openInvoice(parts[1]);
    show('invoices');
    loadInvoices();
  }

  function rowClick(base) {
    return function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (tr) location.hash = '#/' + base + '/' + tr.getAttribute('data-id');
    };
  }

  var searchTimer = null;
  function debounce(fn) {
    return function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(fn, 300);
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('inv-rows').addEventListener('click', rowClick('invoices'));
    $('cust-rows').addEventListener('click', rowClick('customers'));
    $('inv-q').addEventListener('input', debounce(loadInvoices));
    $('inv-status').addEventListener('change', loadInvoices);
    $('cust-q').addEventListener('input', debounce(loadCustomers));
    $('inv-new').addEventListener('click', function () { location.hash = '#/invoices/new'; });
    $('cust-new').addEventListener('click', function () { location.hash = '#/customers/new'; });

    $('inv-form').addEventListener('submit', saveInvoice);
    $('inv-form').addEventListener('input', updateTotals);
    $('inv-form').addEventListener('change', updateTotals);
    $('item-add').addEventListener('click', function () {
      $('item-rows').insertAdjacentHTML('beforeend', itemRow({ description: '', quantity: 1, unit_price: 0 }));
    });
    $('item-rows').addEventListener('click', function (e) {
      if (e.target.classList.contains('del')) {
        e.target.closest('tr').remove();
        updateTotals();
      }
    });
    $('inv-issue').addEventListener('click', invoiceAction('issue', 'Rechnung jetzt stellen? Danach ist sie nicht mehr änderbar.'));
    $('inv-paid').addEventListener('click', invoiceAction('paid'));
    $('inv-cancel').addEventListener('click', invoiceAction('cancel', 'Rechnung stornieren?'));
    $('inv-delete').addEventListener('click', deleteInvoice);

    $('cust-form').addEventListener('submit', saveCustomer);
    $('cust-delete').addEventListener('click', deleteCustomer);

    $('login-form').addEventListener('submit', login);
    $('logout').addEventListener('click', logout);

    window.addEventListener('hashchange', route);
    $('acc-form').addEventListener('submit', saveAccount);
    $('user-form').addEventListener('submit', addUser);
    $('user-rows').addEventListener('click', deleteUser);

    api('GET', '/auth/me').then(function (user) {
      state.user = user;
      $('nav-settings').classList.toggle('hidden', user.role !== 'admin');
      route();
    }).catch(function () { show('login'); });
  });
})();
