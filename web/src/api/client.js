// small fetch wrapper, same as api() in the old admin page (api/legacy/admin-old/app.js).
// the cookie (rsid) does the login, nothing to add here.
import { clear } from '../session.js';

var BASE = '/api/v1';

export function api(method, url, body) {
  var opts = { method: method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return fetch(BASE + url, opts).then(function (res) {
    if (res.status === 204) return null;
    return res.json().then(function (data) {
      if (res.status === 401 && url !== '/auth/login') {
        clear();
        if (location.pathname.indexOf('/login') !== 0) location.href = '/login';
      }
      if (!res.ok) {
        var err = new Error(data.error || data.message || ('Fehler ' + res.status));
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    });
  });
}

export function get(url) { return api('GET', url); }
export function post(url, body) { return api('POST', url, body === undefined ? {} : body); }
export function put(url, body) { return api('PUT', url, body); }
export function del(url) { return api('DELETE', url); }

export function query(params) {
  var parts = [];
  Object.keys(params || {}).forEach(function (k) {
    if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    }
  });
  return parts.length ? '?' + parts.join('&') : '';
}
