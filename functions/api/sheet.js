import { json } from '../_lib/auth.js';

// Planilha compartilhada pela equipe: a última importada vale para todos.
// sheet:current = arquivo .xlsx atual; sheet:previous = versão anterior (para restaurar)
const MAX = 20 * 1024 * 1024; // KV aceita até 25 MiB por valor
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function fileResponse(buf, meta) {
  return new Response(buf, {
    headers: {
      'content-type': XLSX_TYPE,
      'cache-control': 'no-store',
      'x-sheet-meta': encodeURIComponent(JSON.stringify(meta || {}))
    }
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const which = url.searchParams.get('version') === 'previous' ? 'sheet:previous' : 'sheet:current';
  if (url.searchParams.get('meta') === '1') {
    const { keys } = await env.DASH_KV.list({ prefix: 'sheet:' });
    const m = Object.fromEntries(keys.map(k => [k.name, k.metadata || {}]));
    return json({ current: m['sheet:current'] || null, previous: m['sheet:previous'] || null });
  }
  const { value, metadata } = await env.DASH_KV.getWithMetadata(which, 'arrayBuffer');
  if (!value) return json({ error: 'Nenhuma planilha salva.' }, 404);
  return fileResponse(value, metadata);
}

export async function onRequestPut({ request, env, data }) {
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return json({ error: 'Arquivo vazio.' }, 400);
  if (buf.byteLength > MAX) return json({ error: 'Arquivo maior que 20 MB.' }, 413);
  const sig = new Uint8Array(buf.slice(0, 4));
  const isZip = sig[0] === 0x50 && sig[1] === 0x4b;                 // .xlsx/.xlsm
  const isOle = sig[0] === 0xd0 && sig[1] === 0xcf;                 // .xls antigo
  if (!isZip && !isOle) return json({ error: 'O arquivo não parece ser uma planilha Excel.' }, 415);

  let name = request.headers.get('x-file-name') || 'planilha.xlsx';
  try { name = decodeURIComponent(name); } catch {}
  const meta = {
    name: name.slice(0, 200),
    size: buf.byteLength,
    rows: Number(request.headers.get('x-rows')) || null,
    uploadedBy: data.user.email,
    uploadedAt: new Date().toISOString()
  };

  // guarda a versão atual como "anterior" antes de substituir
  const cur = await env.DASH_KV.getWithMetadata('sheet:current', 'arrayBuffer');
  if (cur.value) await env.DASH_KV.put('sheet:previous', cur.value, { metadata: cur.metadata });
  await env.DASH_KV.put('sheet:current', buf, { metadata: meta });
  return json({ ok: true, meta });
}

// Restaura a versão anterior (troca current <-> previous)
export async function onRequestPost({ request, env, data }) {
  const url = new URL(request.url);
  if (url.searchParams.get('action') !== 'restore') return json({ error: 'Ação inválida.' }, 400);
  const [cur, prev] = await Promise.all([
    env.DASH_KV.getWithMetadata('sheet:current', 'arrayBuffer'),
    env.DASH_KV.getWithMetadata('sheet:previous', 'arrayBuffer')
  ]);
  if (!prev.value) return json({ error: 'Não há versão anterior.' }, 404);
  const meta = { ...(prev.metadata || {}), restoredBy: data.user.email, restoredAt: new Date().toISOString() };
  await env.DASH_KV.put('sheet:current', prev.value, { metadata: meta });
  if (cur.value) await env.DASH_KV.put('sheet:previous', cur.value, { metadata: cur.metadata });
  return json({ ok: true, meta });
}
