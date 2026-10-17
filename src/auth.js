// Autenticação própria: usuários, senhas (PBKDF2) e sessões, tudo no KV "DASH_KV".
//   user:<email>     { email, name, role: 'admin'|'user', salt, hash, iter, ver, createdAt, lastLogin }
//   session:<id>     { email, ver, createdAt }               (expira sozinha em 7 dias)
//   fail:<email>     contador de tentativas erradas          (expira em 15 min)

const enc = new TextEncoder();
const ITER = 100000;                 // máximo aceito pelo PBKDF2 do Workers
const COOKIE = 'fsl_session';
export const SESSION_TTL = 7 * 86400;
const MAX_FAILS = 5, LOCK_TTL = 900;

const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export function randomHex(n = 32) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const normEmail = e => String(e || '').trim().toLowerCase();
export const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;
export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (pw.length > 200) return 'Senha muito longa.';
  return null;
}

async function pbkdf2(pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return b64(new Uint8Array(bits));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), hash: await pbkdf2(pw, salt, ITER), iter: ITER };
}
export async function verifyPassword(pw, user) {
  const h = await pbkdf2(pw, unb64(user.salt), user.iter || ITER);
  return safeEqual(h, user.hash);
}
// usado quando o e-mail não existe, para o tempo de resposta não revelar isso
export async function dummyVerify(pw) { await pbkdf2(pw || 'x', new Uint8Array(16), ITER); }

// ---------------------------------------------------------------- usuários
export const getUser = (env, email) => env.DASH_KV.get('user:' + normEmail(email), 'json');
export const putUser = (env, u) => env.DASH_KV.put('user:' + u.email, JSON.stringify(u));
export const deleteUser = (env, email) => env.DASH_KV.delete('user:' + normEmail(email));
export async function listUserEmails(env) {
  const out = []; let cursor;
  do {
    const r = await env.DASH_KV.list({ prefix: 'user:', cursor });
    out.push(...r.keys.map(k => k.name.slice(5)));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}
export async function hasUsers(env) {
  const r = await env.DASH_KV.list({ prefix: 'user:', limit: 1 });
  return r.keys.length > 0;
}
export const publicUser = u => ({ email: u.email, name: u.name || '', role: u.role || 'user', createdAt: u.createdAt || null, lastLogin: u.lastLogin || null });

// ---------------------------------------------------------------- tentativas
export async function isLocked(env, email) {
  return (Number(await env.DASH_KV.get('fail:' + email)) || 0) >= MAX_FAILS;
}
export async function recordFailure(env, email) {
  const n = (Number(await env.DASH_KV.get('fail:' + email)) || 0) + 1;
  await env.DASH_KV.put('fail:' + email, String(n), { expirationTtl: LOCK_TTL });
}
export const clearFailures = (env, email) => env.DASH_KV.delete('fail:' + email);

// ---------------------------------------------------------------- sessões
function readCookie(request) {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([0-9a-f]{64})(?:;|$)').exec(request.headers.get('Cookie') || '');
  return m ? m[1] : null;
}
function cookie(value, maxAge, secure) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
const isSecure = request => new URL(request.url).protocol === 'https:';

export async function createSession(env, request, user) {
  const id = randomHex(32);
  await env.DASH_KV.put('session:' + id, JSON.stringify({ email: user.email, ver: user.ver || 0, createdAt: Date.now() }), { expirationTtl: SESSION_TTL });
  return cookie(id, SESSION_TTL, isSecure(request));
}
export async function destroySession(env, request) {
  const id = readCookie(request);
  if (id) await env.DASH_KV.delete('session:' + id);
  return cookie('', 0, isSecure(request));
}
export async function currentUser(env, request) {
  const id = readCookie(request);
  if (!id) return null;
  const s = await env.DASH_KV.get('session:' + id, 'json');
  if (!s) return null;
  const u = await getUser(env, s.email);
  if (!u || (u.ver || 0) !== (s.ver || 0)) return null;   // senha trocada / usuário removido
  return { email: u.email, name: u.name || '', role: u.role || 'user' };
}
