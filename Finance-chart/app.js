(function () {
'use strict';

/* =========================================================== 기본 도구 */
const CFG = window.FC_CONFIG || {};
const I18N = window.I18N, tr = I18N.t, td = I18N.td;
const DAY = 86400000;
const MIN_DAY = Math.floor(Date.UTC(1600, 0, 1) / DAY);
const $ = (id) => document.getElementById(id);
const isoToDay = (s) => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY);
const dayToISO = (d) => new Date(d * DAY).toISOString().slice(0, 10);
const dayToYMD = (d) => { const t = new Date(d * DAY); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
const pad2 = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PALETTE = ['#4ea8de', '#f4a261', '#2ec4b6', '#e76f51', '#b794f4', '#e9c46a', '#80ed99', '#ff6b9d', '#90be6d', '#c77dff', '#48cae4', '#ffb703', '#adb5bd', '#fb8500', '#06d6a0', '#ef476f'];
const GROUPS = [['rates', tr('금리')], ['metals', tr('금 · 원자재')], ['crypto', tr('암호화폐')], ['fx', tr('환율')], ['stock', tr('주가지수')], ['macro', tr('물가 · 거시')]];
const CUR = { USD: [tr('달러'), '$'], KRW: [tr('원'), '₩'], JPY: [tr('엔'), '¥'], CNY: [tr('위안'), 'CN¥'], EUR: [tr('유로'), '€'], GBP: [tr('파운드'), '£'] };
const FREQ = { daily: tr('일별'), monthly: tr('월별'), annual: tr('연 단위'), mixed: tr('연·일 혼합') };
const RANGES = [[tr('최대'), 'max'], [tr('100년'), 100], [tr('50년'), 50], [tr('10년'), 10], [tr('5년'), 5], [tr('1년'), 1], [tr('6개월'), 0.5], [tr('1개월'), 1 / 12], [tr('맞춤'), 'fit']];

function lsGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }

// 정렬된 배열 t 에서 t[i] <= x 인 마지막 i (없으면 -1)
function lastLE(t, x) { let lo = 0, hi = t.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (t[m] <= x) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
// t[i] >= x 인 첫 i (없으면 t.length)
function firstGE(t, x) { let lo = 0, hi = t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < x) lo = m + 1; else hi = m; } return lo; }

function fmtVal(v, unit) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  const num = (x, dmax) => x.toLocaleString('en-US', { maximumFractionDigits: dmax });
  if (unit === '%') return v.toFixed(2) + '%';
  if (unit === 'idx') return v.toFixed(1);
  if (unit === 'index') return v.toFixed(1);
  const sym = unit === 'USD' ? '$' : unit === 'GBP' ? '£' : unit === 'KRW' ? '₩' : unit === 'EUR' ? '€' : unit === 'JPY' ? '¥' : unit === 'CNY' ? 'CN¥' : '';
  if (unit === 'KRW') return sym + num(v, a >= 100 ? 0 : 2);
  return sym + (a >= 1000 ? num(v, 0) : a >= 100 ? num(v, 1) : a >= 1 ? num(v, 2) : num(v, 4));
}
function fmtAxis(v, unit) {
  const a = Math.abs(v);
  if (unit === '%') return (Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0)) + '%';
  if (unit === 'KRW' && I18N.lang !== 'en') {
    if (a >= 1e12) return '₩' + trim(v / 1e12) + tr('조'); if (a >= 1e8) return '₩' + trim(v / 1e8) + tr('억'); if (a >= 1e4) return '₩' + trim(v / 1e4) + tr('만');
    return '₩' + trim(v);
  }
  const sym = unit === 'USD' ? '$' : unit === 'GBP' ? '£' : unit === 'EUR' ? '€' : unit === 'JPY' ? '¥' : unit === 'CNY' ? 'CN¥' : unit === 'KRW' ? '₩' : '';
  if (unit === 'KRW' && a >= 1e12) return sym + trim(v / 1e12) + 'T';
  if (a >= 1e9) return sym + trim(v / 1e9) + 'B'; if (a >= 1e6) return sym + trim(v / 1e6) + 'M'; if (a >= 1e4) return sym + trim(v / 1e3) + 'k';
  return sym + trim(v);
}
function trim(x) { const a = Math.abs(x); const s = a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : a >= 1 ? x.toFixed(2) : x.toPrecision(2); return String(parseFloat(s)); }
function fmtDateFor(s, d) { const [y, m, dd] = dayToYMD(d); return s.meta.freq === 'annual' ? `${y}${tr('년')}` : s.meta.freq === 'monthly' ? `${y}-${pad2(m)}` : dayToISO(d); }

/* =========================================================== 상태 */
const prefs = lsGet('fc_prefs_v1', {});
const S = {
  manifest: null, end: 0,
  data: new Map(),                  // id -> {meta,t,v}
  loading: new Set(),
  visible: prefs.visible || ['fed_funds', 'bok_base', 'gold_usd', 'btc_usd'],
  pairs: prefs.pairs || [['USD', 'KRW'], ['JPY', 'KRW'], ['EUR', 'KRW'], ['CNY', 'KRW'], ['GBP', 'KRW']],
  colors: prefs.colors || {},
  mode: prefs.mode || 'abs', log: !!prefs.log, showEvents: prefs.showEvents !== false, notesMode: prefs.notesMode || 'own',
  theme: prefs.theme || 'dark',
  x0: MIN_DAY, x1: MIN_DAY + 1, rangeKey: 'max',
  notes: [], events: [], user: null,
  offices: null, offOn: Array.isArray(prefs.offOn) ? prefs.offOn : ['us_president', 'fed_chair'],
  hover: null, hits: [], P: null, view: null,
};
function savePrefs() { lsSet('fc_prefs_v1', { offOn: S.offOn, visible: S.visible, pairs: S.pairs, colors: S.colors, mode: S.mode, log: S.log, showEvents: S.showEvents, notesMode: S.notesMode, theme: S.theme }); }

/* =========================================================== 데이터 로딩 */
const pairId = (b, q) => `pair:${b}:${q}`;
function metaOf(id) {
  if (id.startsWith('pair:')) {
    const [, b, q] = id.split(':');
    return { id, name: `1${CUR[b][0]} = ?${CUR[q][0]}`, group: 'fx', unit: q, kind: 'line', freq: 'daily', source: tr('FRED(연준 H.10) 달러 기준 환율에서 계산한 교차환율') + ` (${b}→${q})`, url: 'https://www.federalreserve.gov/releases/h10/', status: 'ok', isPair: true, base: b, quote: q };
  }
  return S.manifest.series.find((s) => s.id === id);
}
async function fetchRaw(id) {
  const r = await fetch(`data/${id}.json?v=${encodeURIComponent(S.manifest.generated || '')}`);
  if (!r.ok) throw new Error(`${id}: ${r.status}`);
  const j = await r.json();
  return { t: Float64Array.from(j.t), v: Float64Array.from(j.v) };
}
async function ensure(id) {
  if (S.data.has(id)) return S.data.get(id);
  const meta = metaOf(id);
  if (!meta) return null;
  if (meta.isPair) {
    const need = ['USD' === meta.base ? null : 'fx_' + meta.base, 'USD' === meta.quote ? null : 'fx_' + meta.quote].filter(Boolean);
    const parts = await Promise.all(need.map(ensure));
    if (parts.some((p) => !p)) return null;
    const A = meta.base === 'USD' ? null : S.data.get('fx_' + meta.base);
    const B = meta.quote === 'USD' ? null : S.data.get('fx_' + meta.quote);
    let t = [], v = [];
    if (!A) { t = Array.from(B.t); v = Array.from(B.v); }
    else if (!B) { t = Array.from(A.t); v = Array.from(A.v, (x) => 1 / x); }
    else {
      for (let i = 0; i < B.t.length; i++) {
        const j = lastLE(A.t, B.t[i]);
        if (j >= 0 && B.t[i] - A.t[j] <= 7) { t.push(B.t[i]); v.push(B.v[i] / A.v[j]); }
      }
    }
    const d = { meta, t: Float64Array.from(t), v: Float64Array.from(v) };
    S.data.set(id, d); return d;
  }
  if (!meta.n) return null;
  try {
    const raw = await fetchRaw(id);
    const d = { meta, ...raw }; S.data.set(id, d); return d;
  } catch (e) { console.warn(e); return null; }
}
function colorFor(id) {
  if (!S.colors[id]) {
    const used = new Set(Object.values(S.colors));
    S.colors[id] = PALETTE.find((c) => !used.has(c)) || PALETTE[Object.keys(S.colors).length % PALETTE.length];
  }
  return S.colors[id];
}

/* =========================================================== 메모 저장소 */
let sb = null;
const LocalStore = {
  name: 'local',
  async list() { return lsGet('fc_notes_local', []); },
  async add(n) { const all = lsGet('fc_notes_local', []); const x = { ...n, id: 'l' + Date.now() + Math.random().toString(36).slice(2, 6) }; all.push(x); lsSet('fc_notes_local', all); return x; },
  async update(id, p) { const all = lsGet('fc_notes_local', []); const i = all.findIndex((x) => x.id === id); if (i >= 0) all[i] = { ...all[i], ...p }; lsSet('fc_notes_local', all); return all[i]; },
  async remove(id) { lsSet('fc_notes_local', lsGet('fc_notes_local', []).filter((x) => x.id !== id)); },
};
const NOTE_COLORS = ['#ef5350', '#ff9800', '#fdd835', '#66bb6a', '#26a69a', '#42a5f5', '#7e57c2', '#ec407a'];
const fromRow = (r) => ({ id: r.id, date: r.note_date, value: r.value, body: r.body, scope: r.scope, series_id: r.series_id, display: r.display, color: r.color || null });
const toRow = (n) => ({ note_date: n.date, value: n.value ?? null, body: n.body, scope: n.scope, series_id: n.scope === 'series' ? n.series_id : null, display: n.display, color: n.color || null });
const RemoteStore = {
  name: 'supabase',
  async list() { const { data, error } = await sb.from('chart_notes').select('*').order('note_date'); if (error) throw error; return data.map(fromRow); },
  async add(n) { const { data, error } = await sb.from('chart_notes').insert(toRow(n)).select().single(); if (error) throw error; return fromRow(data); },
  async update(id, p) { const row = toRow(p); const { data, error } = await sb.from('chart_notes').update(row).eq('id', id).select().single(); if (error) throw error; return fromRow(data); },
  async remove(id) { const { error } = await sb.from('chart_notes').delete().eq('id', id); if (error) throw error; },
};
const FORCE_LOCAL = /[?&]local\b/.test(location.search);
function store() { return FORCE_LOCAL ? LocalStore : (sb && S.user ? RemoteStore : null); }
async function loadNotes() {
  S.know = null; /* 지식 노트는 열 때 다시 불러옴 (계정이 바뀌었을 수 있음) */
  const st = store();
  if (!st) { S.notes = []; draw(); return; }
  try { S.notes = await st.list(); } catch (e) { console.warn(e); S.notes = []; flash(tr('메모를 불러오지 못했습니다: ') + (e.message || e)); }
  draw();
}

/* =========================================================== 보이는 지표 */
function visibleList() {
  const out = [];
  for (const id of S.visible) {
    const d = S.data.get(id);
    if (!d || !d.t.length) continue;
    out.push({ id, meta: d.meta, name: d.meta.name, unit: d.meta.unit, kind: d.meta.kind, t: d.t, v: d.v, color: colorFor(id) });
  }
  return out;
}

/* =========================================================== 캔버스 */
const cv = $('cv'), ctx = cv.getContext('2d'), wrap = $('chartwrap');
let W = 0, H = 0, dpr = 1, raf = 0, css = {};
function readCss() { const c = getComputedStyle(document.documentElement); css = { bg: c.getPropertyValue('--panel').trim(), grid: c.getPropertyValue('--grid').trim(), axis: c.getPropertyValue('--axis').trim(), text: c.getPropertyValue('--text').trim(), note: c.getPropertyValue('--note').trim(), event: c.getPropertyValue('--event').trim(), line: c.getPropertyValue('--line').trim() }; }
function resize() { dpr = window.devicePixelRatio || 1; W = wrap.clientWidth; H = wrap.clientHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw(); }
function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
const xOf = (d) => S.P.l + (d - S.x0) / (S.x1 - S.x0) * (S.P.w);
const dOf = (x) => S.x0 + (x - S.P.l) / S.P.w * (S.x1 - S.x0);

function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }

function timeTicks(x0, x1, wpx) {
  const spanD = x1 - x0, spanY = spanD / 365.25, max = Math.max(3, Math.floor(wpx / 85)), out = [];
  if (spanY >= 2.5) {
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200];
    const st = steps.find((s) => spanY / s <= max) || 200;
    for (let y = Math.floor(dayToYMD(x0)[0] / st) * st; ; y += st) { const d = Math.floor(Date.UTC(y, 0, 1) / DAY); if (d > x1) break; if (d >= x0) out.push([d, String(y), true]); }
  } else if (spanD >= 70) {
    const steps = [1, 2, 3, 6]; const st = steps.find((s) => (spanD / 30.4) / s <= max) || 6;
    let [y, m] = dayToYMD(x0); m = Math.floor((m - 1) / st) * st;
    for (; ; m += st) { const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12; const d = Math.floor(Date.UTC(yy, mm, 1) / DAY); if (d > x1) break; if (d >= x0) out.push([d, mm === 0 ? String(yy) : `${yy}.${pad2(mm + 1)}`, mm === 0]); }
  } else {
    const steps = [1, 2, 5, 7, 10, 14]; const st = steps.find((s) => spanD / s <= max) || 14;
    for (let d = Math.ceil(x0 / st) * st; d <= x1; d += st) { const [y, m, dd] = dayToYMD(d); out.push([d, `${pad2(m)}-${pad2(dd)}`, dd === 1]); }
  }
  return out;
}
function valTicks(lo, hi, h, log) {
  const out = [];
  if (log) {
    for (let p = Math.floor(Math.log10(lo)); p <= Math.ceil(Math.log10(hi)); p++) for (const m of [1, 2, 5]) { const v = m * Math.pow(10, p); if (v >= lo && v <= hi) out.push(v); }
    if (out.length < 2) return valTicks(lo, hi, h, false);
    return out;
  }
  const st = niceStep((hi - lo) / Math.max(3, Math.floor(h / 48)));
  for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
  return out;
}

function render() {
  if (!W || !H) return;
  readCss();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const list = visibleList();
  S.hits = [];
  // 축 구성
  let units = [...new Set(list.map((s) => s.unit))];
  const forced = units.length > 2;
  const rebase = S.mode === 'rebase' || forced;
  if (rebase) units = ['idx'];
  const twoAxes = !rebase && units.length === 2;
  const P = { l: 62, r: twoAxes ? 62 : 16, t: 26, ev: 24, lane: 24 + offActive().length * OFF_H, axisH: 24 };
  P.w = Math.max(50, W - P.l - P.r); P.b = H - P.axisH - P.lane - 4; P.h = Math.max(40, P.b - P.t);
  S.P = P;
  const noteEl = $('notice');
  const notices = [];
  if (forced && S.mode !== 'rebase') notices.push(tr('단위가 3종류 이상이라 \'시작=100 비교\'로 자동 전환했습니다.'));

  // 시리즈별 변환 (시작=100)
  const items = [];
  for (const s of list) {
    const lo = Math.max(0, firstGE(s.t, S.x0) - 1), hi = Math.min(s.t.length - 1, firstGE(s.t, S.x1));
    if (hi < 0 || s.t[hi] < S.x0 || s.t[lo] > S.x1) continue;
    let base = 1;
    if (rebase) {
      const bi = Math.min(s.t.length - 1, firstGE(s.t, S.x0));
      base = s.v[bi];
      if (!(base > 0)) { notices.push(tr('{0}: 기준값이 0 이하라 비교 모드에서 제외했습니다.', s.name)); continue; }
      base = base / 100;
    }
    items.push({ s, lo, hi, base, axis: rebase ? 0 : units.indexOf(s.unit) });
  }
  // 축별 y 범위
  const ax = units.map(() => ({ min: Infinity, max: -Infinity }));
  for (const it of items) {
    const a = ax[it.axis];
    for (let i = it.lo; i <= it.hi; i++) { const x = it.s.t[i]; if (x < S.x0 - 1 && i < it.hi) { if (i + 1 <= it.hi && it.s.t[i + 1] < S.x0) continue; } const y = it.s.v[i] / it.base; if (y < a.min) a.min = y; if (y > a.max) a.max = y; }
  }
  ax.forEach((a, k) => {
    if (!isFinite(a.min)) { a.min = 0; a.max = 1; }
    if (a.max === a.min) { a.max += 1; a.min -= 1; }
    a.log = S.log && a.min > 0;
    if (a.log) { const lo = Math.log(a.min), hi = Math.log(a.max), pd = (hi - lo) * 0.06; a.lo = Math.exp(lo - pd); a.hi = Math.exp(hi + pd); }
    else { const pd = (a.max - a.min) * 0.06; a.lo = a.min - pd; a.hi = a.max + pd; if (a.min >= 0 && a.lo < 0) a.lo = 0; }
    a.unit = units[k];
    a.toY = a.log ? (v) => P.b - (Math.log(v) - Math.log(a.lo)) / (Math.log(a.hi) - Math.log(a.lo)) * P.h : (v) => P.b - (v - a.lo) / (a.hi - a.lo) * P.h;
  });
  S.view = { ax, items, rebase, units };

  // 격자 + 시간축
  ctx.font = '11.5px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  ctx.lineWidth = 1;
  const tt = timeTicks(S.x0, S.x1, P.w);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const [d, label, major] of tt) {
    const x = Math.round(xOf(d)) + 0.5;
    ctx.strokeStyle = css.grid; ctx.beginPath(); ctx.moveTo(x, P.t); ctx.lineTo(x, P.b + P.lane); ctx.stroke();
    ctx.fillStyle = major ? css.text : css.axis; ctx.fillText(label, x, P.b + P.lane + 6);
  }
  const a0 = ax[0];
  if (a0) {
    const tk = valTicks(a0.lo, a0.hi, P.h, a0.log);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of tk) { const y = Math.round(a0.toY(v)) + 0.5; ctx.strokeStyle = css.grid; ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.l + P.w, y); ctx.stroke(); ctx.fillStyle = css.axis; ctx.fillText(rebase ? String(Math.round(v)) : fmtAxis(v, a0.unit), P.l - 6, y); }
    ctx.textAlign = 'left'; ctx.fillStyle = css.axis; ctx.textBaseline = 'top';
    ctx.fillText(rebase ? tr('시작=100 (기준 대비 %)') : unitLabel(a0.unit), 6, 6);
    if (twoAxes) {
      const a1 = ax[1]; const tk1 = valTicks(a1.lo, a1.hi, P.h, a1.log);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const v of tk1) { const y = Math.round(a1.toY(v)) + 0.5; ctx.fillStyle = css.axis; ctx.fillText(fmtAxis(v, a1.unit), P.l + P.w + 6, y); ctx.strokeStyle = css.grid; ctx.beginPath(); ctx.moveTo(P.l + P.w, y); ctx.lineTo(P.l + P.w + 4, y); ctx.stroke(); }
      ctx.textBaseline = 'top'; ctx.textAlign = 'right'; ctx.fillText(unitLabel(a1.unit), W - 6, 6);
    }
  }
  // 연표 줄 구분선
  ctx.strokeStyle = css.line; ctx.beginPath(); ctx.moveTo(P.l, P.b + 0.5); ctx.lineTo(P.l + P.w, P.b + 0.5); ctx.stroke();

  // 선
  ctx.save(); ctx.beginPath(); ctx.rect(P.l, P.t - 2, P.w, P.h + 4); ctx.clip();
  for (const it of items) drawSeries(it, ax[it.axis]);
  ctx.restore();

  // 사건 + 메모
  drawLaneAndNotes(items, ax);

  // 십자선
  if (S.hover && S.hover.x >= P.l && S.hover.x <= P.l + P.w) {
    ctx.strokeStyle = css.axis; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(Math.round(S.hover.x) + 0.5, P.t); ctx.lineTo(Math.round(S.hover.x) + 0.5, P.b + P.lane); ctx.stroke(); ctx.setLineDash([]);
    for (const it of items) {
      const i = lastLE(it.s.t, S.hover.d); if (i < 0) continue;
      if (!inCoverage(it.s, S.hover.d, i)) continue;
      const y = ax[it.axis].toY(it.s.v[i] / it.base);
      ctx.fillStyle = it.s.color; ctx.strokeStyle = css.bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(xOf(it.s.t[i] < S.hover.d && it.s.kind !== 'step' ? S.hover.d : S.hover.d), y, 3.5, 0, 7); ctx.stroke(); ctx.fill(); ctx.lineWidth = 1;
    }
  }
  // 빈 화면 안내
  const empty = $('empty');
  if (!S.manifest) { empty.style.display = 'flex'; }
  else if (!list.length) { empty.style.display = 'flex'; empty.textContent = S.visible.length ? tr('불러오는 중이거나 표시할 데이터가 없습니다.') : tr('왼쪽에서 보고 싶은 지표를 클릭하세요.'); }
  else if (!items.length) { empty.style.display = 'flex'; empty.textContent = tr('이 기간에는 선택한 지표의 데이터가 없습니다.\n\'맞춤\' 또는 \'최대\' 버튼으로 범위를 바꿔 보세요.'); }
  else empty.style.display = 'none';
  noteEl.textContent = notices.join('  ');
  renderChips(list);
  highlightRange();
}
function unitLabel(u) { return u === '%' ? tr('금리 (%)') : u === 'USD' ? tr('달러 ($)') : u === 'KRW' ? tr('원 (₩)') : u === 'GBP' ? tr('파운드 (£)') : u === 'index' ? tr('지수') : u === 'pt' ? tr('주가지수 (pt)') : (CUR[u] ? CUR[u][0] : u); }

// 시리즈의 데이터가 hover 날짜를 "덮는지" (마지막 값에서 너무 멀리 떨어지면 값을 보여주지 않는다)
function inCoverage(s, d, i) {
  if (i < 0) return false;
  if (i === s.t.length - 1) { const gap = s.meta.freq === 'annual' ? 400 : s.meta.freq === 'monthly' ? 45 : 20; if (s.kind === 'step') return d <= S.end + 1 && S.end - s.t[i] < 60 ? true : d - s.t[i] <= gap; return d - s.t[i] <= gap; }
  return true;
}

function drawSeries(it, a) {
  const { s, lo, hi, base } = it, P = S.P;
  const step = s.kind === 'step';
  ctx.strokeStyle = s.color; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.beginPath();
  const n = hi - lo + 1;
  if (n <= P.w * 2) {
    let px = 0, py = 0;
    for (let i = lo; i <= hi; i++) {
      const x = xOf(s.t[i]), y = a.toY(s.v[i] / base);
      if (i === lo) ctx.moveTo(x, y); else if (step) { ctx.lineTo(x, py); ctx.lineTo(x, y); } else ctx.lineTo(x, y);
      px = x; py = y;
    }
    if (step && s.t[hi] >= S.end - 45) ctx.lineTo(xOf(S.end), py);
  } else {
    // 픽셀 열마다 최소/최대만 그려 성능 유지
    let cur = -1, mn = 0, mx = 0, first = 0, last = 0, started = false;
    const flush = () => { if (cur < 0) return; const x = cur + 0.5; if (!started) { ctx.moveTo(x, first); started = true; } else ctx.lineTo(x, first); ctx.lineTo(x, mn); ctx.lineTo(x, mx); ctx.lineTo(x, last); };
    for (let i = lo; i <= hi; i++) {
      const x = Math.floor(xOf(s.t[i])), y = a.toY(s.v[i] / base);
      if (x !== cur) { flush(); cur = x; first = last = mn = mx = y; } else { if (y < mn) mn = y; if (y > mx) mx = y; last = y; }
    }
    flush();
  }
  ctx.stroke();
  // 데이터가 듬성듬성하면(연/월 단위) 점도 표시
  if (n <= 60 && (s.meta.freq === 'annual' || s.meta.freq === 'monthly' || n <= 25) && !step) {
    ctx.fillStyle = s.color;
    for (let i = lo; i <= hi; i++) { const x = xOf(s.t[i]); if (x < P.l - 4 || x > P.l + P.w + 4) continue; ctx.beginPath(); ctx.arc(x, a.toY(s.v[i] / base), 2.2, 0, 7); ctx.fill(); }
  }
}

/* =========================================================== 임기 띠 (대통령·연준 의장·재무장관) */
const OFF_H = 16;
const OFF_SHORT = { us_president: tr('미 대통령'), fed_chair: tr('연준 의장'), us_treasury: tr('미 재무장관'), kr_president: tr('한 대통령'), kr_finance: tr('한 재경장관') };
function offActive() { return S.offices ? S.offices.roles.filter((r) => S.offOn.includes(r.id)) : []; }
function drawOffices() {
  const P = S.P, roles = offActive(); if (!roles.length) return;
  const FONT = '11px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  roles.forEach((r, k) => {
    const y = P.b + P.ev + k * OFF_H + 1, h = OFF_H - 2;
    ctx.font = '10px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = css.axis;
    ctx.fillText(OFF_SHORT[r.id] || r.name, P.l - 6, y + h / 2);
    ctx.save(); ctx.beginPath(); ctx.rect(P.l, y - 1, P.w, h + 2); ctx.clip();
    ctx.font = FONT;
    for (const it of r.items) {
      const a = xOf(it.d0), b = xOf(it.d1 == null ? S.end : it.d1);
      if (b < P.l || a > P.l + P.w) continue;
      const col = (r.legend[it.tk] || ['', '#9ca3af'])[1];
      const x0 = Math.max(a, P.l), x1 = Math.min(b, P.l + P.w), w = x1 - x0;
      ctx.globalAlpha = 0.85; ctx.fillStyle = col; ctx.fillRect(x0, y, Math.max(1, w - 1), h); ctx.globalAlpha = 1;
      if (w > 22) {
        let t = it.name; const m = ctx.measureText(t).width;
        if (m > w - 6) { const n = Math.max(1, Math.floor(t.length * (w - 10) / m)); t = n >= t.length ? t : (n > 1 ? t.slice(0, n) + '…' : ''); }
        if (t) { ctx.fillStyle = '#0b0f14'; ctx.textAlign = 'left'; ctx.fillText(t, x0 + 4, y + h / 2 + 0.5); }
      }
      if (w > 0) S.hits.push({ type: 'office', x: (x0 + x1) / 2, y: y + h / 2, r: 0, ref: { role: r, it }, box: { x: x0, y, w: Math.max(1, w), h } });
    }
    ctx.restore();
  });
}
function officeText(o) {
  const { role, it } = o;
  return { title: `${it.name}`, term: `${it.start} ~ ${it.end || tr('현재')}`, tend: `${role.tend_title}: ${it.label}`, extra: it.extra || '', col: (role.legend[it.tk] || ['', '#9ca3af'])[1] };
}
function showOffice(o, px, py) {
  const t = officeText(o), r = o.role;
  pop.innerHTML = `<h5><i class="cdot" style="background:${esc(t.col)}"></i>${esc(t.title)}</h5><div class="meta">${esc(r.name)} · ${esc(t.term)}</div><div class="body"><b>${esc(t.tend)}</b>${t.extra ? '<br>' + esc(t.extra) : ''}</div><div class="meta">${tr('출처:')} <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.source)}</a></div><div class="meta warn">⚠ ${esc(String(r.caution).replace(/^⚠\s*/, ''))}</div><div class="btns"><button class="btn" data-a="x">${tr('닫기')}</button></div>`;
  pop.querySelector('[data-a=x]').onclick = closePop; placePop(px, py);
}

function noteVisible(n) { return n.scope === 'timeline' || S.visible.includes(n.series_id); }
function noteDisplay(n) { return S.notesMode === 'own' ? n.display : S.notesMode; }
function truncate(s, k) { s = s.replace(/\s+/g, ' ').trim(); return s.length > k ? s.slice(0, k - 1) + '…' : s; }

function drawLaneAndNotes(items, ax) {
  const P = S.P, laneY = P.b + P.ev / 2 + 1;
  drawOffices();
  // 사건
  if (S.showEvents) {
    ctx.fillStyle = css.event;
    for (const e of S.events) {
      const x = xOf(e.day); if (x < P.l - 3 || x > P.l + P.w + 3) continue;
      ctx.beginPath(); ctx.moveTo(x, laneY - 5); ctx.lineTo(x + 4, laneY); ctx.lineTo(x, laneY + 5); ctx.lineTo(x - 4, laneY); ctx.closePath(); ctx.fill();
      S.hits.push({ type: 'event', x, y: laneY, r: 7, ref: e });
    }
  }
  // 메모
  const placed = [];
  const notes = S.notes.filter(noteVisible).map((n) => ({ n, day: isoToDay(n.date) })).sort((a, b) => a.day - b.day);
  for (const { n, day } of notes) {
    const x = xOf(day); if (x < P.l - 6 || x > P.l + P.w + 6) continue;
    let y = laneY, color = css.note;
    if (n.scope === 'series') {
      const it = items.find((q) => q.s.id === n.series_id); if (!it) continue;
      const i = lastLE(it.s.t, day); if (i < 0) continue;
      y = ax[it.axis].toY(it.s.v[i] / it.base); color = it.s.color;
      if (y < P.t || y > P.b) continue;
    }
    if (n.color) color = n.color;
    const mode = noteDisplay(n);
    ctx.fillStyle = color; ctx.strokeStyle = css.bg; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.stroke(); ctx.fill(); ctx.lineWidth = 1;
    S.hits.push({ type: 'note', x, y, r: 8, ref: n });
    if (mode === 'label') {
      const txt = truncate(n.body, 22); ctx.font = '12px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      const w = ctx.measureText(txt).width + 12, h = 20; let bx = Math.min(Math.max(x - w / 2, P.l), P.l + P.w - w), by = n.scope === 'series' ? y - 28 : P.b - 30;
      for (let k = 0; k < 8; k++) { if (placed.some((r) => bx < r.x + r.w + 2 && bx + w + 2 > r.x && by < r.y + r.h + 2 && by + h + 2 > r.y)) by -= 22; else break; }
      if (by < P.t) by = P.t;
      placed.push({ x: bx, y: by, w, h });
      ctx.fillStyle = css.bg; ctx.strokeStyle = color; ctx.beginPath(); ctx.rect(bx, by, w, h); ctx.fill(); ctx.stroke();
      ctx.fillStyle = css.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + 6, by + h / 2);
      S.hits.push({ type: 'note', x: bx + w / 2, y: by + h / 2, r: Math.max(w / 2, 10), ref: n, box: { x: bx, y: by, w, h } });
    }
  }
}

function renderChips(list) {
  const box = $('chips'); const sig = list.map((s) => s.id).join('|') + '|' + S.mode + (S.hover ? Math.round(S.hover.d) : '');
  if (box._sig === sig) return; box._sig = sig;
  box.innerHTML = '';
  for (const s of list) {
    const c = document.createElement('span'); c.className = 'chip'; c.style.setProperty('--c', s.color);
    let val = '';
    const d = S.hover ? S.hover.d : S.end; const i = lastLE(s.t, d);
    if (i >= 0 && inCoverage(s, d, i)) val = fmtVal(s.v[i], s.unit);
    c.innerHTML = `<i></i>${esc(s.name)} <em>${esc(val)}</em><button title="${tr('숨기기')}">×</button>`;
    c.querySelector('button').onclick = () => toggleSeries(s.id, false);
    box.appendChild(c);
  }
}

/* =========================================================== 확대/축소/이동 */
function clampView() {
  const PAD = 75; /* 좌우 여백은 고정 약 2.5개월 (기간 비율이 아님) */
  const lo = MIN_DAY - PAD, hi = S.end + PAD;
  let span = S.x1 - S.x0; span = Math.min(Math.max(span, 5), hi - lo);
  if (S.x0 < lo) { S.x0 = lo; S.x1 = lo + span; }
  if (S.x1 > hi) { S.x1 = hi; S.x0 = hi - span; }
}
function zoomAt(anchor, f) { const span = (S.x1 - S.x0) * f; const r = (anchor - S.x0) / (S.x1 - S.x0); S.x0 = anchor - span * r; S.x1 = S.x0 + span; S.rangeKey = ''; clampView(); closePop(); draw(); }
function setRange(key) {
  S.rangeKey = key; closePop();
  if (key === 'max') { S.x0 = MIN_DAY; S.x1 = S.end; }
  else if (key === 'fit') {
    const l = visibleList(); if (l.length) { const a = Math.min(...l.map((s) => s.t[0])), b = Math.max(...l.map((s) => s.t[s.t.length - 1])); const pd = Math.min(75, Math.max(5, (b - a) * 0.03)); S.x0 = a - pd; S.x1 = Math.max(b, S.end) + pd; } else { S.x0 = MIN_DAY; S.x1 = S.end; }
  } else { S.x1 = S.end; S.x0 = S.end - Math.round(key * 365.25); }
  clampView(); draw();
}
function highlightRange() { document.querySelectorAll('#ranges button').forEach((b) => b.classList.toggle('on', b.dataset.k === String(S.rangeKey))); }

/* =========================================================== 마우스/터치 */
const ptrs = new Map(); let drag = null, pinch = null;
cv.addEventListener('wheel', (e) => {
  e.preventDefault(); const r = cv.getBoundingClientRect(); const x = e.clientX - r.left;
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { const dd = (e.deltaX || e.deltaY) / S.P.w * (S.x1 - S.x0); S.x0 += dd; S.x1 += dd; S.rangeKey = ''; clampView(); draw(); return; }
  zoomAt(dOf(x), Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.0022));
}, { passive: false });
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), span: S.x1 - S.x0, mid: dOf((a.x + b.x) / 2 - cv.getBoundingClientRect().left) }; drag = null; return; }
  drag = { x: e.clientX, y: e.clientY, x0: S.x0, x1: S.x1, moved: false, id: e.pointerId };
});
cv.addEventListener('pointermove', (e) => {
  const r = cv.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y); const span = pinch.span * pinch.dist / Math.max(20, dist); const rr = (pinch.mid - S.x0) / (S.x1 - S.x0); S.x0 = pinch.mid - span * rr; S.x1 = S.x0 + span; S.rangeKey = ''; clampView(); draw(); return; }
  if (drag && e.pointerId === drag.id) {
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4 || Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
    if (drag.moved) { const dd = -dx / S.P.w * (drag.x1 - drag.x0); S.x0 = drag.x0 + dd; S.x1 = drag.x1 + dd; S.rangeKey = ''; clampView(); cv.style.cursor = 'grabbing'; hideTip(); draw(); return; }
  }
  if (e.pointerType === 'touch') return;
  hover(px, py);
});
cv.addEventListener('pointerup', (e) => {
  const r = cv.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  cv.style.cursor = 'crosshair';
  if (drag && e.pointerId === drag.id) { const moved = drag.moved; drag = null; if (!moved) onClick(px, py); }
});
cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
cv.addEventListener('pointerleave', () => { if (!drag) { S.hover = null; hideTip(); draw(); } });

function hitAt(px, py) { let best = null, bd = 1e9; for (const h of S.hits) { const d = h.box && px >= h.box.x && px <= h.box.x + h.box.w && py >= h.box.y && py <= h.box.y + h.box.h ? 0 : Math.hypot(px - h.x, py - h.y); if (d <= h.r && d < bd) { best = h; bd = d; } } return best; }

function hover(px, py) {
  const P = S.P; if (!P) return;
  const inPlot = px >= P.l && px <= P.l + P.w && py >= P.t && py <= P.b + P.lane;
  if (!inPlot) { S.hover = null; hideTip(); draw(); return; }
  S.hover = { x: px, d: dOf(px) };
  const hit = hitAt(px, py);
  cv.style.cursor = hit ? 'pointer' : 'crosshair';
  const tip = $('tip');
  if (hit) {
    if (hit.type === 'event') { const e = hit.ref; tip.innerHTML = `<div class="d">${esc(e.date)} · ${esc(e.title)}</div><div class="t">${esc(e.desc || '')}</div><div class="r"><small class="warn">${tr('⚠ 연도·날짜는 검증 필요')}</small></div>`; }
    else if (hit.type === 'office') { const t = officeText(hit.ref); tip.innerHTML = `<div class="d">${esc(hit.ref.role.name)} · ${esc(t.title)}</div><div class="r"><i style="--c:${t.col}"></i><span>${esc(t.tend)}</span></div><div class="t">${esc(t.term)}${t.extra ? '<br>' + esc(t.extra) : ''}</div><div class="r"><small class="warn">${tr('⚠ 성향 분류는 해석이 들어간 요약 · 클릭하면 출처')}</small></div>`; }
    else { const n = hit.ref; tip.innerHTML = `<div class="d">${esc(n.date)} ${tr('· 메모')}</div><div class="t">${esc(truncate(n.body, 90))}</div><div class="r"><small>${tr('클릭하면 수정·삭제')}</small></div>`; }
  } else {
    const rows = []; const dd = Math.round(S.hover.d);
    for (const it of S.view.items) {
      const i = lastLE(it.s.t, dd); if (i < 0 || !inCoverage(it.s, dd, i)) continue;
      const v = it.s.v[i]; let txt = fmtVal(v, it.s.unit); if (S.view.rebase) txt += ` (${(v / it.base).toFixed(1)})`;
      const when = it.s.t[i] !== dd ? ` <small>· ${fmtDateFor(it.s, it.s.t[i])}</small>` : '';
      rows.push(`<div class="r"><i style="--c:${it.s.color}"></i><span>${esc(it.s.name)}${when}</span><b>${esc(txt)}</b></div>`);
    }
    tip.innerHTML = `<div class="d">${dayToISO(dd)}</div>` + (rows.join('') || `<div class="r"><small>${tr('이 날짜의 값이 없습니다')}</small></div>`);
  }
  tip.style.display = 'block';
  const tw = tip.offsetWidth, th = tip.offsetHeight; let tx = px + 16, ty = py + 14; if (tx + tw > W - 4) tx = px - tw - 16; if (ty + th > H - 4) ty = H - th - 4; if (ty < 4) ty = 4;
  tip.style.left = tx + 'px'; tip.style.top = ty + 'px';
  draw();
}
function hideTip() { $('tip').style.display = 'none'; }

/* =========================================================== 팝오버 (메모 추가/보기/수정/삭제) */
const pop = $('pop');
function closePop() { pop.style.display = 'none'; pop.innerHTML = ''; pop._open = false; }
function placePop(px, py) { pop.style.display = 'block'; const w = pop.offsetWidth, h = pop.offsetHeight; let x = px + 12, y = py + 12; if (x + w > W - 6) x = px - w - 12; if (x < 6) x = 6; if (y + h > H - 6) y = H - h - 6; if (y < 6) y = 6; pop.style.left = x + 'px'; pop.style.top = y + 'px'; pop._open = true; }
function flash(msg) { const n = $('notice'); n.textContent = msg; setTimeout(() => { if (n.textContent === msg) draw(); }, 4000); }

function onClick(px, py) {
  const P = S.P; closePop();
  const hit = hitAt(px, py);
  if (hit) { hideTip(); if (hit.type === 'note') return showNote(hit.ref, px, py); if (hit.type === 'office') return showOffice(hit.ref, px, py); return showEvent(hit.ref, px, py); }
  if (px < P.l || px > P.l + P.w || py < P.t || py > P.b + P.lane) return;
  hideTip();
  const day = Math.round(dOf(px));
  pop.innerHTML = `<h5>${dayToISO(day)}</h5><div class="meta">${tr('이 날짜에 메모를 남길 수 있어요.')}</div><div class="btns"><button class="btn" data-a="x">${tr('닫기')}</button><button class="btn p" data-a="add">${tr('메모 추가하기')}</button></div>`;
  pop.querySelector('[data-a=x]').onclick = closePop;
  pop.querySelector('[data-a=add]').onclick = () => { if (!store()) { closePop(); return openAuth(tr('메모는 로그인 후 사용할 수 있어요.')); } editNote(null, day, px, py, py < P.b ? yToValueInfo(py) : null); };
  placePop(px, py);
}
// 클릭한 높이에서 가장 가까운 선(표시 중인 지표) 찾기
function yToValueInfo(py) { return null; }

function showEvent(e, px, py) {
  pop.innerHTML = `<h5>${esc(e.title)}</h5><div class="meta">${esc(e.date)}</div><div class="body">${esc(e.desc || '')}</div><div class="meta warn">${tr('⚠ 연도·날짜는 직접 검증이 필요합니다.')}</div><div class="btns"><button class="btn" data-a="x">${tr('닫기')}</button></div>`;
  pop.querySelector('[data-a=x]').onclick = closePop; placePop(px, py);
}
function seriesName(id) { const m = id && metaOf(id); return m ? m.name : (id || ''); }
function showNote(n, px, py) {
  pop.innerHTML = `<h5>${n.color ? `<i class="cdot" style="background:${esc(n.color)}"></i>` : ''}${esc(n.date)} ${tr('메모')}</h5><div class="meta">${tr('저장 위치:')} ${n.scope === 'series' ? tr('지표 · ') + esc(seriesName(n.series_id)) : tr('연표(항상 표시)')} ${tr('· 표시:')} ${n.display === 'dot' ? tr('점') : tr('글씨')}</div><div class="body">${esc(n.body)}</div><div class="btns"><button class="btn d" data-a="del">${tr('삭제')}</button><button class="btn" data-a="edit">${tr('수정')}</button><button class="btn" data-a="x">${tr('닫기')}</button></div>`;
  pop.querySelector('[data-a=x]').onclick = closePop;
  pop.querySelector('[data-a=edit]').onclick = () => editNote(n, isoToDay(n.date), px, py);
  pop.querySelector('[data-a=del]').onclick = () => {
    pop.querySelector('.btns').innerHTML = `<span class="meta" style="margin-right:auto">${tr('정말 삭제할까요?')}</span><button class="btn" data-a="no">${tr('아니요')}</button><button class="btn d" data-a="yes">${tr('삭제')}</button>`;
    pop.querySelector('[data-a=no]').onclick = () => showNote(n, px, py);
    pop.querySelector('[data-a=yes]').onclick = async () => { try { await store().remove(n.id); S.notes = S.notes.filter((x) => x.id !== n.id); closePop(); draw(); } catch (e) { alert(tr('삭제하지 못했습니다: ') + (e.message || e)); } };
  };
  placePop(px, py);
}
function editNote(n, day, px, py) {
  const date = dayToISO(day);
  // 이 날짜에 값이 있는 표시 중 지표 후보
  const cands = visibleList().filter((s) => { const i = lastLE(s.t, day); return i >= 0 && inCoverage(s, day, i); });
  const cur = n && n.scope === 'series' ? n.series_id : (cands[0] && cands[0].id);
  const scope = n ? n.scope : 'timeline';
  const display = n ? n.display : 'dot';
  pop.innerHTML = `<h5>${n ? tr('메모 수정') : tr('메모 추가')} · ${date}</h5>
    <textarea maxlength="4000" placeholder="${tr('이 시점에 일어난 일, 헷갈리는 점 등을 적어 두세요')}"></textarea>
    <div class="f"><b>${tr('저장 위치')}</b><br>
      <label><input type="radio" name="sc" value="timeline" ${scope === 'timeline' ? 'checked' : ''}> ${tr('연표 (항상 보임)')}</label>
      <label><input type="radio" name="sc" value="series" ${scope === 'series' ? 'checked' : ''} ${cands.length || (n && n.scope === 'series') ? '' : 'disabled'}> ${tr('특정 지표와 함께')}</label>
      <select id="scSel">${(n && n.scope === 'series' && !cands.find((c) => c.id === n.series_id) ? [{ id: n.series_id, name: seriesName(n.series_id) }] : []).concat(cands).map((s) => `<option value="${esc(s.id)}" ${s.id === cur ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    </div>
    <div class="f"><b>${tr('표시 방식')}</b><br>
      <label><input type="radio" name="dp" value="dot" ${display === 'dot' ? 'checked' : ''}> ${tr('작은 점 (클릭하면 보임)')}</label>
      <label><input type="radio" name="dp" value="label" ${display === 'label' ? 'checked' : ''}> ${tr('글씨로 항상 표시')}</label>
    </div>
    <div class="f"><b>${tr('색상')}</b><div class="swatches" id="noteColors">${colorPickerHtml(n ? n.color : null)}</div></div>
    <div class="err" id="perr"></div>
    <div class="btns"><button class="btn" data-a="x">${tr('취소')}</button><button class="btn p" data-a="ok">${tr('저장')}</button></div>`;
  const ta = pop.querySelector('textarea'); ta.value = n ? n.body : '';
  bindColorPicker(pop.querySelector('#noteColors'));
  const sel = pop.querySelector('#scSel'); const sync = () => { sel.style.display = pop.querySelector('[name=sc]:checked').value === 'series' ? 'block' : 'none'; }; pop.querySelectorAll('[name=sc]').forEach((r) => r.onchange = sync); sync();
  pop.querySelector('[data-a=x]').onclick = closePop;
  pop.querySelector('[data-a=ok]').onclick = async (ev) => {
    const body = ta.value.trim(); if (!body) { pop.querySelector('#perr').textContent = tr('메모 내용을 입력하세요.'); return; }
    const sc = pop.querySelector('[name=sc]:checked').value, dp = pop.querySelector('[name=dp]:checked').value;
    const sid = sc === 'series' ? sel.value : null; if (sc === 'series' && !sid) { pop.querySelector('#perr').textContent = tr('지표를 선택하세요.'); return; }
    let value = null; if (sid) { const d = S.data.get(sid); if (d) { const i = lastLE(d.t, day); if (i >= 0) value = d.v[i]; } }
    const payload = { date, value, body, scope: sc, series_id: sid, display: dp, color: pickedColor(pop.querySelector('#noteColors')) };
    ev.target.disabled = true;
    try {
      if (n) { const u = await store().update(n.id, payload); S.notes = S.notes.map((x) => x.id === n.id ? u : x); }
      else { const a = await store().add(payload); S.notes.push(a); }
      closePop(); draw();
    } catch (e) { ev.target.disabled = false; pop.querySelector('#perr').textContent = tr('저장하지 못했습니다: ') + (e.message || e); }
  };
  placePop(px, py); ta.focus();
}

/* =========================================================== 사이드바 */
function buildSide() {
  const box = $('series-list'); box.innerHTML = '';
  const q = $('search').value.trim().toLowerCase();
  for (const [gk, gname] of GROUPS) {
    const g = document.createElement('div'); g.className = 'grp'; g.innerHTML = `<h4>${gname}</h4>`;
    let any = false;
    if (gk === 'fx') {
      for (const [b, qc] of S.pairs) { const id = pairId(b, qc); const m = metaOf(id); if (q && !m.name.toLowerCase().includes(q) && !tr('환율').includes(q)) continue; g.appendChild(rowEl(m, id)); any = true; }
      g.appendChild(pairForm());
      any = true;
    } else {
      for (const m of S.manifest.series.filter((s) => s.group === gk && !s.hidden).sort((a, b) => a.order - b.order)) {
        if (q && !m.name.toLowerCase().includes(q)) continue; g.appendChild(rowEl(m, m.id)); any = true;
      }
    }
    if (any) box.appendChild(g);
  }
  if (S.offices && (!q || tr('임기 대통령 의장 장관 성향').includes(q) || S.offices.roles.some((r) => r.name.includes(q)))) {
    const g = document.createElement('div'); g.className = 'grp'; g.innerHTML = `<h4>${tr('임기 · 성향 (차트 아래 띠)')}</h4>`;
    for (const r of S.offices.roles) {
      const on = S.offOn.includes(r.id);
      const row = document.createElement('div'); row.className = 'row' + (on ? ' on' : ''); row.style.setProperty('--c', '#9ca3af'); row.title = r.source;
      const lg = Object.values(r.legend).map(([n, c]) => `<span class="lg"><i style="background:${c}"></i>${esc(n)}</span>`).join('');
      row.innerHTML = `<div class="sw"></div><div class="nm"><b>${esc(r.name)}</b><small>${tr('성향 =')} ${esc(r.tend_title)}</small><div class="lgs">${lg}</div></div><div class="tools"><span class="warn" title="${esc('⚠ ' + String(r.caution).replace(/^⚠\s*/, ''))}">⚠</span><a href="${esc(r.url)}" target="_blank" rel="noopener" title="${esc(tr('출처: ') + r.source)}">ⓘ</a></div>`;
      row.addEventListener('click', (e) => { if (e.target.closest('a')) return; S.offOn = on ? S.offOn.filter((x) => x !== r.id) : S.offOn.concat(r.id); savePrefs(); closePop(); buildSide(); draw(); });
      g.appendChild(row);
    }
    box.appendChild(g);
  }
}
function rowEl(m, id) {
  const has = m.isPair ? pairAvailable(m) : !!m.n;
  const on = S.visible.includes(id);
  const r = document.createElement('div'); r.className = 'row' + (on ? ' on' : '') + (has ? '' : ' off'); r.style.setProperty('--c', colorFor(id)); r.dataset.id = id;
  let span = '';
  if (m.isPair) { const A = m.base === 'USD' ? null : S.manifest.series.find((s) => s.id === 'fx_' + m.base), B = m.quote === 'USD' ? null : S.manifest.series.find((s) => s.id === 'fx_' + m.quote); const st = [A, B].filter(Boolean).map((x) => x.start).filter(Boolean).sort().pop(); span = (st ? st.slice(0, 4) + '~ · ' : '') + tr('일별'); }
  else span = m.n ? `${m.start.slice(0, 4)} ~ ${m.end.slice(0, 4)} · ${FREQ[m.freq] || m.freq}` : tr('데이터 없음');
  const warnTxt = m.caution ? `⚠ ${m.caution}` : '';
  const tools = [];
  if (m.caution) tools.push(`<span class="warn" title="${esc(warnTxt)}">⚠</span>`);
  tools.push(`<a href="${esc(m.url || '#')}" target="_blank" rel="noopener" title="${esc(tr('출처: ') + (m.source || '') + (m.detail ? tr('\n사용한 자료: ') + m.detail : ''))}">ⓘ</a>`);
  if (m.isPair) tools.push(`<button data-x title="${tr('이 환율 지우기')}">×</button>`);
  r.innerHTML = `<div class="sw"></div><div class="nm"><b>${esc(m.name)}</b><small>${esc(span)}${!has && m.status && m.status !== 'ok' ? ' · ' + esc(m.status) : ''}</small></div><div class="tools">${tools.join('')}</div>`;
  r.title = m.source || '';
  r.addEventListener('click', (e) => { if (e.target.closest('a')) return; if (e.target.closest('[data-x]')) { S.pairs = S.pairs.filter(([b, q]) => pairId(b, q) !== id); S.visible = S.visible.filter((x) => x !== id); savePrefs(); buildSide(); draw(); return; } if (!has) return; toggleSeries(id); });
  return r;
}
function pairAvailable(m) { const need = [m.base, m.quote].filter((c) => c !== 'USD').map((c) => 'fx_' + c); return need.every((id) => { const s = S.manifest.series.find((x) => x.id === id); return s && s.n; }); }
function pairForm() {
  const f = document.createElement('div');
  const opts = (sel) => Object.keys(CUR).map((c) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${CUR[c][0]} (${c})</option>`).join('');
  f.innerHTML = `<div class="pair-form"><select id="pfB">${opts('USD')}</select><span>${tr('1당 →')}</span><select id="pfQ">${opts('KRW')}</select><button id="pfAdd">${tr('추가')}</button></div><div class="pair-help">${tr('예: 1달러당 몇 유로, 1엔당 몇 원')}</div>`;
  f.querySelector('#pfAdd').onclick = () => {
    const b = f.querySelector('#pfB').value, q = f.querySelector('#pfQ').value; if (b === q) return flash(tr('같은 통화끼리는 환율을 만들 수 없어요.'));
    if (!S.pairs.some(([x, y]) => x === b && y === q)) S.pairs.push([b, q]);
    savePrefs(); buildSide(); toggleSeries(pairId(b, q), true);
  };
  return f;
}
async function toggleSeries(id, force) {
  const on = force === undefined ? !S.visible.includes(id) : force;
  if (on) {
    if (!S.visible.includes(id)) S.visible.push(id);
    document.querySelector(`.row[data-id="${CSS.escape(id)}"]`)?.classList.add('on');
    const d = await ensure(id);
    if (!d) { S.visible = S.visible.filter((x) => x !== id); flash(tr('이 지표의 데이터를 불러오지 못했습니다.')); }
  } else S.visible = S.visible.filter((x) => x !== id);
  savePrefs(); buildSide(); if (on && S.rangeKey === 'fit') setRange('fit'); else draw();
}

/* =========================================================== 로그인 */
const modal = $('modal');
function closeModal() { modal.hidden = true; modal.innerHTML = ''; }
modal.addEventListener('mousedown', (e) => { if (e.target === modal) closeModal(); });
function authErr(m) {
  m = String(m || '');
  if (/Invalid login/i.test(m)) return tr('이메일 또는 비밀번호가 맞지 않습니다.');
  if (/already registered|already been registered/i.test(m)) return tr('이미 가입된 이메일입니다. 로그인해 주세요.');
  if (/at least 6/i.test(m)) return tr('비밀번호는 6자 이상이어야 합니다.');
  if (/not confirmed/i.test(m)) return tr('이메일 확인이 아직 안 됐습니다. 받은편지함의 확인 메일을 눌러 주세요.');
  if (/rate limit/i.test(m)) return tr('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  if (/valid email|invalid format|Unable to validate email/i.test(m)) return tr('이메일 형식을 확인해 주세요.');
  return m;
}
function openAuth(msg) {
  modal.hidden = false;
  if (!sb) { modal.innerHTML = `<div class="card"><h3>${tr('로그인')}</h3><div class="msg">${tr('로그인 기능을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.')}</div><div class="btns"><button class="btn" id="mc">${tr('닫기')}</button></div></div>`; $('mc').onclick = closeModal; return; }
  if (S.user) {
    modal.innerHTML = `<div class="card"><h3>${tr('내 계정')}</h3><div class="msg">${esc(S.user.email)} ${tr('로 로그인되어 있습니다.\n메모는 이 계정에만 저장되고, 어느 기기에서 로그인해도 같이 보입니다.')}</div><div class="btns"><button class="btn" id="mc">${tr('닫기')}</button><button class="btn d" id="mo">${tr('로그아웃')}</button></div></div>`;
    $('mc').onclick = closeModal; $('mo').onclick = async () => { await sb.auth.signOut(); closeModal(); }; return;
  }
  modal.innerHTML = `<div class="card"><h3>${tr('로그인 / 회원가입')}</h3>${msg ? `<div class="msg" style="margin:0 0 10px">${esc(msg)}</div>` : ''}
    <label class="fld">${tr('이메일')}<input id="ae" type="email" autocomplete="email"></label>
    <label class="fld">${tr('비밀번호 (6자 이상)')}<input id="ap" type="password" autocomplete="current-password"></label>
    <div class="err" id="aerr"></div><div class="msg" id="ainfo"></div>
    <div class="btns"><button class="btn" id="mc">${tr('닫기')}</button><button class="btn" id="asu">${tr('회원가입')}</button><button class="btn p" id="asi">${tr('로그인')}</button></div></div>`;
  $('mc').onclick = closeModal;
  const run = async (kind) => {
    const email = $('ae').value.trim(), password = $('ap').value; $('aerr').textContent = ''; $('ainfo').textContent = '';
    if (!email || !password) { $('aerr').textContent = tr('이메일과 비밀번호를 입력하세요.'); return; }
    $('asi').disabled = $('asu').disabled = true;
    try {
      if (kind === 'in') { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; closeModal(); }
      else { const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }); if (error) throw error; if (data.session) closeModal(); else $('ainfo').textContent = tr('확인 메일을 보냈습니다.\n메일의 링크를 누른 뒤 다시 와서 로그인해 주세요.'); }
    } catch (e) { $('aerr').textContent = authErr(e.message); }
    $('asi').disabled = $('asu').disabled = false;
  };
  $('asi').onclick = () => run('in'); $('asu').onclick = () => run('up');
  $('ap').addEventListener('keydown', (e) => { if (e.key === 'Enter') run('in'); });
  $('ae').focus();
}
function updateAuthBtn() { const b = $('btnAuth'); b.textContent = FORCE_LOCAL ? tr('로컬 모드') : S.user ? (S.user.email.split('@')[0]) : tr('로그인'); b.classList.toggle('primary', !S.user && !FORCE_LOCAL); }

/* =========================================================== 색상 선택 (메모·지식 노트 공용) */
function colorPickerHtml(cur) {
  const none = `<label class="sw-c none" title="${tr('자동 (기본 색)')}"><input type="radio" name="ncol" value="" ${cur ? '' : 'checked'}><span>${tr('자동')}</span></label>`;
  return none + NOTE_COLORS.map((c) => `<label class="sw-c" title="${c}"><input type="radio" name="ncol" value="${c}" ${cur === c ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('');
}
function bindColorPicker() { /* 라디오 버튼이라 따로 연결할 것이 없음 */ }
function pickedColor(box) { const r = box && box.querySelector('input[name=ncol]:checked'); return r && r.value ? r.value : null; }

/* =========================================================== 지식 노트 (차트와 별개로 책에서 읽은 내용 정리) */
const KLocal = {
  async list() { return lsGet('fc_know_local', []); },
  async add(n) { const all = lsGet('fc_know_local', []); const now = new Date().toISOString(); const x = { ...n, id: 'k' + Date.now() + Math.random().toString(36).slice(2, 6), created_at: now, updated_at: now }; all.push(x); lsSet('fc_know_local', all); return x; },
  async update(id, p) { const all = lsGet('fc_know_local', []); const i = all.findIndex((x) => x.id === id); if (i >= 0) all[i] = { ...all[i], ...p, updated_at: new Date().toISOString() }; lsSet('fc_know_local', all); return all[i]; },
  async remove(id) { lsSet('fc_know_local', lsGet('fc_know_local', []).filter((x) => x.id !== id)); },
};
const kFrom = (r) => ({ id: r.id, title: r.title, body: r.body || '', source: r.source || '', ref_date: r.ref_date || '', color: r.color || null, created_at: r.created_at, updated_at: r.updated_at });
const kTo = (n) => ({ title: n.title, body: n.body || '', source: n.source || null, ref_date: n.ref_date || null, color: n.color || null });
const KRemote = {
  async list() { const { data, error } = await sb.from('knowledge_notes').select('*').order('created_at', { ascending: false }); if (error) throw error; return data.map(kFrom); },
  async add(n) { const { data, error } = await sb.from('knowledge_notes').insert(kTo(n)).select().single(); if (error) throw error; return kFrom(data); },
  async update(id, p) { const { data, error } = await sb.from('knowledge_notes').update(kTo(p)).eq('id', id).select().single(); if (error) throw error; return kFrom(data); },
  async remove(id) { const { error } = await sb.from('knowledge_notes').delete().eq('id', id); if (error) throw error; },
};
function kstore() { return FORCE_LOCAL ? KLocal : (sb && S.user ? KRemote : null); }
async function loadKnowledge() {
  const st = kstore();
  if (!st) { S.know = []; return; }
  try { S.know = await st.list(); } catch (e) { console.warn(e); S.know = []; flash(tr('지식 노트를 불러오지 못했습니다: ') + (e.message || e)); }
}
// 입력 "1602" / "1602-03" / "1602-03-20" → "YYYY-MM-DD" (잘못된 형식이면 null)
function normRefDate(s) {
  s = (s || '').trim(); if (!s) return '';
  let m = s.match(/^(\d{4})$/); if (m) return `${m[1]}-01-01`;
  m = s.match(/^(\d{4})[-.](\d{1,2})$/); if (m) return `${m[1]}-${pad2(+m[2])}-01`;
  m = s.match(/^(\d{4})[-.](\d{1,2})[-.](\d{1,2})$/); if (m) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); if (d.getUTCMonth() === +m[2] - 1) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`; }
  return null;
}
const showRef = (d) => (d ? (d.endsWith('-01-01') ? d.slice(0, 4) + tr('년') : d) : '');
let kQuery = '';

async function openKnowledge() {
  modal.hidden = false;
  const st = kstore();
  if (!st) { modal.innerHTML = `<div class="card"><h3>${tr('지식 노트')}</h3><div class="msg">${tr('책에서 읽은 내용을 적어 두는 공간입니다.\n로그인하면 사용할 수 있어요.')}</div><div class="btns"><button class="btn" id="mc">${tr('닫기')}</button><button class="btn p" id="ml">${tr('로그인')}</button></div></div>`; $('mc').onclick = closeModal; $('ml').onclick = () => openAuth(); return; }
  if (!S.know) await loadKnowledge();
  renderKnowledgeList();
}
function renderKnowledgeList() {
  const q = kQuery.trim().toLowerCase();
  const all = S.know || [];
  const items = all.filter((n) => !q || (n.title + ' ' + n.body + ' ' + n.source).toLowerCase().includes(q));
  modal.innerHTML = `<div class="card wide"><h3>${tr('지식 노트 (')}${all.length})</h3>
    <div class="kbar"><input id="kq" type="search" placeholder="${tr('제목·내용·출처 검색')}" value="${esc(kQuery)}"><button class="btn p" id="kadd">${tr('+ 새 노트')}</button></div>
    ${items.length ? '<ul class="kl">' + items.map((n, i) => `<li data-i="${i}" style="--kc:${esc(n.color || 'var(--line)')}"><b>${esc(n.title)}</b><small>${[n.source && '📖 ' + esc(n.source), n.ref_date && '🕒 ' + esc(showRef(n.ref_date))].filter(Boolean).join(' · ')}</small>${n.body ? `<span>${esc(truncate(n.body, 140))}</span>` : ''}</li>`).join('') + '</ul>' : `<div class="msg">${all.length ? tr('검색 결과가 없습니다.') : tr('아직 노트가 없습니다. "+ 새 노트"로 책에서 읽은 내용을 적어 보세요.')}</div>`}
    <div class="btns"><button class="btn" id="mc">${tr('닫기')}</button></div></div>`;
  $('mc').onclick = closeModal;
  const kq = $('kq'); kq.oninput = () => { kQuery = kq.value; const pos = kq.selectionStart; renderKnowledgeList(); const k2 = $('kq'); k2.focus(); k2.setSelectionRange(pos, pos); };
  $('kadd').onclick = () => editKnowledge(null);
  modal.querySelectorAll('.kl li').forEach((li) => li.onclick = () => editKnowledge(items[+li.dataset.i]));
}
function editKnowledge(n) {
  modal.innerHTML = `<div class="card wide"><h3>${n ? tr('노트 수정') : tr('새 노트')}</h3>
    <label class="fld">${tr('제목')}<input id="kt" type="text" maxlength="200" placeholder="${tr('예: 튤립 버블의 진짜 규모는?')}"></label>
    <label class="fld">${tr('출처 (책 이름·쪽수 등, 선택)')}<input id="ks" type="text" maxlength="300" placeholder="${tr('예: 〈광기, 패닉, 붕괴〉 2장 p.45')}"></label>
    <label class="fld">${tr('관련 연도·날짜 (선택, 예: 1637 또는 1637-02-03)')}<input id="kd" type="text" maxlength="12" placeholder="1637"></label>
    <div class="fld">${tr('색상')}<div class="swatches" id="kc">${colorPickerHtml(n ? n.color : null)}</div></div>
    <label class="fld">${tr('내용')}<textarea id="kb" maxlength="20000" placeholder="${tr('책에서 읽은 내용, 내 생각, 헷갈리는 점을 자유롭게 적어 두세요')}"></textarea></label>
    <div class="err" id="kerr"></div>
    <div class="btns">${n ? `<button class="btn d" id="kdel">${tr('삭제')}</button>` : ''}${n && n.ref_date ? `<button class="btn" id="kgo">${tr('연표에서 보기')}</button>` : ''}<button class="btn" id="kx">${tr('목록으로')}</button><button class="btn p" id="kok">${tr('저장')}</button></div></div>`;
  $('kt').value = n ? n.title : ''; $('ks').value = n ? n.source : ''; $('kd').value = n && n.ref_date ? (n.ref_date.endsWith('-01-01') ? n.ref_date.slice(0, 4) : n.ref_date) : ''; $('kb').value = n ? n.body : '';
  $('kx').onclick = renderKnowledgeList;
  if (n && n.ref_date) $('kgo').onclick = () => { const d = isoToDay(n.ref_date); const span = Math.max(S.x1 - S.x0, 365); S.x0 = d - span / 2; S.x1 = d + span / 2; S.rangeKey = ''; clampView(); closeModal(); draw(); };
  if (n) $('kdel').onclick = () => {
    const b = modal.querySelector('.btns'); b.innerHTML = `<span class="meta" style="margin-right:auto">${tr('정말 삭제할까요?')}</span><button class="btn" id="kno">${tr('아니요')}</button><button class="btn d" id="kyes">${tr('삭제')}</button>`;
    $('kno').onclick = () => editKnowledge(n);
    $('kyes').onclick = async () => { try { await kstore().remove(n.id); S.know = S.know.filter((x) => x.id !== n.id); renderKnowledgeList(); } catch (e) { $('kerr').textContent = tr('삭제하지 못했습니다: ') + (e.message || e); } };
  };
  $('kok').onclick = async (ev) => {
    const title = $('kt').value.trim(); if (!title) { $('kerr').textContent = tr('제목을 입력하세요.'); return; }
    const rd = normRefDate($('kd').value); if (rd === null) { $('kerr').textContent = tr('날짜 형식을 확인하세요. 예: 1637 또는 1637-02-03'); return; }
    const payload = { title, body: $('kb').value, source: $('ks').value.trim(), ref_date: rd, color: pickedColor($('kc')) };
    ev.target.disabled = true;
    try {
      if (n) { const u = await kstore().update(n.id, payload); S.know = S.know.map((x) => x.id === n.id ? u : x); }
      else { const a = await kstore().add(payload); S.know = [a, ...(S.know || [])]; }
      renderKnowledgeList();
    } catch (e) { ev.target.disabled = false; $('kerr').textContent = tr('저장하지 못했습니다: ') + (e.message || e); }
  };
  $('kt').focus();
}

/* =========================================================== 메모 목록 */
function openNotesList() {
  modal.hidden = false;
  const st = store();
  if (!st) { modal.innerHTML = `<div class="card"><h3>${tr('메모 목록')}</h3><div class="msg">${tr('로그인하면 내 메모가 여기에 나타납니다.')}</div><div class="btns"><button class="btn" id="mc">${tr('닫기')}</button><button class="btn p" id="ml">${tr('로그인')}</button></div></div>`; $('mc').onclick = closeModal; $('ml').onclick = () => openAuth(); return; }
  const items = [...S.notes].sort((a, b) => a.date.localeCompare(b.date));
  modal.innerHTML = `<div class="card wide"><h3>${tr('메모 목록 (')}${items.length})</h3>${items.length ? '<ul class="nl">' + items.map((n, i) => `<li data-i="${i}">${n.color ? `<i class="cdot" style="background:${esc(n.color)}"></i>` : ''}<b>${esc(n.date)}</b> · ${esc(truncate(n.body, 80))}<small>${n.scope === 'series' ? tr('지표 · ') + esc(seriesName(n.series_id)) : tr('연표')}</small></li>`).join('') + '</ul>' : `<div class="msg">${tr('아직 메모가 없습니다. 차트를 클릭해서 추가해 보세요.')}</div>`}<div class="btns"><button class="btn" id="mc">${tr('닫기')}</button></div></div>`;
  $('mc').onclick = closeModal;
  modal.querySelectorAll('li').forEach((li) => li.onclick = () => {
    const n = items[+li.dataset.i]; const d = isoToDay(n.date); if (n.scope === 'series' && !S.visible.includes(n.series_id)) toggleSeries(n.series_id, true);
    const span = S.x1 - S.x0; S.x0 = d - span / 2; S.x1 = d + span / 2; S.rangeKey = ''; clampView(); closeModal(); draw();
  });
}

/* =========================================================== 시작 */
function applyTheme() { document.documentElement.dataset.theme = S.theme; draw(); }
async function init() {
  await I18N.ready; I18N.applyStatic();
  const lg = $('lang'); if (lg) { lg.value = I18N.lang; lg.onchange = () => I18N.setLang(lg.value); }
  // 화면 요소 연결
  const rb = $('ranges'); RANGES.forEach(([label, key]) => { const b = document.createElement('button'); b.textContent = label; b.dataset.k = String(key); b.onclick = () => setRange(key); rb.appendChild(b); });
  $('zoomIn').onclick = () => zoomAt((S.x0 + S.x1) / 2, 0.7);
  $('zoomOut').onclick = () => zoomAt((S.x0 + S.x1) / 2, 1 / 0.7);
  $('btnTheme').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; savePrefs(); applyTheme(); };
  $('btnAuth').onclick = () => (FORCE_LOCAL ? null : openAuth());
  $('btnNotes').onclick = openNotesList;
  $('btnKnow').onclick = openKnowledge;
  $('btnSide').onclick = () => $('side').classList.toggle('open');
  $('search').oninput = buildSide;
  $('optRebase').checked = S.mode === 'rebase'; $('optRebase').onchange = (e) => { S.mode = e.target.checked ? 'rebase' : 'abs'; savePrefs(); draw(); };
  $('optLog').checked = S.log; $('optLog').onchange = (e) => { S.log = e.target.checked; savePrefs(); draw(); };
  $('optEvents').checked = S.showEvents; $('optEvents').onchange = (e) => { S.showEvents = e.target.checked; savePrefs(); draw(); };
  $('optNotes').value = S.notesMode; $('optNotes').onchange = (e) => { S.notesMode = e.target.value; savePrefs(); draw(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); closeModal(); } });
  document.addEventListener('mousedown', (e) => { if (pop._open && !pop.contains(e.target) && e.target !== cv) closePop(); });
  new ResizeObserver(resize).observe(wrap);
  applyTheme(); resize();

  // 로그인 준비
  if (window.supabase && CFG.SUPABASE_URL && !FORCE_LOCAL) {
    try {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
      const { data } = await sb.auth.getSession(); S.user = data.session ? data.session.user : null;
      sb.auth.onAuthStateChange((_ev, session) => { S.user = session ? session.user : null; updateAuthBtn(); loadNotes(); });
    } catch (e) { console.warn(e); sb = null; }
  }
  updateAuthBtn();

  // 데이터 목록
  const empty = $('empty');
  try {
    const r = await fetch('data/manifest.json?t=' + Date.now()); if (!r.ok) throw new Error(r.status);
    S.manifest = await r.json();
    for (const m of S.manifest.series) { m.name = td(m.name); m.source = td(m.source); if (m.caution) m.caution = td(m.caution); if (m.detail) m.detail = td(m.detail); }
  } catch (e) { empty.style.display = 'flex'; empty.textContent = tr('데이터 파일(data/manifest.json)을 찾을 수 없습니다.\nGitHub의 [Actions] 탭에서 \'데이터 갱신\'을 한 번 실행해 주세요.'); return; }
  S.end = isoToDay(S.manifest.end);
  $('gen').textContent = `${tr('데이터 기준일')} ${S.manifest.end} ${tr('· 갱신')} ${S.manifest.generated.slice(0, 10)}`;
  try { const r = await fetch('events.json'); S.events = (await r.json()).map((e) => ({ ...e, title: td(e.title), desc: td(e.desc || ''), day: isoToDay(e.date) })); } catch (e) { S.events = []; }
  try {
    const r = await fetch('offices.json?v=' + encodeURIComponent(S.manifest.generated || '')); const o = await r.json();
    for (const role of o.roles) {
      role.name = td(role.name); role.tend_title = td(role.tend_title); role.source = td(role.source); if (role.caution) role.caution = td(role.caution);
      for (const k of Object.keys(role.legend)) role.legend[k] = [td(role.legend[k][0]), role.legend[k][1]];
    }
    for (const role of o.roles) role.items = role.items.map(([name, start, end, tk, label, extra]) => ({ name: td(name), start, end, tk, label: td(label), extra: extra ? td(extra) : extra, d0: isoToDay(start), d1: end ? isoToDay(end) : null }));
    S.offices = o;
  } catch (e) { S.offices = null; }
  S.visible = S.visible.filter((id) => !!metaOf(id));
  buildSide();
  S.x0 = MIN_DAY; S.x1 = S.end; draw();
  await Promise.all(S.visible.map(ensure));
  S.visible = S.visible.filter((id) => S.data.has(id));
  buildSide(); draw();
  loadNotes();
}
window.addEventListener('load', init);
window.__fc = { S, setRange, toggleSeries, draw };
})();
