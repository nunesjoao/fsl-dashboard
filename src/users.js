import { json } from './http.js';
import {
  getUser, putUser, deleteUser, listUserEmails, publicUser, hashPassword, verifyPassword,
  normEmail, validEmail, passwordProblem, clearFailures
} from './auth.js';

const requireAdmin = user => user.role === 'admin' ? null : json({ error: 'Somente administradores.' }, 403);
async function body(request) { try { return await request.json(); } catch { return null; } }

// GET /api/users — lista (admin)
export async function list({ env, data }) {
  const deny = requireAdmin(data.user); if (deny) return deny;
  const emails = await listUserEmails(env);
  const users = (await Promise.all(emails.map(e => getUser(env, e)))).filter(Boolean).map(publicUser);
  users.sort((a, b) => a.email.localeCompare(b.email));
  return json({ users });
}

// POST /api/users — cria (admin)
export async function create({ request, env, data }) {
  const deny = requireAdmin(data.user); if (deny) return deny;
  const b = await body(request); if (!b) return json({ error: 'JSON inválido.' }, 400);
  const email = normEmail(b.email);
  if (!validEmail(email)) return json({ error: 'E-mail inválido.' }, 400);
  const p = passwordProblem(b.password); if (p) return json({ error: p }, 400);
  if (await getUser(env, email)) return json({ error: 'Já existe um usuário com esse e-mail.' }, 409);
  const u = { email, name: String(b.name || '').slice(0, 100), role: b.role === 'admin' ? 'admin' : 'user', ...(await hashPassword(b.password)), ver: 0, createdAt: new Date().toISOString(), createdBy: data.user.email };
  await putUser(env, u);
  return json({ ok: true, user: publicUser(u) }, 201);
}

// PATCH /api/users — altera nome, perfil ou redefine senha (admin)
export async function update({ request, env, data }) {
  const deny = requireAdmin(data.user); if (deny) return deny;
  const b = await body(request); if (!b) return json({ error: 'JSON inválido.' }, 400);
  const u = await getUser(env, b.email); if (!u) return json({ error: 'Usuário não encontrado.' }, 404);
  if (b.name != null) u.name = String(b.name).slice(0, 100);
  if (b.role != null) {
    const role = b.role === 'admin' ? 'admin' : 'user';
    if (u.role === 'admin' && role !== 'admin' && !(await otherAdminExists(env, u.email))) return json({ error: 'É preciso manter pelo menos um administrador.' }, 400);
    u.role = role;
  }
  if (b.password != null) {
    const p = passwordProblem(b.password); if (p) return json({ error: p }, 400);
    Object.assign(u, await hashPassword(b.password)); u.ver = (u.ver || 0) + 1;   // derruba sessões abertas
    await clearFailures(env, u.email);
  }
  await putUser(env, u);
  return json({ ok: true, user: publicUser(u) });
}

// DELETE /api/users?email= (admin)
export async function remove({ request, env, data }) {
  const deny = requireAdmin(data.user); if (deny) return deny;
  const email = normEmail(new URL(request.url).searchParams.get('email'));
  if (email === data.user.email) return json({ error: 'Você não pode remover a própria conta.' }, 400);
  const u = await getUser(env, email); if (!u) return json({ error: 'Usuário não encontrado.' }, 404);
  await deleteUser(env, email);
  await env.DASH_KV.delete('layout:' + email);
  return json({ ok: true });
}

// POST /api/password — troca a própria senha
export async function changePassword({ request, env, data }) {
  const b = await body(request); if (!b) return json({ error: 'JSON inválido.' }, 400);
  const u = await getUser(env, data.user.email); if (!u) return json({ error: 'Usuário não encontrado.' }, 404);
  if (!(await verifyPassword(String(b.current || ''), u))) return json({ error: 'Senha atual incorreta.' }, 400);
  const p = passwordProblem(b.password); if (p) return json({ error: p }, 400);
  Object.assign(u, await hashPassword(b.password)); u.ver = (u.ver || 0) + 1;
  await putUser(env, u);
  return json({ ok: true, relogin: true });
}

async function otherAdminExists(env, exceptEmail) {
  for (const e of await listUserEmails(env)) {
    if (e === exceptEmail) continue;
    const u = await getUser(env, e); if (u && u.role === 'admin') return true;
  }
  return false;
}
