// shared setup for the http tests: in-memory db with demo data, server on a free port,
// a small fetch wrapper that keeps the session cookie per client
process.env.APP_DB_FILE = ':memory:';

const db = require('../db');

const USERS = {
  brandt: { email: 'jonas@agentur-brandt.example', password: 'rechnungen' },
  brandtUser: { email: 'buero@agentur-brandt.example', password: 'rechnungen' },
  albers: { email: 'anna@druckerei-albers.example', password: 'rechnungen' }
};

function startServer() {
  db.open();
  require('../seed/seed').seed();
  const app = require('../server');
  return new Promise(function (resolve) {
    const server = app.listen(0, function () {
      resolve({
        server: server,
        base: 'http://127.0.0.1:' + server.address().port,
        stop: function () {
          server.close();
          db.close();
        }
      });
    });
  });
}

// one client = one cookie jar
function client(base) {
  let cookie = '';
  async function call(method, url, body) {
    const opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    if (cookie) opts.headers.Cookie = cookie;
    const res = await fetch(base + url, opts);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.indexOf('json') !== -1 ? await res.json() : await res.text();
    return { status: res.status, body: data, headers: res.headers };
  }
  return {
    call: call,
    get: function (url) { return call('GET', url); },
    post: function (url, body) { return call('POST', url, body === undefined ? {} : body); },
    put: function (url, body) { return call('PUT', url, body); },
    del: function (url) { return call('DELETE', url); },
    login: async function (who) {
      const u = USERS[who] || who;
      const res = await call('POST', '/api/v1/auth/login', { email: u.email, password: u.password });
      if (res.status !== 200) throw new Error('login failed for ' + u.email + ': ' + res.status);
      return res.body;
    }
  };
}

module.exports = { startServer: startServer, client: client, USERS: USERS };
