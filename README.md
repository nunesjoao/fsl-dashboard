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

## Login e dados na nuvem (Cloudflare Workers, plano gratuito)

Publicado como **Cloudflare Worker** (`fsl-dashboard.<conta>.workers.dev`), o dashboard tem:

- **Login próprio com e-mail e senha.** Nenhuma página ou arquivo é servido sem sessão válida.
- **Layout por usuário.** Cada pessoa vê as próprias personalizações em qualquer computador.
- **Planilha compartilhada.** A última planilha importada vale para toda a equipe; a versão anterior fica guardada e pode ser restaurada em *Configurações*.
- **Gestão de usuários pelo administrador**, na tela *Usuários*. Cada pessoa troca a própria senha em *Senha*.

O mesmo código continua funcionando no GitHub Pages, no modo local e sem login.

### Segurança

- Senhas com hash PBKDF2-SHA256 (100 mil iterações, salt aleatório), guardadas no KV.
- Sessão em cookie `HttpOnly` / `Secure` / `SameSite=Lax`, válida por 7 dias. O botão *Sair* encerra a sessão no servidor.
- Trocar ou redefinir uma senha derruba todas as sessões abertas daquele usuário.
- 5 tentativas erradas bloqueiam o login daquele e-mail por 15 minutos.
- Requisições que alteram dados precisam vir do próprio site (verificação de `Origin`).
- O código do servidor (`worker/`, `src/`, `wrangler.jsonc`) não é publicado como arquivo (`.assetsignore`).

### Configuração (uma vez só)

1. O Worker `fsl-dashboard` já está ligado a este repositório pelo *Workers Builds*: cada push na `main` faz o deploy.
   - Em *Settings → Build*, o *Build command* fica vazio e o *Deploy command* é `npx wrangler deploy`.
2. O KV `fsl-dashboard` já está vinculado como `DASH_KV` em `wrangler.jsonc`.
3. No Worker, abra *Settings → Runtime variables and secrets* (aba *Production*) → *Add variable*. Não use o bloco *Builds → Variables and secrets*, que só vale durante o build.
   - Tipo **Secret**, nome **`ADMIN_SETUP_CODE`**, valor: um código que só você conheça.
4. Abra o site. Ele mostra a tela de configuração inicial: informe o código, seu nome, e-mail e senha.
   - Essa tela só funciona enquanto não houver nenhum usuário.
   - Depois disso, o código pode ser apagado do painel.
5. Em *Domains*, desative a URL **Preview** e mantenha só a **Production**.
6. Desative o GitHub Pages (*Settings → Pages → Unpublish*). O repositório pode voltar a ser **privado**: o Workers Builds lê repositórios privados.

### Limites do plano gratuito

| Recurso | Limite | Uso esperado |
|---|---|---|
| Requisições ao Worker | 100.000/dia | ~15 por abertura do dashboard |
| KV — leituras | 100.000/dia | ~2 por requisição (sessão + usuário) |
| KV — gravações | 1.000/dia | login, importação de planilha, edições de layout (agrupadas a cada ~1 s) |
| KV — tamanho por valor | 25 MiB | planilha limitada a 20 MB no app |

### Teste local

```bash
echo "ADMIN_SETUP_CODE=teste" > .dev.vars
npx wrangler dev
```

## Estrutura

```
index.html            página
assets/app.js         leitura da planilha, agregação, gráficos, editor
assets/style.css      estilos (tema claro/escuro)
config/dashboard.json layout padrão publicado
data/                 (opcional) shipments.xlsx publicado
worker/index.js       Worker: login, sessão, arquivos estáticos e roteamento da API
src/auth.js           usuários, senhas (PBKDF2), sessões, bloqueio por tentativas
src/pages.js          telas de login e configuração inicial
src/users.js          API de usuários e troca de senha
src/layout.js         API do layout por usuário
src/sheet.js          API da planilha compartilhada (atual + anterior)
wrangler.jsonc        configuração do Worker (assets, KV)
```

Dependências via CDN (jsDelivr): `xlsx@0.18.5`, `chart.js@4.4.1`, `chartjs-plugin-datalabels@2.2.0`.
A cotação USD→BRL é buscada em economia.awesomeapi.com.br; pode ser fixada em *Configurações*.

Teste local: `python3 -m http.server` na pasta e abra `http://localhost:8000`.
