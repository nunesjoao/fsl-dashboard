export class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });

export const html = (body, status = 200, headers = {}) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'x-frame-options': 'DENY', 'referrer-policy': 'same-origin', ...headers
    }
  });

export const redirect = (location, headers = {}) =>
  new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store', ...headers } });

// Só aceita "next" relativo ao próprio site (evita redirecionamento aberto)
export function safeNext(n) {
  if (typeof n !== 'string' || !n.startsWith('/') || n.startsWith('//') || n.startsWith('/\\')) return '/';
  if (n.startsWith('/login') || n.startsWith('/setup') || n.startsWith('/logout')) return '/';
  return n;
}

// Requisições que alteram dados precisam vir do próprio site
export function sameOrigin(request, url) {
  const o = request.headers.get('Origin');
  return !o || o === url.origin;
}
