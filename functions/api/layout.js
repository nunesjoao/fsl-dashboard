import { json } from '../_lib/auth.js';

// Layout (configuração dos gráficos) individual por usuário: chave layout:<email>
const MAX = 512 * 1024;
const key = user => 'layout:' + user.email;

export async function onRequestGet({ env, data }) {
  const v = await env.DASH_KV.get(key(data.user), 'json');
  if (!v) return json({ layout: null });
  return json(v);
}

export async function onRequestPut({ request, env, data }) {
  const txt = await request.text();
  if (txt.length > MAX) return json({ error: 'Layout muito grande.' }, 413);
  let layout;
  try { layout = JSON.parse(txt); } catch { return json({ error: 'JSON inválido.' }, 400); }
  if (!layout || !Array.isArray(layout.charts)) return json({ error: 'Layout sem "charts".' }, 400);
  const rec = { layout, updatedAt: new Date().toISOString() };
  await env.DASH_KV.put(key(data.user), JSON.stringify(rec));
  return json({ ok: true, updatedAt: rec.updatedAt });
}

export async function onRequestDelete({ env, data }) {
  await env.DASH_KV.delete(key(data.user));
  return json({ ok: true });
}
