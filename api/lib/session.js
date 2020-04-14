// session in a signed cookie, nothing stored on the server
// cookie value: base64url(json) + '.' + hmac
const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || 'rechnungen-dev-2020';
const COOKIE = 'rsid';
const MAX_AGE = 7 * 24 * 3600; // seconds

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function encode(data) {
  var body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return body + '.' + sign(body);
}

function decode(token) {
  if (!token || token.indexOf('.') === -1) return null;
  var parts = token.split('.');
  var expected = Buffer.from(sign(parts[0]));
  var given = Buffer.from(parts[1] || '');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    var data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function parseCookies(header) {
  var out = {};
  (header || '').split(';').forEach(function (part) {
    var i = part.indexOf('=');
    if (i === -1) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function middleware(req, res, next) {
  req.session = decode(parseCookies(req.headers.cookie)[COOKIE]);
  next();
}

function set(res, data) {
  data.exp = Date.now() + MAX_AGE * 1000;
  res.setHeader('Set-Cookie', COOKIE + '=' + encode(data) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + MAX_AGE);
}

function clear(res) {
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

module.exports = { middleware: middleware, set: set, clear: clear, encode: encode, decode: decode, COOKIE: COOKIE };
