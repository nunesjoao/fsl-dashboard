// Worker do dashboard: login próprio + arquivos estáticos + API.
// Toda requisição passa por aqui (run_worker_first: true). Sem sessão válida, nada do site é servido.
import { HttpError, json, html, redirect, safeNext, sameOrigin } from '../src/http.js';
import {
  currentUser, createSession, destroySession, getUser, putUser, hasUsers, verifyPassword, dummyVerify,
  hashPassword, isLocked, recordFailure, clearFailures, normEmail, validEmail, passwordProblem
} from '../src/auth.js';
import { loginPage, setupPage } from '../src/pages.js';
import * as layout from '../src/layout.js';
import * as sheet from '../src/sheet.js';
import * as users from '../src/users.js';

const API = {
  'GET /api/me': ({ data }) => json({ email: data.user.email, name: data.user.name, role: data.user.role, logoutUrl: '/logout' }),
  'GET /api/layout': layout.onRequestGet,
  'PUT /api/layout': layout.onRequestPut,
  'DELETE /api/layout': layout.onRequestDelete,
  'GET /api/sheet': sheet.onRequestGet,
  'PUT /api/sheet': sheet.onRequestPut,
  'POST /api/sheet': sheet.onRequestPost,
  'GET /api/users': users.list,
  'POST /api/users': users.create,
  'PATCH /api/users': users.update,
  'DELETE /api/users': users.remove,
  'POST /api/password': users.changePassword
};

async function form(request) {
  try { const f = await request.formData(); return Object.fromEntries([...f].map(([k, v]) => [k, String(v)])); }
  catch { return {}; }
}

async function handleLogin(request, env, url) {
  if (request.method === 'GET') {
    if (!(await hasUsers(env))) return redirect('/setup');
    if (await currentUser(env, request)) return redirect(safeNext(url.searchParams.get('next')));
    return html(loginPage({ next: safeNext(url.searchParams.get('next')), info: url.searchParams.get('bye') ? 'Você saiu.' : '' }));
  }
  if (request.method !== 'POST' || !sameOrigin(request, url)) return html('Requisição inválida', 400);
  const f = await form(request);
  const email = normEmail(f.email), next = safeNext(f.next);
  if (await isLocked(env, email)) return html(loginPage({ email, next, error: 'Muitas tentativas erradas. Aguarde 15 minutos ou peça ao administrador para redefinir a senha.' }), 429);
  const u = await getUser(env, email);
  const ok = u ? await verifyPassword(f.password || '', u) : (await dummyVerify(f.password), false);
  if (!ok) {
    if (u) await recordFailure(env, email);
    return html(loginPage({ email, next, error: 'E-mail ou senha incorretos.' }), 401);
  }
  await clearFailures(env, email);
  u.lastLogin = new Date().toISOString(); await putUser(env, u);
  return redirect(next, { 'set-cookie': await createSession(env, request, u) });
}

async function handleSetup(request, env, url) {
  if (await hasUsers(env)) return redirect('/login');
  // aceita variações no nome (espaços, minúsculas) e ignora espaços no valor
  const key = Object.keys(env).find(k => k.replace(/[^a-z]/gi, '').toUpperCase() === 'ADMINSETUPCODE');
  const code = key && typeof env[key] === 'string' ? env[key].trim() : '';
  if (!code) {
    const names = Object.keys(env).filter(k => typeof env[k] === 'string');   // só nomes de variáveis/secrets, nunca valores
    return html(setupPage({ disabled: true, envNames: names }), 503);
  }
  if (request.method === 'GET') return html(setupPage());
  if (request.method !== 'POST' || !sameOrigin(request, url)) return html('Requisição inválida', 400);
  const f = await form(request);
  const email = normEmail(f.email), name = String(f.name || '').trim().slice(0, 100);
  const back = error => html(setupPage({ error, email, name }), 400);
  if ((f.code || '').trim() !== code) { await new Promise(r => setTimeout(r, 800)); return back('Código de configuração incorreto.'); }
  if (!validEmail(email)) return back('E-mail inválido.');
  const p = passwordProblem(f.password); if (p) return back(p);
  if (f.password !== f.password2) return back('As senhas não conferem.');
  const u = { email, name, role: 'admin', ...(await hashPassword(f.password)), ver: 0, createdAt: new Date().toISOString(), lastLogin: new Date().toISOString() };
  await putUser(env, u);
  return redirect('/', { 'set-cookie': await createSession(env, request, u) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (!env.DASH_KV) throw new HttpError(500, 'Binding KV "DASH_KV" não configurado.');
      if (path === '/login') return await handleLogin(request, env, url);
      if (path === '/setup') return await handleSetup(request, env, url);
      if (path === '/logout') return redirect('/login?bye=1', { 'set-cookie': await destroySession(env, request) });

      const user = await currentUser(env, request);

      if (path.startsWith('/api/')) {
        if (!user) return json({ error: 'Sessão expirada. Entre novamente.' }, 401);
        if (request.method !== 'GET' && !sameOrigin(request, url)) return json({ error: 'Origem não permitida.' }, 403);
        const h = API[request.method.toUpperCase() + ' ' + path.replace(/\/+$/, '')];
        if (!h) return json({ error: 'Rota não encontrada.' }, 404);
        return await h({ request, env, data: { user } });
      }

      if (!user) {
        if (!(await hasUsers(env))) return redirect('/setup');
        return redirect('/login?next=' + encodeURIComponent(path + url.search));
      }
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set('cache-control', 'private, no-cache');
      out.headers.set('x-frame-options', 'DENY');
      return out;
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (path.startsWith('/api/')) return json({ error: e.message || 'Erro interno' }, status);
      return html(`<p style="font-family:system-ui;padding:24px">Erro: ${String(e.message || e).replace(/</g, '&lt;')}</p>`, status);
    }
  }
};
