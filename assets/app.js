/* Shipments FSL Dashboard — app estático (GitHub Pages)
 * Fonte de dados: planilha .xlsx (importada no navegador ou em data/shipments.xlsx)
 * Layout: config/dashboard.json (padrão publicado) + personalizações salvas no navegador
 */
(() => {
'use strict';

// ---------------------------------------------------------------- constantes
const LS_CFG = 'fslDash.config.v1';
const LS_THEME = 'fslDash.theme';
const IDB_NAME = 'fslDash', IDB_STORE = 'files', IDB_KEY = 'workbook';
const BLANK = '(vazio)';
const OTHERS = 'Outros';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LOCALE = 'pt-BR';
const PAGE = 50;

const AGGS = { count: 'Contagem de linhas', count_distinct: 'Contagem distinta', sum: 'Soma', avg: 'Média', median: 'Mediana', min: 'Mínimo', max: 'Máximo' };
const UNITS = {
  number: 'Número', days: 'Dias', hours: 'Horas (decimal)', hhmm: 'Horas (h:mm)',
  usd: 'USD', usd_m: 'Milhões de USD', brl: 'BRL (convertido de USD)', brl_m: 'Milhões de BRL (convertido)', pct: '% do total do gráfico'
};
const PALETTE = ['#0E2841','#E97132','#0F9ED5','#196B24','#A02B93','#4EA72E','#7B8594'];

// Layout padrão embutido (igual a config/dashboard.json) — usado se o JSON não puder ser lido
const EMBEDDED_DEFAULT = {
  version: 1, title: 'Shipments FSL 2026', sheet: 'Data', usdbrl: null, globalFilters: [],
  charts: [
    { id: 'avg-time-omni', title: 'Average Time of Deliveries - FSL 2026', subtitle: 'OMNI · Prioridades WS, URG, ROU, PAOG (sem AOG)', width: 'half', groupBy: 'Mês', sort: 'key', topN: 0, showLabels: true, horizontal: false,
      filters: [{ field: 'Ship To Party Name', mode: 'include', values: ['OMN'] }, { field: 'Priority', mode: 'exclude', values: ['AOG', BLANK] }],
      series: [
        { label: '#of orders', agg: 'count', field: null, unit: 'number', decimals: 0, type: 'bar', axis: 'left', color: '#0E2841', axisTitle: '# Orders' },
        { label: 'Average time (Days)', agg: 'avg', field: 'Total Delivery time', unit: 'days', decimals: 1, type: 'line', axis: 'right', color: '#E97132', axisTitle: 'Days' }] },
    { id: 'avg-time-omni-aog', title: 'Average Time of Deliveries - FSL 2026 (AOG)', subtitle: 'OMNI · Prioridade AOG', width: 'half', groupBy: 'Mês', sort: 'key', topN: 0, showLabels: true, horizontal: false,
      filters: [{ field: 'Ship To Party Name', mode: 'include', values: ['OMN'] }, { field: 'Priority', mode: 'include', values: ['AOG'] }],
      series: [
        { label: '#of orders', agg: 'count', field: null, unit: 'number', decimals: 0, type: 'bar', axis: 'left', color: '#0E2841', axisTitle: '# Orders' },
        { label: 'Average time (hours)', agg: 'avg', field: 'Total Delivery time', unit: 'hhmm', decimals: 0, type: 'line', axis: 'right', color: '#E97132', axisTitle: 'h:mm' }] },
    { id: 'total-usd', title: 'Total USD of Deliveries - FSL 2026', subtitle: 'Todos os clientes · todas as prioridades', width: 'full', groupBy: 'Mês', sort: 'key', topN: 0, showLabels: true, horizontal: false,
      filters: [{ field: 'Priority', mode: 'exclude', values: [BLANK] }],
      series: [
        { label: '#orders', agg: 'count', field: null, unit: 'number', decimals: 0, type: 'bar', axis: 'left', color: '#0E2841', axisTitle: '# Orders' },
        { label: 'Orders Value - USD', agg: 'sum', field: 'Total Shipment Value', unit: 'usd_m', decimals: 3, type: 'line', axis: 'right', color: '#E97132', axisTitle: 'Millions USD' }] },
    { id: 'avg-time-operator', title: 'Average Time by Operator - FSL 2026', subtitle: 'Todos os atendimentos · 8 operadoras com mais pedidos (demais em Outros)', width: 'full', groupBy: 'Ship To Party Name', sort: 'count', topN: 8, topBy: 'count', showLabels: true, horizontal: true,
      filters: [],
      series: [
        { label: 'Total Delivery time', agg: 'avg', field: 'Total Delivery time', unit: 'days', decimals: 1, type: 'bar', axis: 'left', color: '#0E2841', axisTitle: 'Days' },
        { label: 'FSL Processing Time', agg: 'avg', field: 'FSL Processing Time', unit: 'days', decimals: 1, type: 'bar', axis: 'left', color: '#0F9ED5', axisTitle: '' },
        { label: 'Customer pickup time', agg: 'avg', field: 'Customer pickup time', unit: 'days', decimals: 1, type: 'bar', axis: 'left', color: '#E97132', axisTitle: '' }] }
  ]
};

// ---------------------------------------------------------------- estado
const S = {
  cfg: null, repoCfg: null, repoHash: null,
  wb: null, meta: null, sheet: null,
  headers: [], rows: [], info: {}, distinctCache: {},
  charts: {}, preview: null,
  rate: null, rateSrc: '',
  dataPage: 0, dataQuery: '',
  edit: null, editIsNew: false, globalDraft: null
};

// ---------------------------------------------------------------- utilidades
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'c' + Math.random().toString(36).slice(2, 9);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }

function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

function idb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function idbDo(mode, fn) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, mode); const st = tx.objectStore(IDB_STORE);
      const r = fn(st); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error);
    });
  } catch { return null; }
}
const idbGet = () => idbDo('readonly', st => st.get(IDB_KEY));
const idbPut = v => idbDo('readwrite', st => st.put(v, IDB_KEY));
const idbDel = () => idbDo('readwrite', st => st.delete(IDB_KEY));

// Excel serial -> Date (UTC)
const xlDate = n => new Date(Math.round((n - 25569) * 86400000));
function fmtDateCell(n, withTime) {
  const d = xlDate(n); const p = x => String(x).padStart(2, '0');
  const s = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return withTime ? `${s} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : s;
}

// ---------------------------------------------------------------- formatação
const nf = {};
function fmtN(v, dec = 0) {
  if (!isNum(v)) return '–';
  const k = dec; nf[k] = nf[k] || new Intl.NumberFormat(LOCALE, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return nf[k].format(v);
}
function fmtHHMM(hours) {
  if (!isNum(hours)) return '–';
  const neg = hours < 0; let m = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(m / 60); m = m % 60;
  return (neg ? '-' : '') + h + ':' + String(m).padStart(2, '0');
}
// valor bruto (agregado) -> valor plotado
function toPlot(v, unit) {
  if (!isNum(v)) return null;
  switch (unit) {
    case 'hours': case 'hhmm': return v * 24;
    case 'usd_m': return v / 1e6;
    case 'brl': return S.rate ? v * S.rate : null;
    case 'brl_m': return S.rate ? v * S.rate / 1e6 : null;
    default: return v;
  }
}
// rótulo curto (eixo / data label)
function fmtShort(v, unit, dec) {
  if (!isNum(v)) return '';
  if (unit === 'hhmm') return fmtHHMM(v);
  if (unit === 'pct') return fmtN(v, dec) + '%';
  if (unit === 'usd') return 'US$ ' + fmtN(v, dec);
  if (unit === 'brl') return 'R$ ' + fmtN(v, dec);
  return fmtN(v, dec);
}
// rótulo completo (tooltip / tabela)
function fmtLong(v, unit, dec) {
  if (!isNum(v)) return '–';
  switch (unit) {
    case 'days': return fmtN(v, dec) + ' dias';
    case 'hours': return fmtN(v, dec) + ' h';
    case 'hhmm': return fmtHHMM(v) + ' h';
    case 'usd': return 'US$ ' + fmtN(v, dec);
    case 'usd_m': return 'US$ ' + fmtN(v, dec) + ' mi';
    case 'brl': return 'R$ ' + fmtN(v, dec);
    case 'brl_m': return 'R$ ' + fmtN(v, dec) + ' mi';
    case 'pct': return fmtN(v, dec) + '%';
    default: return fmtN(v, dec);
  }
}
function brlNote(v, unit) {
  if (!S.rate || !isNum(v)) return '';
  if (unit === 'usd') return '≈ R$ ' + fmtN(v * S.rate, 0);
  if (unit === 'usd_m') return '≈ R$ ' + fmtN(v * S.rate, 2) + ' mi';
  return '';
}

// ---------------------------------------------------------------- leitura da planilha
const normHeader = h => String(h ?? '').replace(/\s+/g, ' ').trim();
const isMonthField = f => /^(m[eê]s|month)$/i.test(f || '');

function guessSheet(wb) {
  if (wb.SheetNames.includes('Data')) return 'Data';
  let best = wb.SheetNames[0], bestN = -1;
  for (const n of wb.SheetNames) {
    const ref = wb.Sheets[n]['!ref']; if (!ref) continue;
    const r = XLSX.utils.decode_range(ref); const size = (r.e.r - r.s.r) * (r.e.c - r.s.c);
    if (size > bestN) { bestN = size; best = n; }
  }
  return best;
}

function parseSheet(name) {
  const ws = S.wb.Sheets[name];
  if (!ws) throw new Error(`Aba "${name}" não encontrada.`);
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
  let hi = aoa.findIndex((r, i) => i < 15 && r.filter(v => typeof v === 'string' && v.trim()).length >= 3);
  if (hi < 0) throw new Error('Não encontrei a linha de cabeçalho na aba "' + name + '".');
  const seen = {};
  const cols = aoa[hi].map((h, i) => {
    let n = normHeader(h); if (!n) return null;
    if (seen[n]) { seen[n]++; n = `${n} (${seen[n]})`; } else seen[n] = 1;
    return { i, n };
  }).filter(Boolean);
  const rows = [];
  for (let r = hi + 1; r < aoa.length; r++) {
    const a = aoa[r]; const o = {}; let any = false;
    for (const c of cols) {
      let v = a[c.i];
      if (typeof v === 'string') { v = v.trim(); if (v === '') v = null; }
      if (v != null) any = true;
      o[c.n] = v;
    }
    if (any) rows.push(o);
  }
  const headers = cols.map(c => c.n);
  canonicalizeCase(rows, headers);
  fixDerived(rows, headers);
  S.sheet = name; S.headers = headers; S.rows = rows; S.distinctCache = {};
  S.info = buildInfo(rows, headers);
}

// Agrupa textos ignorando maiúsculas/minúsculas (como a tabela dinâmica do Excel): 'ws' -> 'WS'
function canonicalizeCase(rows, headers) {
  for (const h of headers) {
    const cnt = new Map();
    for (const r of rows) { const v = r[h]; if (typeof v === 'string') { const k = v.toLowerCase(); const m = cnt.get(k) || new Map(); m.set(v, (m.get(v) || 0) + 1); cnt.set(k, m); } }
    const canon = new Map(); let needs = false;
    for (const [k, m] of cnt) { if (m.size > 1) needs = true; canon.set(k, [...m].sort((a, b) => b[1] - a[1])[0][0]); }
    if (!needs) continue;
    for (const r of rows) { const v = r[h]; if (typeof v === 'string') r[h] = canon.get(v.toLowerCase()); }
  }
}

// Recalcula colunas derivadas quando a planilha vier sem os valores das fórmulas
function fixDerived(rows, headers) {
  const H = n => headers.find(h => h.toLowerCase() === n.toLowerCase());
  const c = {
    cd: H('Created date'), ct: H('Created time'), cdt: H('Creation date & time'),
    ed: H('Status Execution Date'), et: H('Status Execution Time'), edt: H('Execution Date & Time'),
    fsl: H('FSL Processing Time'), pd: H('Pick up Date'), pt: H('Pick up Time'), pdt: H('Pickup date & Time'),
    cpt: H('Customer pickup time'), tot: H('Total Delivery time'), mes: H('Mês')
  };
  const frac = v => isNum(v) ? v % 1 : 0;
  for (const r of rows) {
    const cre = isNum(r[c.cdt]) ? r[c.cdt] : isNum(r[c.cd]) ? Math.floor(r[c.cd]) + frac(r[c.ct]) : null;
    const exe = isNum(r[c.edt]) ? r[c.edt] : isNum(r[c.ed]) ? Math.floor(r[c.ed]) + frac(r[c.et]) : null;
    const fsl = isNum(r[c.fsl]) ? r[c.fsl] : (cre != null && exe != null ? exe - cre : null);
    const pick = isNum(r[c.pdt]) ? r[c.pdt] : (isNum(r[c.pd]) && r[c.pd] > 1 ? Math.floor(r[c.pd]) + frac(r[c.pt]) : null);
    const cpt = isNum(r[c.cpt]) ? r[c.cpt] : (pick != null && exe != null ? pick - exe : null);
    if (c.fsl && !isNum(r[c.fsl]) && fsl != null) r[c.fsl] = fsl;
    if (c.cpt && !isNum(r[c.cpt]) && cpt != null) r[c.cpt] = cpt;
    if (c.tot) {
      if (!isNum(r[c.tot])) {
        // planilha: =IF(PickUpDate>0, FSL + CustomerPickup, "0")  -> texto "0" é ignorado nas médias
        r[c.tot] = (isNum(r[c.pd]) && r[c.pd] > 1 && fsl != null && cpt != null) ? fsl + cpt : null;
      }
    }
    const mesKey = c.mes || 'Mês';
    if (!isNum(r[mesKey]) && isNum(r[c.cd])) r[mesKey] = xlDate(r[c.cd]).getUTCMonth() + 1;
  }
  if (!c.mes && c.cd) headers.push('Mês');
}

function buildInfo(rows, headers) {
  const info = {};
  for (const h of headers) {
    let n = 0, num = 0, str = 0; const d = new Set();
    for (const r of rows) { const v = r[h]; if (v == null) continue; n++; if (isNum(v)) num++; else str++; if (d.size < 500) d.add(v); }
    const numeric = n > 0 && num / n >= 0.9;
    const isDate = numeric && /date|data/i.test(h) && rows.some(r => isNum(r[h]) && r[h] > 20000);
    const isTime = numeric && !isDate && /time|hora/i.test(h) && !/processing|delivery|pickup time$/i.test(h) && rows.every(r => !isNum(r[h]) || (r[h] >= 0 && r[h] < 1));
    info[h] = { n, numeric, isDate, isTime, distinct: d.size, categorical: !numeric || d.size <= 40 || isMonthField(h) };
  }
  return info;
}

const keyOf = (row, f) => { const v = row[f]; return v == null ? BLANK : String(v); };
function labelOf(key, field) {
  if (key === BLANK || key === OTHERS) return key;
  if (isMonthField(field)) { const n = +key; if (n >= 1 && n <= 12) return MONTHS[n - 1]; }
  const inf = S.info[field];
  if (inf && inf.isDate && isNum(+key)) return fmtDateCell(+key, false);
  return key;
}
function distinct(field) {
  if (S.distinctCache[field]) return S.distinctCache[field];
  const m = new Map();
  for (const r of S.rows) { const k = keyOf(r, field); m.set(k, (m.get(k) || 0) + 1); }
  const arr = [...m].map(([k, c]) => ({ k, c })).sort((a, b) => cmpKeys(a.k, b.k, field));
  return (S.distinctCache[field] = arr);
}
function cmpKeys(a, b, field) {
  if (a === b) return 0;
  if (a === BLANK || a === OTHERS) return 1; if (b === BLANK || b === OTHERS) return -1;
  const na = +a, nb = +b;
  if (!isNaN(na) && !isNaN(nb) && a !== '' && b !== '') return na - nb;
  return a.localeCompare(b, LOCALE, { sensitivity: 'base', numeric: true });
}

// ---------------------------------------------------------------- filtros e agregação
function activeFilters(filters) {
  return (filters || []).filter(f => f.field && f.values && f.values.length).map(f => ({ field: f.field, mode: f.mode, set: new Set(f.values.map(String)) }));
}
function pass(row, af) {
  for (const f of af) { const has = f.set.has(keyOf(row, f.field)); if (f.mode === 'exclude' ? has : !has) return false; }
  return true;
}
function filteredRows(filters) {
  const af = activeFilters([...(S.cfg.globalFilters || []), ...(filters || [])]);
  return af.length ? S.rows.filter(r => pass(r, af)) : S.rows;
}
function aggValue(rows, s) {
  if (s.agg === 'count') return rows.length;
  if (!s.field) return null;
  if (s.agg === 'count_distinct') { const d = new Set(); rows.forEach(r => { if (r[s.field] != null) d.add(r[s.field]); }); return d.size; }
  const v = []; for (const r of rows) { const x = r[s.field]; if (isNum(x)) v.push(x); }
  if (!v.length) return null;
  switch (s.agg) {
    case 'sum': return v.reduce((a, b) => a + b, 0);
    case 'avg': return v.reduce((a, b) => a + b, 0) / v.length;
    case 'min': return Math.min(...v);
    case 'max': return Math.max(...v);
    case 'median': { v.sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; }
  }
  return null;
}
function aggregate(ch) {
  const rows = filteredRows(ch.filters);
  const g = new Map();
  for (const r of rows) { const k = keyOf(r, ch.groupBy); if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  let keys = [...g.keys()];
  const s0 = ch.series[0];
  const primary = new Map(keys.map(k => [k, aggValue(g.get(k), s0) ?? -Infinity]));
  const rank = k => ch.topBy === 'count' ? g.get(k).length : primary.get(k);
  if (ch.topN > 0 && keys.length > ch.topN) {
    const top = [...keys].sort((a, b) => rank(b) - rank(a)).slice(0, ch.topN);
    const rest = []; keys.filter(k => !top.includes(k)).forEach(k => rest.push(...g.get(k)));
    keys = top; if (rest.length) { g.set(OTHERS, rest); keys.push(OTHERS); primary.set(OTHERS, -Infinity); }
  }
  if (ch.sort === 'desc') keys.sort((a, b) => (a === OTHERS) - (b === OTHERS) || primary.get(b) - primary.get(a));
  else if (ch.sort === 'count') keys.sort((a, b) => (a === OTHERS) - (b === OTHERS) || g.get(b).length - g.get(a).length);
  else if (ch.sort === 'asc') keys.sort((a, b) => (a === OTHERS) - (b === OTHERS) || primary.get(a) - primary.get(b));
  else keys.sort((a, b) => cmpKeys(a, b, ch.groupBy));
  const raw = ch.series.map(s => keys.map(k => aggValue(g.get(k), s)));
  const totals = ch.series.map(s => aggValue(rows, s));
  const data = ch.series.map((s, i) => raw[i].map(v => {
    if (s.unit === 'pct') return isNum(v) && totals[i] ? v / totals[i] * 100 : null;
    return toPlot(v, s.unit);
  }));
  const totalsPlot = ch.series.map((s, i) => s.unit === 'pct' ? (totals[i] ? 100 : null) : toPlot(totals[i], s.unit));
  return { keys, labels: keys.map(k => labelOf(k, ch.groupBy)), data, totals: totalsPlot, n: rows.length, counts: keys.map(k => g.get(k).length) };
}

// ---------------------------------------------------------------- Chart.js
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function isDark() { return cssVar('color-scheme') === 'dark'; }
function hexLum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0.5;
  const n = parseInt(m[1], 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function mixWhite(hex, t) {
  const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(x => Math.round(x + (255 - x) * t));
  return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
}
// cor da série ajustada para o tema escuro (azul-marinho do Excel some no fundo escuro)
function seriesColor(hex) { return isDark() && hexLum(hex) < 0.06 ? mixWhite(hex, 0.55) : hex; }

if (window.Chart) {
  if (window.ChartDataLabels) { Chart.register(ChartDataLabels); Chart.defaults.set('plugins.datalabels', { display: false }); }
  Chart.defaults.font.family = '"IBM Plex Sans", system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.register({ id: 'bgFill', beforeDraw(c, _a, o) { if (!o.color) return; const x = c.ctx; x.save(); x.fillStyle = o.color; x.fillRect(0, 0, c.width, c.height); x.restore(); } });
}

function chartConfig(ch, ag, forExport) {
  const ink = cssVar('--ink'), ink2 = cssVar('--ink-2'), ink3 = cssVar('--ink-3'), grid = cssVar('--grid'), surf = cssVar('--surface');
  const H = !!ch.horizontal;
  const V = H ? 'x' : 'y', C = H ? 'y' : 'x';
  const anyLeft = ch.series.some(s => s.axis !== 'right');
  const axisOf = s => (s.axis === 'right' && anyLeft) ? V + '1' : V;
  const firstOn = id => ch.series.find(s => axisOf(s) === id);

  const datasets = ch.series.map((s, i) => {
    const col = seriesColor(s.color || PALETTE[i % PALETTE.length]);
    const line = !H && s.type === 'line';
    const ds = {
      type: line ? 'line' : 'bar', label: s.label, data: ag.data[i],
      [H ? 'xAxisID' : 'yAxisID']: axisOf(s),
      backgroundColor: col, borderColor: line ? col : surf, borderWidth: line ? 2 : 0,
      borderRadius: line ? 0 : 4, borderSkipped: 'start', maxBarThickness: 56, categoryPercentage: .72, barPercentage: .9,
      pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: col, pointBorderColor: surf, pointBorderWidth: 2,
      tension: 0, spanGaps: true, order: line ? 0 : 1,
      datalabels: { display: ch.showLabels ? 'auto' : false }
    };
    if (ch.showLabels) {
      const f = v => fmtShort(v, s.unit, s.decimals ?? 0);
      if (line) Object.assign(ds.datalabels, {
        align: 'top', anchor: 'center', offset: 6, color: ink, font: { size: 11, weight: 500 },
        backgroundColor: surf + 'e6', borderColor: col, borderWidth: 1, borderRadius: 4, padding: { top: 2, bottom: 1, left: 5, right: 5 },
        formatter: f
      });
      else {
        const fits = ctx => { const el = ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.dataIndex]; if (!el) return false; const sz = H ? Math.abs(el.x - el.base) : Math.abs(el.base - el.y); return sz > 22; };
        const inside = ctx => fits(ctx) && hexLum(col) < 0.35;
        Object.assign(ds.datalabels, {
          anchor: 'end', align: ctx => inside(ctx) ? 'start' : 'end', offset: 3, clamp: true,
          color: ctx => inside(ctx) ? '#ffffff' : ink, font: { size: 11, weight: 600 }, formatter: f
        });
      }
    }
    return ds;
  });

  const valAxis = (id, pos, s, isSecondary) => ({
    type: 'linear', position: pos, beginAtZero: true, grace: '8%',
    grid: isSecondary ? { drawOnChartArea: false } : { color: grid }, border: { display: false },
    ticks: { color: ink3, maxTicksLimit: 6, callback: v => fmtShort(v, s ? s.unit : 'number', s && s.unit === 'usd_m' ? 1 : 0) },
    title: { display: !!(s && s.axisTitle), text: s ? s.axisTitle : '', color: ink2, font: { size: 12 } }
  });
  const scales = {};
  scales[C] = { type: 'category', grid: { display: false }, border: { color: grid }, ticks: { color: ink2, maxRotation: H ? 0 : 45, autoSkip: true } };
  scales[V] = valAxis(V, H ? 'bottom' : 'left', firstOn(V), false);
  if (firstOn(V + '1')) scales[V + '1'] = valAxis(V + '1', H ? 'top' : 'right', firstOn(V + '1'), true);

  return {
    data: { labels: ag.labels, datasets },
    options: {
      indexAxis: H ? 'y' : 'x', responsive: true, maintainAspectRatio: false, animation: forExport ? false : { duration: 250 },
      layout: { padding: { top: 6, right: 4 } },
      interaction: { mode: 'index', intersect: false },
      scales,
      plugins: {
        bgFill: { color: forExport ? surf : null },
        legend: { display: ch.series.length > 1, position: 'top', align: 'start', labels: { sort: (a, b) => a.datasetIndex - b.datasetIndex, color: ink2, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 14 } },
        tooltip: {
          backgroundColor: cssVar('--surface'), titleColor: ink, bodyColor: ink2, footerColor: ink3, borderColor: cssVar('--border'), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
          callbacks: {
            footer: items => items.length ? `${fmtN(ag.counts[items[0].dataIndex])} pedidos` : '',
            label: c => { const s = ch.series[c.datasetIndex]; const v = c.raw; const b = brlNote(v, s.unit); return ` ${s.label}: ${fmtLong(v, s.unit, s.decimals ?? 0)}${b ? '  (' + b + ')' : ''}`; }
          }
        }
      }
    }
  };
}

// ---------------------------------------------------------------- render do dashboard
function destroyCharts() { Object.values(S.charts).forEach(c => c.destroy()); S.charts = {}; }

function renderAll() {
  if (!S.rows.length) return;
  $('#dashTitle').textContent = S.cfg.title || 'Dashboard';
  document.title = S.cfg.title || 'Dashboard';
  renderInfo(); renderGlobalChips(); renderWarnings(); renderKpis(); renderGrid();
  if (!$('#tabData').hidden) renderDataTab();
}

function renderInfo() {
  const m = S.meta || {};
  const when = m.date ? new Date(m.date).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' }) : '';
  $('#dataInfo').textContent = `${m.name || ''} · aba ${S.sheet} · ${fmtN(S.rows.length)} linhas${when ? ' · ' + when : ''}`;
}

function renderGlobalChips() {
  const el = $('#globalFilterChips');
  const af = (S.cfg.globalFilters || []).filter(f => f.field && f.values && f.values.length);
  el.innerHTML = af.length ? af.map(f => `<span class="chip">${esc(f.field)} ${f.mode === 'exclude' ? '≠' : '='} <b>${esc(f.values.map(v => labelOf(v, f.field)).slice(0, 4).join(', '))}${f.values.length > 4 ? '…' : ''}</b></span>`).join('') : '<span class="muted" style="font-size:13px">Sem filtros globais</span>';
}

function renderWarnings() {
  const out = [];
  const fieldOk = f => !f || S.headers.includes(f);
  const check = (filters, where) => (filters || []).forEach(f => {
    if (!f.field) return;
    if (!fieldOk(f.field)) { out.push(`${where}: coluna <b>${esc(f.field)}</b> não existe na planilha.`); return; }
    if (f.mode === 'include') {
      const ks = new Set(distinct(f.field).map(d => d.k));
      const miss = f.values.filter(v => !ks.has(String(v)));
      if (miss.length) out.push(`${where}: valor(es) <b>${esc(miss.join(', '))}</b> não encontrado(s) em <b>${esc(f.field)}</b>.`);
    }
  });
  check(S.cfg.globalFilters, 'Filtros globais');
  for (const ch of S.cfg.charts) {
    if (!fieldOk(ch.groupBy)) out.push(`“${esc(ch.title)}”: coluna de agrupamento <b>${esc(ch.groupBy)}</b> não existe.`);
    ch.series.forEach(s => { if (s.agg !== 'count' && !fieldOk(s.field)) out.push(`“${esc(ch.title)}”: coluna <b>${esc(s.field)}</b> não existe.`); });
    check(ch.filters, `“${esc(ch.title)}”`);
  }
  if (S.repoHash && S.cfg._base && S.cfg._base !== S.repoHash) out.push('Há um layout publicado mais recente no repositório. <button class="btn small" id="btnUseRepo">Usar layout publicado</button>');
  $('#warnings').innerHTML = out.map(w => `<div class="warn">${w}</div>`).join('');
  const b = $('#btnUseRepo'); if (b) b.onclick = () => { S.cfg = clone(S.repoCfg); S.cfg._base = S.repoHash; saveCfg(); renderAll(); toast('Layout publicado aplicado.'); };
}

function renderKpis() {
  const rows = filteredRows([]);
  const H = n => S.headers.find(h => h.toLowerCase() === n.toLowerCase());
  const val = H('Total Shipment Value'), tot = H('Total Delivery time'), pri = H('Priority');
  const k = [];
  k.push({ l: 'Pedidos', v: fmtN(rows.length), s: S.cfg.globalFilters?.length ? 'com filtros globais' : 'todas as linhas' });
  if (val) {
    const sum = aggValue(rows, { agg: 'sum', field: val });
    k.push({ l: 'Valor total', v: 'US$ ' + fmtN(sum / 1e6, 2) + ' mi', s: S.rate ? `≈ R$ ${fmtN(sum * S.rate / 1e6, 2)} mi · USD/BRL ${fmtN(S.rate, 4)} ${S.rateSrc}` : 'cotação BRL indisponível' });
  }
  if (tot) {
    const a = aggValue(rows, { agg: 'avg', field: tot }), md = aggValue(rows, { agg: 'median', field: tot });
    k.push({ l: 'Tempo médio de entrega', v: fmtN(a, 1) + ' dias', s: 'mediana ' + fmtN(md, 1) + ' dias' });
  }
  if (tot && pri) {
    const aog = rows.filter(r => r[pri] === 'AOG');
    const a = aggValue(aog, { agg: 'avg', field: tot });
    k.push({ l: 'Tempo médio AOG', v: isNum(a) ? fmtHHMM(a * 24) + ' h' : '–', s: fmtN(aog.length) + ' pedidos AOG' });
  }
  $('#kpis').innerHTML = k.map(x => `<div class="kpi"><div class="k-label">${esc(x.l)}</div><div class="k-val">${esc(x.v)}</div><div class="k-sub">${esc(x.s)}</div></div>`).join('');
}

function cardHTML(ch) {
  return `<article class="card ${ch.width === 'full' ? 'full' : ''}" data-id="${esc(ch.id)}">
    <div class="card-h">
      <div class="titles"><h3>${esc(ch.title)}</h3>${ch.subtitle ? `<div class="sub">${esc(ch.subtitle)}</div>` : ''}</div>
      <div class="card-tools">
        <button class="btn" data-act="drag" draggable="true" title="Arrastar para reordenar" aria-label="Reordenar">⠿</button>
        <button class="btn" data-act="table" title="Mostrar tabela">Tabela</button>
        <button class="btn" data-act="edit" title="Editar gráfico">Editar</button>
        <button class="btn" data-act="dup" title="Duplicar">Duplicar</button>
        <button class="btn" data-act="png" title="Baixar PNG">PNG</button>
      </div>
    </div>
    <div class="chartbox"><canvas aria-label="${esc(ch.title)}" role="img"></canvas></div>
    <div class="tablewrap" hidden></div>
  </article>`;
}

function tableHTML(ch, ag) {
  const head = `<tr><th>${esc(ch.groupBy)}</th><th class="num">Pedidos</th>${ch.series.map(s => `<th class="num">${esc(s.label)}</th>`).join('')}</tr>`;
  const body = ag.labels.map((l, i) => `<tr><td>${esc(l)}</td><td class="num">${fmtN(ag.counts[i])}</td>${ch.series.map((s, j) => `<td class="num">${esc(fmtLong(ag.data[j][i], s.unit, s.decimals ?? 0))}</td>`).join('')}</tr>`).join('');
  const tot = `<tr class="total"><td>Total geral</td><td class="num">${fmtN(ag.n)}</td>${ch.series.map((s, j) => `<td class="num">${esc(fmtLong(ag.totals[j], s.unit, s.decimals ?? 0))}</td>`).join('')}</tr>`;
  return `<table class="tbl">${head}${body}${tot}</table>`;
}

function renderGrid() {
  destroyCharts();
  const grid = $('#grid');
  grid.innerHTML = S.cfg.charts.map(cardHTML).join('');
  for (const ch of S.cfg.charts) {
    const card = grid.querySelector(`[data-id="${CSS.escape(ch.id)}"]`);
    try {
      const ag = aggregate(ch);
      if (ch.horizontal) card.querySelector('.chartbox').style.height = Math.max(340, ag.keys.length * (ch.series.length * 12 + 18) + 90) + 'px';
      S.charts[ch.id] = new Chart(card.querySelector('canvas'), chartConfig(ch, ag));
      card.querySelector('.tablewrap').innerHTML = tableHTML(ch, ag);
    } catch (e) {
      console.error(e);
      card.querySelector('.chartbox').innerHTML = `<p class="missing">Erro ao montar o gráfico: ${esc(e.message)}</p>`;
    }
  }
}

function onCardAction(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const card = b.closest('.card'); const id = card.dataset.id;
  const ch = S.cfg.charts.find(c => c.id === id); if (!ch) return;
  switch (b.dataset.act) {
    case 'table': { const t = card.querySelector('.tablewrap'); t.hidden = !t.hidden; b.textContent = t.hidden ? 'Tabela' : 'Ocultar'; break; }
    case 'edit': openEditor(ch); break;
    case 'dup': { const c = clone(ch); c.id = uid(); c.title += ' (cópia)'; S.cfg.charts.splice(S.cfg.charts.indexOf(ch) + 1, 0, c); saveCfg(); renderAll(); break; }
    case 'png': downloadPNG(ch); break;
  }
}

function downloadPNG(ch) {
  const ag = aggregate(ch);
  const w = 1400, h = 700;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const holder = document.createElement('div'); holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px`;
  holder.appendChild(cv); document.body.appendChild(holder);
  const cfg = chartConfig(ch, ag, true);
  cfg.options.responsive = false; cfg.options.devicePixelRatio = 1;
  cfg.options.plugins.title = { display: true, text: ch.title, color: cssVar('--ink'), font: { size: 18, weight: 600 }, align: 'start', padding: { bottom: 10 } };
  cfg.options.layout.padding = 16;
  const c = new Chart(cv, cfg);
  const a = document.createElement('a'); a.href = c.toBase64Image('image/png', 1); a.download = (ch.title || 'grafico').replace(/[^\w\-]+/g, '_') + '.png'; a.click();
  c.destroy(); holder.remove();
}

// drag & drop para reordenar cards
function bindDrag() {
  const grid = $('#grid'); let dragId = null;
  grid.addEventListener('dragstart', e => {
    const h = e.target.closest('[data-act="drag"]'); if (!h) { e.preventDefault(); return; }
    const card = h.closest('.card'); dragId = card.dataset.id; card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.setDragImage(card, 20, 20); } catch {}
  });
  grid.addEventListener('dragover', e => { if (!dragId) return; const c = e.target.closest('.card'); if (!c) return; e.preventDefault(); $$('.card.dragover', grid).forEach(x => x !== c && x.classList.remove('dragover')); if (c.dataset.id !== dragId) c.classList.add('dragover'); });
  grid.addEventListener('drop', e => {
    if (!dragId) return; e.preventDefault(); e.stopPropagation();
    const c = e.target.closest('.card'); if (!c || c.dataset.id === dragId) return;
    const arr = S.cfg.charts; const from = arr.findIndex(x => x.id === dragId); const to = arr.findIndex(x => x.id === c.dataset.id);
    const [m] = arr.splice(from, 1); arr.splice(to, 0, m); saveCfg(); renderAll();
  });
  grid.addEventListener('dragend', () => { dragId = null; $$('.card', grid).forEach(x => x.classList.remove('dragging', 'dragover')); });
}

// ---------------------------------------------------------------- aba Dados
function dataRows() {
  const rows = filteredRows([]);
  const q = S.dataQuery.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => S.headers.some(h => r[h] != null && String(r[h]).toLowerCase().includes(q)));
}
function fmtCell(v, h) {
  if (v == null) return '';
  const inf = S.info[h];
  if (isNum(v) && inf) {
    if (inf.isDate) return fmtDateCell(v, v % 1 !== 0);
    if (inf.isTime) return fmtHHMM(v * 24);
    if (!Number.isInteger(v)) return fmtN(v, 3);
  }
  return String(v);
}
function renderDataTab() {
  const rows = dataRows();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  S.dataPage = Math.min(S.dataPage, pages - 1);
  const slice = rows.slice(S.dataPage * PAGE, (S.dataPage + 1) * PAGE);
  $('#dataTable').innerHTML = `<thead><tr>${S.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
    slice.map(r => `<tr>${S.headers.map(h => `<td class="${isNum(r[h]) ? 'num' : ''}">${esc(fmtCell(r[h], h))}</td>`).join('')}</tr>`).join('') + '</tbody>';
  $('#dataCount').textContent = `${fmtN(rows.length)} de ${fmtN(S.rows.length)} linhas`;
  $('#pgInfo').textContent = `página ${S.dataPage + 1} de ${pages}`;
}
function exportCsv() {
  const rows = dataRows().map(r => Object.fromEntries(S.headers.map(h => [h, fmtCell(r[h], h)])));
  const ws = XLSX.utils.json_to_sheet(rows, { header: S.headers });
  const blob = new Blob(['﻿' + XLSX.utils.sheet_to_csv(ws, { FS: ';' })], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'shipments_filtrado.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------- editor de filtros (reutilizado)
function filterEditor(container, filters, onChange) {
  const fields = S.headers.filter(h => S.info[h]?.categorical).concat(S.headers.filter(h => !S.info[h]?.categorical));
  const draw = () => {
    container.innerHTML = filters.map((f, i) => {
      const vals = f.field && S.headers.includes(f.field) ? distinct(f.field) : [];
      const sel = new Set((f.values || []).map(String));
      const ks = new Set(vals.map(v => v.k));
      const missing = (f.values || []).filter(v => !ks.has(String(v)));
      const summary = sel.size ? `${f.mode === 'exclude' ? 'Exceto' : 'Somente'}: ${[...sel].map(v => labelOf(v, f.field)).slice(0, 5).join(', ')}${sel.size > 5 ? ` (+${sel.size - 5})` : ''}` : 'Nenhum valor marcado (sem efeito)';
      return `<div class="filt" data-i="${i}">
        <div class="filt-top">
          <select data-k="field"><option value="">— coluna —</option>${fields.map(h => `<option ${h === f.field ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select>
          <select data-k="mode"><option value="include" ${f.mode !== 'exclude' ? 'selected' : ''}>somente</option><option value="exclude" ${f.mode === 'exclude' ? 'selected' : ''}>exceto</option></select>
          <button type="button" class="btn small ghost" data-k="rm" title="Remover filtro" aria-label="Remover filtro">✕</button>
        </div>
        ${f.field ? `<details ${f._open ? 'open' : ''}><summary>${esc(summary)}</summary>
          <div class="vals-tools"><input type="search" placeholder="buscar valor" data-k="q" value="${esc(f._q || '')}"><button type="button" class="btn small" data-k="all">Todos</button><button type="button" class="btn small" data-k="none">Nenhum</button></div>
          <div class="vals">${vals.filter(v => !f._q || labelOf(v.k, f.field).toLowerCase().includes(f._q.toLowerCase())).slice(0, 400).map(v => `<label><input type="checkbox" value="${esc(v.k)}" ${sel.has(v.k) ? 'checked' : ''}> ${esc(labelOf(v.k, f.field))}<span class="cnt">${fmtN(v.c)}</span></label>`).join('')}</div>
        </details>` : ''}
        ${missing.length ? `<div class="missing">Não encontrado nos dados: ${esc(missing.join(', '))}</div>` : ''}
      </div>`;
    }).join('') + `<button type="button" class="btn small" data-k="add" style="margin-top:8px">+ Filtro</button>`;
  };
  const strip = () => filters.forEach(f => { f.values = f.values || []; });
  container.onchange = e => {
    const box = e.target.closest('.filt'); if (!box) return; const f = filters[+box.dataset.i]; const k = e.target.dataset.k;
    if (k === 'field') { f.field = e.target.value || null; f.values = []; f._open = true; f._q = ''; draw(); }
    else if (k === 'mode') { f.mode = e.target.value; draw(); }
    else if (e.target.type === 'checkbox') {
      const v = e.target.value; const s = new Set(f.values.map(String)); e.target.checked ? s.add(v) : s.delete(v); f.values = [...s]; f._open = true;
      box.querySelector('summary').textContent = s.size ? `${f.mode === 'exclude' ? 'Exceto' : 'Somente'}: ${[...s].map(x => labelOf(x, f.field)).slice(0, 5).join(', ')}${s.size > 5 ? ` (+${s.size - 5})` : ''}` : 'Nenhum valor marcado (sem efeito)';
    }
    strip(); onChange();
  };
  container.oninput = e => { if (e.target.dataset.k !== 'q') return; const box = e.target.closest('.filt'); const f = filters[+box.dataset.i]; f._q = e.target.value; f._open = true; draw(); const q = container.querySelector(`.filt[data-i="${box.dataset.i}"] [data-k="q"]`); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } };
  container.onclick = e => {
    const k = e.target.dataset.k; if (!k) return;
    if (k === 'add') { filters.push({ field: null, mode: 'include', values: [] }); draw(); onChange(); return; }
    const box = e.target.closest('.filt'); if (!box) return; const i = +box.dataset.i; const f = filters[i];
    if (k === 'rm') { filters.splice(i, 1); draw(); onChange(); }
    if (k === 'all') { const q = (f._q || '').toLowerCase(); const add = distinct(f.field).filter(v => !q || labelOf(v.k, f.field).toLowerCase().includes(q)).map(v => v.k); f.values = [...new Set([...f.values.map(String), ...add])]; f._open = true; draw(); onChange(); }
    if (k === 'none') { f.values = []; f._open = true; draw(); onChange(); }
  };
  draw();
}
const cleanFilters = fs => (fs || []).filter(f => f.field).map(f => ({ field: f.field, mode: f.mode === 'exclude' ? 'exclude' : 'include', values: (f.values || []).map(String) }));

// ---------------------------------------------------------------- editor de gráfico
function newChart() {
  return {
    id: uid(), title: 'Novo gráfico', subtitle: '', width: 'half', groupBy: S.headers.includes('Mês') ? 'Mês' : S.headers.find(h => S.info[h].categorical),
    sort: 'key', topN: 0, showLabels: true, horizontal: false, filters: [],
    series: [{ label: 'Pedidos', agg: 'count', field: null, unit: 'number', decimals: 0, type: 'bar', axis: 'left', color: PALETTE[0], axisTitle: '' }]
  };
}

function openEditor(ch) {
  S.editIsNew = !ch;
  S.edit = clone(ch || newChart());
  $('#dlgChartTitle').textContent = S.editIsNew ? 'Novo gráfico' : 'Editar gráfico';
  $('#btnDeleteChart').hidden = S.editIsNew;
  drawEditor();
  $('#dlgChart').showModal();
  updatePreview();
}

function opt(v, l, cur) { return `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`; }

function drawEditor() {
  const E = S.edit;
  const groupFields = S.headers.filter(h => S.info[h]?.categorical).concat(S.headers.filter(h => !S.info[h]?.categorical));
  const numFields = S.headers.filter(h => S.info[h]?.numeric && !S.info[h]?.isDate && !S.info[h]?.isTime);
  const f = $('#editorForm');
  f.innerHTML = `
    <label class="fld"><span>Título</span><input data-p="title" value="${esc(E.title)}"></label>
    <label class="fld"><span>Subtítulo / descrição</span><input data-p="subtitle" value="${esc(E.subtitle || '')}"></label>
    <div class="g2">
      <label class="fld"><span>Agrupar por (eixo)</span><select data-p="groupBy">${groupFields.map(h => opt(h, h + (S.info[h].categorical ? '' : ' (muitos valores)'), E.groupBy)).join('')}</select></label>
      <label class="fld"><span>Ordenar por</span><select data-p="sort">${opt('key', 'Categoria', E.sort)}${opt('desc', 'Valor (maior primeiro)', E.sort)}${opt('asc', 'Valor (menor primeiro)', E.sort)}${opt('count', 'Nº de pedidos (maior primeiro)', E.sort)}</select></label>
      <label class="fld"><span>Mostrar só os N maiores (0 = todos)</span><input type="number" min="0" data-p="topN" value="${E.topN || 0}"></label>
      <label class="fld"><span>N maiores por</span><select data-p="topBy">${opt('value', 'Valor da 1ª série', E.topBy || 'value')}${opt('count', 'Nº de pedidos', E.topBy || 'value')}</select></label>
      <label class="fld"><span>Largura</span><select data-p="width">${opt('half', 'Meia largura', E.width)}${opt('full', 'Largura inteira', E.width)}</select></label>
    </div>
    <label class="fld inline"><input type="checkbox" data-p="showLabels" ${E.showLabels ? 'checked' : ''}> Rótulos de dados</label>
    <label class="fld inline"><input type="checkbox" data-p="horizontal" ${E.horizontal ? 'checked' : ''}> Barras horizontais (todas as séries como barra)</label>

    <div class="ed-sec"><div class="ed-sec-h"><h4>Séries</h4><button type="button" class="btn small" data-a="addSerie" ${E.series.length >= 4 ? 'disabled' : ''}>+ Série</button></div>
      ${E.series.map((s, i) => `
      <div class="serie" data-s="${i}">
        <div class="serie-h"><span>Série ${i + 1}</span>${E.series.length > 1 ? `<button type="button" class="btn small ghost" data-a="rmSerie" data-s="${i}" aria-label="Remover série">✕</button>` : ''}</div>
        <label class="fld"><span>Nome (legenda)</span><input data-sp="label" value="${esc(s.label)}"></label>
        <div class="g2">
          <label class="fld"><span>Cálculo</span><select data-sp="agg">${Object.entries(AGGS).map(([k, l]) => opt(k, l, s.agg)).join('')}</select></label>
          <label class="fld"><span>Coluna</span><select data-sp="field" ${s.agg === 'count' ? 'disabled' : ''}>${s.agg === 'count' ? '<option>— linhas —</option>' : (s.agg === 'count_distinct' ? S.headers : numFields).map(h => opt(h, h, s.field)).join('')}</select></label>
          <label class="fld"><span>Unidade / formato</span><select data-sp="unit">${Object.entries(UNITS).map(([k, l]) => opt(k, l, s.unit)).join('')}</select></label>
          <label class="fld"><span>Casas decimais</span><input type="number" min="0" max="6" data-sp="decimals" value="${s.decimals ?? 0}"></label>
        </div>
        <div class="g3">
          <label class="fld"><span>Tipo</span><select data-sp="type">${opt('bar', 'Barra', s.type)}${opt('line', 'Linha', s.type)}</select></label>
          <label class="fld"><span>Eixo</span><select data-sp="axis">${opt('left', 'Principal', s.axis)}${opt('right', 'Secundário', s.axis)}</select></label>
          <label class="fld"><span>Cor</span><input type="color" data-sp="color" value="${esc(s.color || PALETTE[i])}"></label>
        </div>
        <label class="fld"><span>Título do eixo</span><input data-sp="axisTitle" value="${esc(s.axisTitle || '')}"></label>
      </div>`).join('')}
    </div>

    <div class="ed-sec"><div class="ed-sec-h"><h4>Filtros do gráfico</h4></div><div id="edFilters"></div></div>
  `;
  filterEditor($('#edFilters'), E.filters, updatePreviewSoon);
}

function onEditorInput(e) {
  const t = e.target; const E = S.edit; if (!E) return;
  if (t.closest('#edFilters')) return;
  const val = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? 0 : +t.value) : t.value;
  if (t.dataset.p) { E[t.dataset.p] = val; }
  else if (t.dataset.sp) {
    const s = E.series[+t.closest('.serie').dataset.s]; s[t.dataset.sp] = val;
    if (t.dataset.sp === 'agg') {
      const numFields = S.headers.filter(h => S.info[h]?.numeric && !S.info[h]?.isDate && !S.info[h]?.isTime);
      if (val === 'count') s.field = null;
      else if (val === 'count_distinct') { if (!S.headers.includes(s.field)) s.field = S.headers[0]; }
      else if (!numFields.includes(s.field)) s.field = numFields.find(h => /value|time/i.test(h)) || numFields[0];
      if (e.type === 'change') { drawEditor(); }
    }
  } else return;
  updatePreviewSoon();
}
function onEditorClick(e) {
  const a = e.target.dataset.a; if (!a) return; const E = S.edit;
  if (a === 'addSerie') { const i = E.series.length; E.series.push({ label: 'Série ' + (i + 1), agg: 'count', field: null, unit: 'number', decimals: 0, type: 'line', axis: 'right', color: PALETTE[i % PALETTE.length], axisTitle: '' }); }
  if (a === 'rmSerie') E.series.splice(+e.target.dataset.s, 1);
  drawEditor(); updatePreview();
}
function updatePreview() {
  if (!S.edit) return;
  $('#pvTitle').textContent = S.edit.title;
  if (S.preview) { S.preview.destroy(); S.preview = null; }
  try { S.preview = new Chart($('#pvCanvas'), chartConfig(S.edit, aggregate(S.edit))); }
  catch (e) { console.error(e); }
}
const updatePreviewSoon = debounce(updatePreview, 150);

function saveEditor() {
  const E = S.edit; E.filters = cleanFilters(E.filters);
  E.series.forEach(s => { if (s.agg === 'count') s.field = null; });
  if (S.editIsNew) S.cfg.charts.push(E);
  else { const i = S.cfg.charts.findIndex(c => c.id === E.id); S.cfg.charts[i] = E; }
  saveCfg(); closeEditor(); renderAll();
}
function closeEditor() { $('#dlgChart').close(); }
function onEditorClosed() { if (S.preview) { S.preview.destroy(); S.preview = null; } S.edit = null; }

// ---------------------------------------------------------------- configuração
async function loadRepoCfg() {
  try {
    const r = await fetch('config/dashboard.json', { cache: 'no-cache' });
    if (r.ok) { const txt = await r.text(); const j = JSON.parse(txt); if (j && Array.isArray(j.charts)) { S.repoCfg = j; S.repoHash = hash(JSON.stringify(j)); return; } }
  } catch {}
  S.repoCfg = clone(EMBEDDED_DEFAULT); S.repoHash = null;
}
function loadCfg() {
  let c = null; try { c = JSON.parse(lsGet(LS_CFG)); } catch {}
  if (c && Array.isArray(c.charts)) return c;
  const d = clone(S.repoCfg); d._base = S.repoHash; return d;
}
function saveCfg() { if (!S.cfg._base && S.repoHash) S.cfg._base = S.repoHash; lsSet(LS_CFG, JSON.stringify(S.cfg)); }
function exportCfg() {
  const c = clone(S.cfg); delete c._base;
  const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dashboard.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function fetchRate() {
  if (isNum(S.cfg.usdbrl) && S.cfg.usdbrl > 0) { S.rate = S.cfg.usdbrl; S.rateSrc = '(manual)'; return; }
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const j = await r.json(); const bid = parseFloat(j.USDBRL.bid);
    if (bid > 0) { S.rate = bid; S.rateSrc = '(' + new Date(+j.USDBRL.timestamp * 1000 || Date.now()).toLocaleDateString(LOCALE) + ')'; }
  } catch { S.rate = null; }
}

// ---------------------------------------------------------------- importação
async function loadWorkbook(buf, meta) {
  if (!window.XLSX) throw new Error('Biblioteca de leitura de planilhas não carregou (sem internet?).');
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellText: false, cellNF: false, cellStyles: false });
  S.wb = wb;
  const sheet = S.cfg.sheet && wb.SheetNames.includes(S.cfg.sheet) ? S.cfg.sheet : guessSheet(wb);
  parseSheet(sheet);
  S.meta = meta;
  if (!S.rows.length) throw new Error('A aba "' + sheet + '" não tem linhas de dados.');
}

async function importFile(file) {
  if (!file) return;
  if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) { toast('Selecione um arquivo .xlsx'); return; }
  try {
    const buf = await file.arrayBuffer();
    await loadWorkbook(buf, { name: file.name, date: Date.now(), source: 'navegador' });
    await idbPut({ name: file.name, date: Date.now(), buf });
    showDash(); renderAll();
    toast(`Planilha importada: ${fmtN(S.rows.length)} linhas da aba ${S.sheet}.`);
  } catch (e) { console.error(e); toast('Erro ao importar: ' + e.message, 6000); }
}

function showEmpty() { $('#emptyState').hidden = false; $('#dash').hidden = true; }
function showDash() { $('#emptyState').hidden = true; $('#dash').hidden = false; }

// ---------------------------------------------------------------- tema
function applyTheme() {
  const t = lsGet(LS_THEME);
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
function toggleTheme() {
  const next = isDark() ? 'light' : 'dark'; lsSet(LS_THEME, next); applyTheme(); renderAll();
}

// ---------------------------------------------------------------- eventos
function bind() {
  const fi = $('#fileInput');
  $('#btnImport').onclick = () => fi.click();
  $('#btnImport2').onclick = e => { e.stopPropagation(); fi.click(); };
  $('#dropzone').onclick = () => fi.click();
  fi.onchange = () => { importFile(fi.files[0]); fi.value = ''; };

  // arrastar arquivo para a página
  let depth = 0; const ov = $('#dropOverlay');
  const isFile = e => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', e => { if (!isFile(e)) return; depth++; ov.hidden = false; });
  window.addEventListener('dragleave', e => { if (!isFile(e)) return; depth = Math.max(0, depth - 1); if (!depth) ov.hidden = true; });
  window.addEventListener('dragover', e => { if (isFile(e)) e.preventDefault(); });
  window.addEventListener('drop', e => { if (!isFile(e)) return; e.preventDefault(); depth = 0; ov.hidden = true; importFile(e.dataTransfer.files[0]); });

  $('#btnTheme').onclick = toggleTheme;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!lsGet(LS_THEME)) renderAll(); });

  $('#btnAddChart').onclick = () => { if (!S.rows.length) { toast('Importe a planilha primeiro.'); return; } openEditor(null); };
  $('#grid').addEventListener('click', onCardAction);
  bindDrag();

  $('#editorForm').addEventListener('input', onEditorInput);
  $('#editorForm').addEventListener('change', onEditorInput);
  $('#editorForm').addEventListener('click', onEditorClick);
  $('#btnSaveChart').onclick = saveEditor;
  $('#btnDeleteChart').onclick = () => {
    if (!confirm('Excluir este gráfico?')) return;
    S.cfg.charts = S.cfg.charts.filter(c => c.id !== S.edit.id); saveCfg(); closeEditor(); renderAll();
  };
  $('#dlgChart').addEventListener('close', onEditorClosed);

  // tabs
  $$('.tab').forEach(t => t.onclick = () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === t));
    const data = t.dataset.tab === 'data';
    $('#tabCharts').hidden = data; $('#tabData').hidden = !data;
    if (data) renderDataTab();
  });
  $('#dataSearch').addEventListener('input', debounce(e => { S.dataQuery = e.target.value; S.dataPage = 0; renderDataTab(); }, 200));
  $('#pgPrev').onclick = () => { S.dataPage = Math.max(0, S.dataPage - 1); renderDataTab(); };
  $('#pgNext').onclick = () => { S.dataPage++; renderDataTab(); };
  $('#btnExportCsv').onclick = exportCsv;

  // filtros globais
  $('#btnGlobalFilters').onclick = () => {
    S.globalDraft = clone(S.cfg.globalFilters || []);
    filterEditor($('#globalFiltersEditor'), S.globalDraft, () => {});
    $('#dlgGlobal').showModal();
  };
  $('#btnSaveGlobal').onclick = () => { S.cfg.globalFilters = cleanFilters(S.globalDraft); saveCfg(); $('#dlgGlobal').close(); renderAll(); };

  // configurações
  $('#btnSettings').onclick = () => {
    $('#setTitle').value = S.cfg.title || '';
    $('#setSheet').innerHTML = (S.wb ? S.wb.SheetNames : [S.cfg.sheet || 'Data']).map(n => opt(n, n, S.sheet || S.cfg.sheet)).join('');
    $('#setRate').value = isNum(S.cfg.usdbrl) ? S.cfg.usdbrl : '';
    const m = S.meta;
    $('#setDataInfo').textContent = m ? `Arquivo atual: ${m.name} (${m.source === 'repositório' ? 'publicado no repositório' : 'salvo neste navegador'}).` : 'Nenhuma planilha carregada.';
    $('#dlgSettings').showModal();
  };
  $('#btnSaveSettings').onclick = async () => {
    S.cfg.title = $('#setTitle').value.trim() || 'Dashboard';
    const sh = $('#setSheet').value; const rate = parseFloat($('#setRate').value);
    S.cfg.usdbrl = rate > 0 ? rate : null;
    if (S.wb && sh !== S.sheet) { try { parseSheet(sh); } catch (e) { toast(e.message); } }
    S.cfg.sheet = S.sheet || sh;
    saveCfg(); $('#dlgSettings').close(); await fetchRate(); renderAll();
  };
  $('#btnClearData').onclick = async () => {
    if (!confirm('Remover a planilha salva neste navegador?')) return;
    await idbDel(); $('#dlgSettings').close(); location.reload();
  };
  $('#btnExportCfg').onclick = exportCfg;
  $('#btnImportCfg').onclick = () => $('#cfgInput').click();
  $('#cfgInput').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (!Array.isArray(j.charts)) throw new Error('JSON sem "charts"'); S.cfg = j; saveCfg(); $('#dlgSettings').close(); renderAll(); toast('Layout importado.'); }
    catch (err) { toast('Layout inválido: ' + err.message); }
  };
  $('#btnResetCfg').onclick = () => {
    if (!confirm('Descartar as personalizações deste navegador e voltar ao layout publicado?')) return;
    lsSet(LS_CFG, null); S.cfg = loadCfg(); $('#dlgSettings').close(); renderAll(); toast('Layout padrão restaurado.');
  };

  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => Object.values(S.charts).forEach(c => c.resize()), 150); });
}

// ---------------------------------------------------------------- início
async function init() {
  applyTheme();
  await loadRepoCfg();
  S.cfg = loadCfg();
  bind();
  const ratePromise = fetchRate();
  try {
    const saved = await idbGet();
    if (saved && saved.buf) await loadWorkbook(saved.buf, { name: saved.name, date: saved.date, source: 'navegador' });
    else {
      const r = await fetch('data/shipments.xlsx', { cache: 'no-cache' }).catch(() => null);
      if (r && r.ok) await loadWorkbook(await r.arrayBuffer(), { name: 'data/shipments.xlsx', date: r.headers.get('last-modified'), source: 'repositório' });
    }
  } catch (e) { console.error(e); toast('Não foi possível ler a planilha salva: ' + e.message, 6000); }
  if (!S.rows.length) { showEmpty(); return; }
  showDash(); renderAll();
  ratePromise.then(() => renderKpis());
}

// exposto para testes
window.__fslDash = { S, aggregate };
init();
})();
