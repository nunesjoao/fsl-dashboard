import { authenticate, HttpError, json } from '../_lib/auth.js';

// Toda rota /api/* exige usuário autenticado pelo Cloudflare Access
export async function onRequest(context) {
  try {
    if (!context.env.DASH_KV) throw new HttpError(500, 'Binding KV "DASH_KV" não configurado no projeto Pages.');
    context.data.user = await authenticate(context.request, context.env);
    return await context.next();
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e.message || 'Erro interno' }, status);
  }
}
