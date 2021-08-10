// who is logged in. copied from the old admin page (state.user) and kept as plain js
// so the old admin and the new app read the same sessionStorage key.
var KEY = 'rechnungen.user';

export function getUser() {
  try {
    var raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function setUser(user) {
  if (!user) {
    sessionStorage.removeItem(KEY);
    return;
  }
  sessionStorage.setItem(KEY, JSON.stringify(user));
}

export function isLoggedIn() {
  return !!getUser();
}

export function isAdmin() {
  var u = getUser();
  return !!u && u.role === 'admin';
}

export function clear() {
  sessionStorage.removeItem(KEY);
}
