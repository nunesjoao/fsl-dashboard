// Entrada para Cloudflare Workers (workers.dev / Workers Builds).
// Serve os arquivos estáticos via binding ASSETS e encaminha /api/* para os mesmos
// handlers usados no Cloudflare Pages (pasta functions/).
import { authenticate, HttpError, json } from '../functions/_lib/auth.js';
import * as me from '../functions/api/me.js';
import * as layout from '../functions/api/layout.js';
import * as sheet from '../functions/api/sheet.js';

const routes = { '/api/me': me, '/api/layout': layout, '/api/sheet': sheet };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const mod = routes[url.pathname.replace(/\/+$/, '')];
    if (!mod) return json({ error: 'Rota não encontrada.' }, 404);
    const m = request.method.toUpperCase();
    const handler = mod['onRequest' + m[0] + m.slice(1).toLowerCase()];
    if (!handler) return json({ error: 'Método não permitido.' }, 405);

    try {
      if (!env.DASH_KV) throw new HttpError(500, 'Binding KV "DASH_KV" não configurado.');
      const data = { user: await authenticate(request, env) };
      return await handler({ request, env, data });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      return json({ error: e.message || 'Erro interno' }, status);
    }
  }
};
