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

## Estrutura

```
index.html            página
assets/app.js         leitura da planilha, agregação, gráficos, editor
assets/style.css      estilos (tema claro/escuro)
config/dashboard.json layout padrão publicado
data/                 (opcional) shipments.xlsx publicado
```

Dependências via CDN (jsDelivr): `xlsx@0.18.5`, `chart.js@4.4.1`, `chartjs-plugin-datalabels@2.2.0`.
A cotação USD→BRL é buscada em economia.awesomeapi.com.br; pode ser fixada em *Configurações*.

Teste local: `python3 -m http.server` na pasta e abra `http://localhost:8000`.
