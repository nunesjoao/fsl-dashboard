// Verificação do token do Cloudflare Access (JWT RS256) — executa no servidor (Pages Functions)
// Variáveis de ambiente necessárias (Pages → Settings → Variables):
//   ACCESS_TEAM_DOMAIN  ex.: minhaequipe.cloudflareaccess.com
//   ACCESS_AUD          "Application Audience (AUD) Tag" da aplicação no Access
// Somente para teste local (wrangler pages dev em localhost): DEV_USER=email@exemplo.com

let certCache = { at: 0, keys: null, domain: null };

const b64urlToBytes = s => {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlJSON = s => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKeys(domain) {
  const now = Date.now();
  if (certCache.keys && certCache.domain === domain && now - certCache.at < 3600_000) return certCache.keys;
  const r = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('certs ' + r.status);
  const j = await r.json();
  certCache = { at: now, keys: j.keys || [], domain };
  return certCache.keys;
}

function readToken(request) {
  const h = request.headers.get('Cf-Access-Jwt-Assertion');
  if (h) return h;
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('Cookie') || '');
  return m ? m[1] : null;
}

export async function authenticate(request, env) {
  const url = new URL(request.url);
  if (env.DEV_USER && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    return { email: String(env.DEV_USER).toLowerCase(), dev: true };
  }
  const domain = env.ACCESS_TEAM_DOMAIN, aud = env.ACCESS_AUD;
  if (!domain || !aud) throw new HttpError(500, 'Servidor sem ACCESS_TEAM_DOMAIN/ACCESS_AUD configurados.');
  const token = readToken(request);
  if (!token) throw new HttpError(401, 'Sem sessão do Cloudflare Access.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Token inválido.');
  const header = b64urlJSON(parts[0]);
  const payload = b64urlJSON(parts[1]);
  if (header.alg !== 'RS256') throw new HttpError(401, 'Algoritmo não suportado.');

  let keys = await getKeys(domain);
  let jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) { certCache.keys = null; keys = await getKeys(domain); jwk = keys.find(k => k.kid === header.kid); }
  if (!jwk) throw new HttpError(401, 'Chave do token desconhecida.');

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new HttpError(401, 'Assinatura inválida.');

  const now = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw new HttpError(401, 'Token de outra aplicação.');
  if (payload.exp && payload.exp < now) throw new HttpError(401, 'Sessão expirada.');
  if (payload.iss && payload.iss !== `https://${domain}`) throw new HttpError(401, 'Emissor inválido.');
  if (!payload.email) throw new HttpError(401, 'Token sem e-mail.');
  return { email: String(payload.email).toLowerCase() };
}

export class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
