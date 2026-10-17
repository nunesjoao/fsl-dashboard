# Shipments FSL — Dashboard

Dashboard estático (HTML + JavaScript, sem servidor) para GitHub Pages. A fonte de dados é sempre a planilha
`OFICIAL_Shipments_2026` (aba **Data**). A leitura é feita no navegador com SheetJS e os gráficos usam Chart.js.

## Publicar no GitHub Pages

1. Crie um repositório (ex.: `fsl-dashboard`) e envie o conteúdo desta pasta para a branch `main`
   (pelo site: *Add file → Upload files*, arrastando todos os arquivos e pastas).
2. Em **Settings → Pages**: *Source* = `Deploy from a branch`, *Branch* = `main` / `(root)` → **Save**.
3. Em 1–2 minutos o site fica em `https://<usuario>.github.io/fsl-dashboard/`.

## Atualizar os dados

Há duas formas, que podem ser usadas juntas:

| Forma | Como | Quem vê |
|---|---|---|
| **Importar no navegador** (padrão) | Botão *Importar planilha* ou arrastar o `.xlsx` para a página | Só quem importou, naquele navegador (fica salvo até ser removido em *Configurações*) |
| **Publicar no repositório** | Colocar a planilha em `data/shipments.xlsx` e fazer commit | Todos que abrirem o site e não tiverem importado outra planilha |

> ⚠️ No GitHub Pages gratuito o repositório e o site são **públicos**. Qualquer planilha em `data/` fica acessível
> para qualquer pessoa. Para dados internos, use só a importação no navegador, ou um repositório privado com
> GitHub Pages de acesso restrito (GitHub Enterprise).

A planilha nova precisa manter os **mesmos nomes de coluna** no cabeçalho (a ordem pode mudar).
Se o arquivo vier sem os valores calculados das fórmulas, o dashboard recalcula
`FSL Processing Time`, `Customer pickup time`, `Total Delivery time` e `Mês` a partir das datas e horas.
Textos com maiúsculas/minúsculas diferentes (`ws` / `WS`) são agrupados juntos, como na tabela dinâmica do Excel.

## Gráficos e personalização

O layout inicial reproduz os três gráficos da aba *Graphs*:

| Gráfico | Filtros | Barras | Linha (eixo secundário) |
|---|---|---|---|
| Average Time of Deliveries | Ship To Party Name = OMN; Priority ≠ AOG | nº de pedidos | média de `Total Delivery time` (dias) |
| Average Time of Deliveries (AOG) | Ship To Party Name = OMN; Priority = AOG | nº de pedidos | média de `Total Delivery time` (h:mm) |
| Total USD of Deliveries | Priority não vazia | nº de pedidos | soma de `Total Shipment Value` (milhões USD) |

No site, cada gráfico tem **Editar / Duplicar / Tabela / PNG**, e **+ Gráfico** cria novos. No editor é possível escolher:
coluna de agrupamento, até 4 séries (contagem, soma, média, mediana, mín., máx., contagem distinta), unidade
(dias, horas, h:mm, USD, milhões USD, BRL convertido, % do total), barra ou linha, eixo principal ou secundário, cor,
rótulos, ordenação, Top N com “Outros”, barras horizontais e filtros por qualquer coluna. **Filtros globais** valem para todos
os gráficos e indicadores. Os cards podem ser reordenados arrastando pelo ícone ⠿.

### Publicar o layout para todos
As personalizações ficam salvas no navegador de quem as fez. Para torná-las o padrão do site:
*Configurações → Exportar layout (JSON)* e substitua `config/dashboard.json` no repositório.
Quem já tinha personalizações locais verá um aviso para adotar o layout publicado.

## Login e dados na nuvem (Cloudflare Pages + Access)

Hospedado no Cloudflare Pages com o Cloudflare Access na frente, o dashboard passa a ter:

- **Login obrigatório** antes de carregar qualquer página (código enviado por e-mail ou conta Google), só para os e-mails autorizados;
- **Layout por usuário**: cada pessoa vê as próprias personalizações em qualquer computador;
- **Planilha compartilhada**: a última planilha importada fica salva na nuvem e vale para toda a equipe
  (a versão anterior é guardada e pode ser restaurada em *Configurações*).

O mesmo código continua funcionando no GitHub Pages, no modo local e sem login. O app detecta sozinho em qual ambiente está.

### Arquitetura

```
navegador ──► Cloudflare Access (login) ──► Cloudflare Pages
                                             ├── arquivos estáticos (index.html, assets/…)
                                             └── functions/api/*  ──► KV "DASH_KV"
                                                  ├── layout:<email>   layout de cada usuário
                                                  ├── sheet:current    planilha atual (.xlsx)
                                                  └── sheet:previous   versão anterior
```

Cada chamada a `/api/*` confere no servidor o token do Access (`Cf-Access-Jwt-Assertion`):
assinatura RS256 com as chaves públicas do time, AUD da aplicação, emissor e validade.
Sem token válido a API responde 401, e não há como acessá-la sem passar pelo login.

### Hospedagem como Worker (workers.dev) — configuração atual

O projeto também roda como **Cloudflare Worker** com arquivos estáticos (`wrangler.jsonc` + `worker/index.js`),
que é o que o botão *Create* do painel cria hoje. O deploy é automático a cada push na `main` (Workers Builds).

1. **Criar o KV.** Vá em *Storage & Databases → KV → Create*, dê o nome `fsl-dashboard` e copie o **ID** do namespace.
   Coloque o ID em `wrangler.jsonc`, no bloco `kv_namespaces`, com o binding `DASH_KV`.
2. **Ativar o Access.** No Worker, abra *Settings → Domains & Routes*. Na linha `workers.dev`, ative **Cloudflare Access**.
   - Depois clique em *Manage Cloudflare Access* e, na policy, inclua os e-mails autorizados.
   - Desative os *Preview URLs*, ou proteja-os também.
3. **Configurar as variáveis.** Em *Settings → Variables and Secrets*, crie:
   - `ACCESS_TEAM_DOMAIN` (ex.: `fslteam.cloudflareaccess.com`)
   - `ACCESS_AUD` (o *AUD tag* da aplicação criada no Access)

   O `keep_vars: true` em `wrangler.jsonc` evita que o deploy apague essas variáveis.

### Passo a passo — alternativa com Cloudflare Pages

1. **Criar o projeto Pages.** No painel da Cloudflare, abra *Workers & Pages → Create → Pages → Connect to Git* e escolha `nunesjoao/fsl-dashboard`.
   - *Framework preset*: `None`. *Build command*: vazio. *Build output directory*: `/`.
   - Clique em **Deploy**. O site fica em `https://fsl-dashboard.pages.dev` (ou no nome que a Cloudflare atribuir).
2. **Criar o KV.** Abra *Storage & Databases → KV → Create* e dê o nome `fsl-dashboard`.
   - No projeto Pages, vá em *Settings → Bindings → Add → KV namespace*.
   - Nome da variável: **`DASH_KV`**. Namespace: `fsl-dashboard`. Faça isso em *Production* e também em *Preview*.
3. **Ativar o Zero Trust.** Abra *Zero Trust* no menu lateral, escolha um *team name* (ex.: `fslteam` → `fslteam.cloudflareaccess.com`) e o plano **Free**, que vale para até 50 usuários. A Cloudflare pode pedir um cartão mesmo no plano gratuito.
4. **Proteger o site.** Em *Zero Trust → Access → Applications → Add an application → Self-hosted*:
   - *Application domain*: `fsl-dashboard.pages.dev`. Adicione também `*.fsl-dashboard.pages.dev` para proteger os previews.
   - *Policy*: **Allow**, com *Include → Emails* (lista de e-mails autorizados) ou *Emails ending in* (`@suaempresa.com`).
   - *Login methods*: **One-time PIN** (código por e-mail; não precisa de cadastro). Opcionalmente, Google.
   - Depois de salvar, copie o **Application Audience (AUD) Tag**, que aparece na aba *Overview* / *Basic information* da aplicação.
5. **Configurar as variáveis.** No projeto Pages, abra *Settings → Variables and Secrets* (Production e Preview):
   - `ACCESS_TEAM_DOMAIN` = `fslteam.cloudflareaccess.com`
   - `ACCESS_AUD` = o AUD Tag copiado no passo anterior
6. Em *Deployments*, clique em **Retry deployment** (ou faça um commit qualquer) para as variáveis entrarem em vigor.
7. **Desativar o GitHub Pages.** No GitHub, vá em *Settings → Pages → Unpublish*. Agora o repositório pode voltar a ser **privado**: o Cloudflare Pages lê repositórios privados.

Para dar acesso a mais alguém, inclua o e-mail na policy do Access; não é preciso mexer no código.
Para tirar o acesso de alguém, remova o e-mail da policy. O link **Sair** encerra a sessão do Access.

### Limites do plano gratuito

| Recurso | Limite | Uso esperado |
|---|---|---|
| Access (Zero Trust Free) | 50 usuários | equipe |
| KV — gravações | 1.000/dia | 1 por importação + 1 a cada edição de layout (agrupadas a cada ~1 s) |
| KV — leituras | 100.000/dia | ~3 por abertura do dashboard |
| KV — tamanho por valor | 25 MiB | planilha limitada a 20 MB no app |
| Pages Functions | 100.000 requisições/dia | só `/api/*` passa pelas Functions (`_routes.json`) |

### Teste local

```bash
npx wrangler pages dev . --kv DASH_KV --binding DEV_USER=voce@exemplo.com
```

`DEV_USER` simula o usuário logado, e o servidor só aceita isso quando o endereço é `localhost`.
Nunca defina `DEV_USER` no projeto publicado.

## Estrutura

```
index.html            página
assets/app.js         leitura da planilha, agregação, gráficos, editor
assets/style.css      estilos (tema claro/escuro)
config/dashboard.json layout padrão publicado
data/                 (opcional) shipments.xlsx publicado
functions/_lib/auth.js   verificação do token do Cloudflare Access
functions/api/*.js       API: /api/me, /api/layout, /api/sheet
_routes.json             limita as Functions a /api/*
```

Dependências via CDN (jsDelivr): `xlsx@0.18.5`, `chart.js@4.4.1`, `chartjs-plugin-datalabels@2.2.0`.
A cotação USD→BRL é buscada em economia.awesomeapi.com.br; pode ser fixada em *Configurações*.

Teste local: `python3 -m http.server` na pasta e abra `http://localhost:8000`.
