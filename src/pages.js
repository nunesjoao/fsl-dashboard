// Telas de login e de configuração inicial (servidas pelo Worker, sem depender dos assets)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shell(title, inner) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · Shipments FSL</title>
<style>
:root{--bg:#f4f5f7;--surface:#fff;--border:#dfe3e8;--ink:#141a22;--ink2:#4a5563;--accent:#0E2841;--accent-ink:#fff;--danger:#b42318;--focus:#0f9ed5;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0f1318;--surface:#171c23;--border:#2a313b;--ink:#e9edf2;--ink2:#aab3bf;--accent:#6ea8ff;--accent-ink:#0b1220;--danger:#ff7b72;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
main{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:28px 24px}
h1{font-size:20px;margin:0 0 4px}p.sub{margin:0 0 20px;color:var(--ink2);font-size:14px}
label{display:block;font-size:13px;color:var(--ink2);margin-top:14px}
input{width:100%;margin-top:4px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit}
input:focus-visible,button:focus-visible{outline:2px solid var(--focus);outline-offset:1px}
button{width:100%;margin-top:22px;padding:10px;border:0;border-radius:8px;background:var(--accent);color:var(--accent-ink);font:inherit;font-weight:600;cursor:pointer}
.err{margin-top:14px;padding:9px 11px;border-radius:8px;border:1px solid var(--danger);color:var(--danger);font-size:14px}
.ok{margin-top:14px;padding:9px 11px;border-radius:8px;border:1px solid var(--border);font-size:14px}
.hint{font-size:12px;color:var(--ink2);margin-top:4px}
</style></head><body><main>${inner}</main></body></html>`;
}

export function loginPage({ error = '', email = '', next = '/', info = '' } = {}) {
  return shell('Entrar', `
<h1>Shipments FSL</h1><p class="sub">Entre com seu e-mail e senha.</p>
${info ? `<div class="ok">${esc(info)}</div>` : ''}
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
<form method="post" action="/login" autocomplete="on">
  <input type="hidden" name="next" value="${esc(next)}">
  <label>E-mail<input name="email" type="email" required autocomplete="username" value="${esc(email)}" autofocus></label>
  <label>Senha<input name="password" type="password" required autocomplete="current-password"></label>
  <button type="submit">Entrar</button>
</form>
<p class="hint" style="margin-top:16px">Esqueceu a senha? Peça ao administrador para redefinir.</p>`);
}

export function setupPage({ error = '', email = '', name = '', disabled = false, envNames = [] } = {}) {
  if (disabled) return shell('Configuração', `
<h1>Configuração inicial</h1>
<div class="err">O código de configuração (ADMIN_SETUP_CODE) não chegou ao Worker.
Defina-o em <b>Settings → Variables and Secrets</b> (não em <i>Build</i>) como <i>Secret</i>, clique em <b>Deploy</b> e recarregue esta página.</div>
<p class="hint" style="margin-top:14px">Variáveis que o Worker está recebendo agora:
<b>${envNames.length ? envNames.map(esc).join(', ') : 'nenhuma'}</b></p>`);
  return shell('Configuração', `
<h1>Configuração inicial</h1><p class="sub">Crie a conta do administrador. Esta tela só funciona enquanto não houver nenhum usuário cadastrado.</p>
${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
<form method="post" action="/setup">
  <label>Código de configuração<input name="code" type="password" required autocomplete="off"></label>
  <div class="hint">O valor que você definiu em ADMIN_SETUP_CODE no painel da Cloudflare.</div>
  <label>Nome<input name="name" required value="${esc(name)}" autocomplete="name"></label>
  <label>E-mail<input name="email" type="email" required value="${esc(email)}" autocomplete="username"></label>
  <label>Senha<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
  <label>Confirmar senha<input name="password2" type="password" required minlength="8" autocomplete="new-password"></label>
  <button type="submit">Criar administrador</button>
</form>`);
}
