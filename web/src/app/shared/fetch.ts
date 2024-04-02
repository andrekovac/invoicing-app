// for the newer pages: plain fetch, no service class. the cookie does the login.
// errors come back in different shapes from the api ({error}, {message}, {errors: []}),
// this turns all of them into one message
export class ApiError extends Error {
  constructor(message: string, public status: number, public data: any) {
    super(message);
  }
}

export function errorText(data: any, status: number): string {
  if (!data) return 'Fehler ' + status;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.message === 'string') return data.message;
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map((e: any) => (e.field ? e.field + ': ' : '') + e.message).join(', ');
  }
  return 'Fehler ' + status;
}

export async function getJson<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401) {
    sessionStorage.removeItem('rechnungen.user');
    location.href = '/login';
  }
  if (!res.ok) throw new ApiError(errorText(data, res.status), res.status, data);
  return data as T;
}

export async function sendJson<T = any>(method: string, url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(errorText(data, res.status), res.status, data);
  return data as T;
}
