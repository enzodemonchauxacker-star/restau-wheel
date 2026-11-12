'use strict';

const PALETTE = ['#ffd60a', '#ff2d6a', '#00c2ff', '#00e5c8', '#ff8a3d', '#b79cff'];
const DEMO_WHEEL = ['#ffd60a', '#26252b', '#ff2d6a', '#00c2ff', '#26252b', '#00e5c8'].map((color) => ({ color }));
const TABS = [['home', 'Accueil'], ['clients', 'Clients'], ['lots', 'Roue'], ['qr', 'QR'], ['profil', 'Profil']];
const WEEK_LETTERS = 'LMMJVSD';
const WEEK_NAMES = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
const MONTH_LETTERS = 'JFMAMJJASOND';
const MONTH_NAMES = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
const BADGE = {
  pending: ['EN ATTENTE', '#ffd60a', '#0a0a0a'],
  used: ['UTILISÉ', '#00e5c8', '#0a0a0a'],
  expired: ['EXPIRÉ', '#ff2d6a', '#0a0a0a'],
  lose: ['PERDU', 'var(--card2)', 'var(--muted)'],
};

const S = {
  authed: false,
  ob: 0,
  resto: '',
  tab: 'home',
  navDir: 1,
  period: 'week',
  day: null,
  q: '',
  filter: 'all',
  customers: [],
  clientId: null,
  prizes: [],
  covers: 100,
  gifts: 15,
  cooldown: 24,
  mailWin: true,
  mailLose: false,
  emailMeta: { email_from_name: '', email_reply_to: '', reminder_days: 3 },
  theme: 'Clair',
  accent: '#ffd60a',
  rot: 0,
  spinning: false,
  result: null,
  sheet: null,
  stats: { totalSpins: 0, totalWins: 0, usedWins: 0, pendingWins: 0, expiredWins: 0 },
  series: { week: Array(7).fill(0), month: Array(12).fill(0) },
  qr: { qr: '', url: '', public_code: '', restaurant_name: '' },
  np: { name: '', prob: 10, days: 30, color: '#00c2ff' },
  npError: false,
};

let raf = 0;
let toastTimer = 0;
let spinTimer = 0;
let searchTimer = 0;
let nameTimer = 0;
let searchGen = 0;
let homeGen = 0;
const probTails = {};

function fmtInt(n) {
  return String(Math.max(0, Math.round(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function num(n) {
  const r = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function parseDate(iso) {
  if (!iso) return null;
  const raw = iso instanceof Date ? iso.toISOString() : String(iso);
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtWhen(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDay(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtShort(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('fr-FR');
}

function hexOf(value) {
  const m = String(value || '').trim().match(/^#?([0-9a-fA-F]{6})$/);
  return m ? `#${m[1].toLowerCase()}` : '#ffd60a';
}

function labelColor(color) {
  const n = parseInt(String(color).replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return '#0a0a0a';
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 110 ? '#0a0a0a' : '#fff8e7';
}

function wheelBackground(prizes) {
  const list = prizes && prizes.length ? prizes : [];
  if (!list.length) return 'var(--card2)';
  const seg = 360 / list.length;
  return 'conic-gradient(' + list.map((p, i) => `${p.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(',') + ')';
}

function spinStatus(spin) {
  const real = Number(spin.deadline_days) > 0;
  if (!real) return 'lose';
  if (Number(spin.used) === 1 || spin.used === true) return 'used';
  if (spin.deadline && parseDate(spin.deadline) && parseDate(spin.deadline).getTime() < Date.now()) return 'expired';
  return 'pending';
}

function clientBadge(customer) {
  const spins = customer.spins || [];
  if (!spins.length) return null;
  if (spins.some((s) => spinStatus(s) === 'pending')) return 'pending';
  return spinStatus(spins[0]);
}

function matchClient(customer, q, filter) {
  const blob = `${customer.first_name || ''} ${customer.last_name || ''} ${customer.email || ''} ${customer.phone || ''}`.toLowerCase();
  if (q && !blob.includes(String(q).trim().toLowerCase())) return false;
  if (!filter || filter === 'all') return true;
  return (customer.spins || []).some((s) => spinStatus(s) === filter);
}

function winPercent(prizes) {
  const total = prizes.reduce((a, p) => a + Number(p.probability || 0), 0) || 1;
  const win = prizes.filter((p) => Number(p.deadline_days) > 0).reduce((a, p) => a + Number(p.probability || 0), 0);
  return Math.round((win / total) * 1000) / 10;
}

function share(prizes, probability) {
  const total = prizes.reduce((a, p) => a + Number(p.probability || 0), 0) || 1;
  return Math.round((Number(probability) / total) * 1000) / 10;
}

function calcTarget(gifts, covers) {
  if (!covers) return 0;
  return Math.min(100, Math.round((gifts / covers) * 1000) / 10);
}

function pickPrizeIndex(prizes, rand) {
  const total = prizes.reduce((a, p) => a + Number(p.probability || 0), 0);
  if (total <= 0 || !prizes.length) return 0;
  let r = rand * total;
  for (let i = 0; i < prizes.length; i++) {
    r -= Number(prizes[i].probability || 0);
    if (r <= 0) return i;
  }
  return prizes.length - 1;
}

function spinRotation(current, index, count) {
  const seg = 360 / count;
  return Math.ceil(current / 360) * 360 + 1800 + 360 - (index + 0.5) * seg;
}

function initials(customer) {
  const a = String(customer.first_name || '').trim();
  const b = String(customer.last_name || '').trim();
  return ((a[0] || '') + (b[0] || '')).toUpperCase() || '?';
}

function currentSeries() {
  const src = S.period === 'month' ? S.series.month : S.series.week;
  const n = S.period === 'month' ? 12 : 7;
  return Array.from({ length: n }, (_, i) => Number(src[i]) || 0);
}

function $(id) { return document.getElementById(id); }

function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

function applyTheme() {
  const dark = S.theme === 'Sombre';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--accent', S.accent);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0d0d0f' : '#e6e5e1');
  try {
    localStorage.setItem('rw-theme', S.theme);
    localStorage.setItem('rw-accent', S.accent);
  } catch { /* navigation privée */ }
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 180) }; }
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Erreur');
    err.status = res.status;
    throw err;
  }
  return data;
}

function showView(name) {
  ['view-ob', 'view-login', 'view-app'].forEach((id) => {
    $(id).classList.toggle('on', id === name);
  });
  $('dock').hidden = name !== 'view-app';
}

function paintOnboarding() {
  for (let i = 0; i < 3; i++) $(`ob-${i}`).hidden = i !== S.ob;
  $('ob-cta').textContent = S.ob === 2 ? 'Commencer' : 'Continuer';
  $('ob-dots').querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('on', i === S.ob));
  const field = $('ob-name');
  field.classList.toggle('bad', false);
  $('ob-error').hidden = true;
  const wheel = $('ob-wheel');
  wheel.style.transform = `rotate(${S.ob * 120 + 15}deg)`;
  wheel.style.background = wheelBackground(S.prizes.length ? S.prizes : DEMO_WHEEL);
}

function showOnboarding() {
  showView('view-ob');
  paintOnboarding();
  revealShell();
}

function showLogin() {
  showView('view-login');
  const wheel = $('login-wheel');
  wheel.style.background = wheelBackground(S.prizes.length ? S.prizes : DEMO_WHEEL);
  wheel.style.transform = 'rotate(15deg)';
  $('login-error').hidden = true;
  revealShell();
}

async function nextOb() {
  if (S.ob < 2) {
    S.ob += 1;
    paintOnboarding();
    return;
  }
  const name = $('ob-name').value.trim();
  if (!name) {
    $('ob-name').classList.add('bad');
    $('ob-error').hidden = false;
    return;
  }
  try { sessionStorage.setItem('rw-resto-draft', name); } catch { /* ignore */ }
  S.resto = name;
  try { localStorage.setItem('rw-ob-done', '1'); } catch { /* ignore */ }
  if (S.authed) {
    try { await api('/api/admin/settings', { method: 'PUT', body: { restaurant_name: name } }); } catch (e) { toast(e.message); }
    await enterApp();
  } else {
    showLogin();
  }
}

function skipOb() {
  try { localStorage.setItem('rw-ob-done', '1'); } catch { /* ignore */ }
  if (S.authed) enterApp();
  else showLogin();
}

let loginBusy = false;

async function doLogin(event) {
  if (event) event.preventDefault();
  if (loginBusy) return;
  const email = $('login-email').value.trim();
  const password = $('login-pwd').value.trim();
  $('login-error').hidden = true;
  if (!email || !password) {
    $('login-error').hidden = false;
    return;
  }
  loginBusy = true;
  try {
    await api('/api/admin/login', { method: 'POST', body: { email, password } });
    S.authed = true;
    try { sessionStorage.removeItem('rw-resto-draft'); } catch { /* ignore */ }
    try { localStorage.setItem('rw-ob-done', '1'); } catch { /* ignore */ }
    await enterApp();
  } catch {
    $('login-error').hidden = false;
  } finally {
    loginBusy = false;
  }
}

async function doLogout() {
  try { await api('/api/admin/logout', { method: 'POST' }); } catch { /* on sort quand même */ }
  S.authed = false;
  S.ob = 0;
  S.sheet = null;
  $('sheet').hidden = true;
  clearTimeout(spinTimer);
  S.spinning = false;
  showOnboarding();
}

function paintTabs() {
  document.querySelectorAll('#dock button').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.tab === S.tab);
  });
}

function paintScreens() {
  document.querySelectorAll('.screen').forEach((el) => {
    const on = el.dataset.tab === S.tab;
    el.classList.toggle('on', on);
    if (on && S.navDir) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = `${S.navDir > 0 ? 'rwSlideR' : 'rwSlideL'} .6s cubic-bezier(.22,1,.36,1) both`;
    }
  });
}

function layoutNav(animate) {
  const nav = $('dock');
  const ind = $('dock-ind');
  const btn = nav.querySelector(`[data-tab="${S.tab}"]`);
  if (!btn || nav.hidden) return;
  const nr = nav.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  const lead = '.3s cubic-bezier(.3,.9,.3,1.25)';
  const trail = '.55s cubic-bezier(.5,0,.2,1.15) .07s';
  ind.style.transition = animate
    ? (S.navDir > 0 ? `right ${lead}, left ${trail}` : `left ${lead}, right ${trail}`)
    : 'none';
  ind.style.left = `${br.left - nr.left}px`;
  ind.style.right = `${nr.right - br.right}px`;
  if (!animate) requestAnimationFrame(() => { ind.style.transition = ''; });
}

function goTab(tab, extra) {
  if (tab === S.tab && !extra) return;
  const order = TABS.map((t) => t[0]);
  if (tab !== S.tab) S.navDir = order.indexOf(tab) > order.indexOf(S.tab) ? 1 : -1;
  S.tab = tab;
  if (extra) Object.assign(S, extra);
  paintTabs();
  paintScreens();
  layoutNav(true);
  if (tab === 'home') loadHome();
  if (tab === 'clients') { paintFilters(); loadClients(); }
  if (tab === 'lots') renderLots();
  if (tab === 'qr') loadQr();
  if (tab === 'profil') paintProfile();
}

function runCount() {
  const series = currentSeries();
  const spins = S.day == null ? S.stats.totalSpins : (series[S.day] || 0);
  const items = [
    ['stat-spins', spins],
    ['stat-wins', S.stats.totalWins],
    ['stat-used', S.stats.usedWins],
    ['stat-pending', S.stats.pendingWins],
    ['stat-expired', S.stats.expiredWins],
  ];
  cancelAnimationFrame(raf);
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 870);
    const e = 1 - (1 - p) ** 4;
    items.forEach(([id, value]) => {
      const el = $(id);
      if (el) el.textContent = fmtInt(Math.round(value * e));
    });
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

function renderHome() {
  const series = currentSeries();
  const month = S.period === 'month';
  const names = month ? MONTH_NAMES : WEEK_NAMES;
  const letters = month ? MONTH_LETTERS : WEEK_LETTERS;
  $('hello-name').textContent = S.resto || 'Votre restaurant';
  $('stat-kicker').textContent = S.day == null ? 'TOTAL' : names[S.day];
  document.querySelectorAll('#periods button').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.period === S.period);
  });
  const max = Math.max(...series, 1);
  const cap = window.matchMedia('(min-width: 1024px)').matches ? 150 : 72;
  $('bars').style.gap = month ? '4px' : '7px';
  $('bars').innerHTML = series.map((v, i) => {
    const on = S.day === i;
    const h = Math.round((v / max) * cap);
    return `<button type="button" data-act="bar" data-i="${i}">
      <div class="bar${on ? ' on' : ''}" style="height:${h}px"></div>
      <small class="${on ? 'on' : ''}">${letters[i]}</small>
    </button>`;
  }).join('');
  const pct = winPercent(S.prizes);
  $('win-line').textContent = `${S.prizes.length} cases · ${num(pct)} % de chances de gagner`;
  $('mini-wheel').style.background = wheelBackground(S.prizes.length ? S.prizes : DEMO_WHEEL);
}

async function loadHome() {
  const gen = ++homeGen;
  try {
    const stats = await api('/api/admin/stats');
    if (gen !== homeGen) return;
    S.stats = {
      totalSpins: Number(stats.totalSpins) || 0,
      totalWins: Number(stats.totalWins) || 0,
      usedWins: Number(stats.usedWins) || 0,
      pendingWins: Number(stats.pendingWins) || 0,
      expiredWins: Number(stats.expiredWins) || 0,
    };
  } catch (e) { toast(e.message); }
  try {
    const series = await api('/api/admin/stats/series');
    if (gen !== homeGen) return;
    S.series.week = Array.from({ length: 7 }, (_, i) => Number(series.week?.[i]) || 0);
    S.series.month = Array.from({ length: 12 }, (_, i) => Number(series.month?.[i]) || 0);
  } catch { /* l'histogramme reste à zéro */ }
  if (S.tab === 'home') {
    renderHome();
    runCount();
  }
}

function paintFilters() {
  document.querySelectorAll('#filters button').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.filter === S.filter);
  });
}

function renderClients() {
  const list = S.customers.filter((c) => matchClient(c, S.q, S.filter));
  const box = $('client-list');
  box.innerHTML = list.map((c) => {
    const st = clientBadge(c);
    const b = st ? BADGE[st] : null;
    const spin = (c.spins || [])[0];
    const sub = spin ? `${spin.prize_name || 'Lot'} · ${fmtWhen(spin.won_at)}` : 'Aucun tirage';
    const badge = b ? `<div class="badge" style="background:${b[1]};color:${b[2]}">${b[0]}</div>` : '';
    return `<button type="button" class="row glass" data-act="open-client" data-id="${esc(c.id)}">
      <div class="avatar">${esc(initials(c))}</div>
      <div class="meta"><strong>${esc(c.first_name)} ${esc(c.last_name)}</strong><div class="sub">${esc(sub)}</div></div>
      ${badge}
    </button>`;
  }).join('');
  $('client-empty').hidden = list.length !== 0;
}

async function loadClients() {
  const gen = ++searchGen;
  const q = S.q.trim();
  try {
    const data = await api('/api/admin/search?q=' + encodeURIComponent(q.length >= 2 ? q : ''));
    if (gen !== searchGen) return;
    S.customers = Array.isArray(data) ? data : [];
    if (S.tab === 'clients' || S.sheet === 'client') {
      renderClients();
      if (S.sheet === 'client') renderSheet();
    }
  } catch (e) {
    if (gen === searchGen) toast(e.message);
  }
}

function normPrize(p) {
  return {
    ...p,
    probability: Number(p.probability) || 0,
    deadline_days: Number(p.deadline_days) || 0,
    color: p.color || '#ff6b6b',
    description: p.description || '',
    name: p.name || 'Lot',
  };
}

function paintWheel() {
  const wheel = $('wheel');
  const bg = wheelBackground(S.prizes);
  wheel.style.background = bg;
  const tf = `rotate(${S.rot}deg)`;
  if (wheel.dataset.rot !== tf) {
    wheel.dataset.rot = tf;
    wheel.style.transform = tf;
  }
  const key = S.prizes.map((p) => `${p.id}:${p.name}:${p.color}`).join('|');
  if (wheel.dataset.key === key) return;
  wheel.dataset.key = key;
  const n = S.prizes.length || 1;
  const seg = 360 / n;
  $('wheel-labels').innerHTML = S.prizes.map((p, i) => {
    const tfLabel = `rotate(${(i + 0.5) * seg - 90}deg) translate(38px,0)`;
    return `<div class="wheel-label" style="transform:${tfLabel};color:${labelColor(p.color)}">${esc(p.name)}</div>`;
  }).join('');
}

function renderLots() {
  paintWheel();
  const btn = $('spin-btn');
  btn.textContent = S.spinning ? 'La roue tourne…' : 'Tourner la roue';
  btn.classList.toggle('busy', S.spinning);
  $('covers-val').textContent = String(S.covers);
  $('gifts-val').textContent = String(S.gifts);
  $('calc-target').textContent = num(calcTarget(S.gifts, S.covers));
  $('calc-now').textContent = num(winPercent(S.prizes));
  $('prize-list').innerHTML = S.prizes.map((p) => {
    const days = p.deadline_days ? `${p.deadline_days} j pour l’utiliser` : 'case perdante';
    return `<div class="prize-row glass">
      <div class="swatch" style="background:${esc(p.color)}"></div>
      <div class="meta"><strong>${esc(p.name)}</strong><div class="pct">${num(share(S.prizes, p.probability))} % · ${esc(days)}</div></div>
      <button type="button" class="round flat" data-act="prob-down" data-id="${esc(p.id)}" aria-label="Moins">−</button>
      <button type="button" class="round flat" data-act="prob-up" data-id="${esc(p.id)}" aria-label="Plus">+</button>
      <button type="button" class="round ghost" data-act="prob-del" data-id="${esc(p.id)}" aria-label="Supprimer">✕</button>
    </div>`;
  }).join('');
  if (S.tab === 'home') renderHome();
}

async function loadPrizes() {
  const data = await api('/api/admin/prizes');
  S.prizes = (Array.isArray(data) ? data : []).filter((p) => Number(p.active) !== 0).map(normPrize);
  renderLots();
}

function syncProb(id) {
  const prev = probTails[id] || Promise.resolve();
  probTails[id] = prev.then(async () => {
    const p = S.prizes.find((x) => String(x.id) === String(id));
    if (!p) return;
    await api('/api/admin/prizes/' + id, { method: 'PUT', body: { probability: p.probability } });
  }).catch(async (e) => {
    toast(e.message);
    try { await loadPrizes(); } catch { /* ignore */ }
  });
}

function bumpProb(id, delta) {
  const p = S.prizes.find((x) => String(x.id) === String(id));
  if (!p) return;
  p.probability = Math.max(1, Math.round(Number(p.probability) + delta));
  renderLots();
  syncProb(id);
}

async function deletePrize(id) {
  try {
    await api('/api/admin/prizes/' + id + '/delete', { method: 'POST', body: {} });
    S.prizes = S.prizes.filter((p) => String(p.id) !== String(id));
    $('wheel').dataset.key = '';
    renderLots();
  } catch (e) { toast(e.message); }
}

async function applyCalc() {
  try {
    const data = await api('/api/admin/prizes/calibrate', {
      method: 'POST',
      body: { covers: S.covers, gifts: S.gifts },
    });
    S.prizes = (data.prizes || []).filter((p) => Number(p.active) !== 0).map(normPrize);
    $('wheel').dataset.key = '';
    renderLots();
    toast('Probabilités mises à jour');
  } catch (e) { toast(e.message); }
}

function spin() {
  if (S.spinning || !S.prizes.length) {
    if (!S.prizes.length) toast('Ajoutez un lot pour tourner la roue.');
    return;
  }
  const index = pickPrizeIndex(S.prizes, Math.random());
  S.rot = spinRotation(S.rot, index, S.prizes.length);
  S.spinning = true;
  S.result = S.prizes[index];
  closeSheet();
  renderLots();
  clearTimeout(spinTimer);
  spinTimer = setTimeout(() => {
    S.spinning = false;
    renderLots();
    openSheet('result');
  }, 4400);
}

async function loadQr() {
  try {
    const data = await api('/api/admin/qrcode');
    S.qr = data || S.qr;
    if (data.restaurant_name) S.resto = data.restaurant_name;
    $('qr-name').textContent = S.qr.restaurant_name || S.resto || '';
    $('qr-url').textContent = S.qr.url || '';
    const img = $('qr-img');
    if (S.qr.qr) {
      img.src = S.qr.qr;
      img.hidden = false;
      $('qr-ph').hidden = true;
    }
    $('hello-name').textContent = S.resto || 'Votre restaurant';
  } catch (e) { toast(e.message); }
}

async function exportClientsCsv() {
  const q = S.q.trim();
  try {
    const res = await fetch(`/api/admin/customers/export?q=${encodeURIComponent(q)}`, { credentials: 'same-origin' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast(err.error || 'Export impossible.');
      return;
    }
    const blob = await res.blob();
    const disp = res.headers.get('Content-Disposition') || '';
    const m = /filename="([^"]+)"/.exec(disp);
    const filename = m?.[1] || `clients-restauwheel-${new Date().toISOString().slice(0, 10)}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    toast('Export impossible.');
  }
}

async function copyLink() {
  const btn = $('copy-btn');
  const url = S.qr.url || '';
  btn.textContent = 'Lien copié';
  clearTimeout(btn._rwCopy);
  btn._rwCopy = setTimeout(() => { btn.textContent = 'Copier le lien'; }, 1600);
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = url;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    } catch { /* le libellé confirme déjà l’action */ }
  }
}

function downloadQr() {
  if (!S.qr.qr) return;
  const a = document.createElement('a');
  a.href = S.qr.qr;
  a.download = `qrcode-${S.qr.public_code || 'restaurant'}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('QR code enregistré');
}

function paintProfile() {
  const input = $('resto-input');
  if (document.activeElement !== input) input.value = S.resto || '';
  $('cd-val').textContent = `${S.cooldown} h`;
  document.querySelectorAll('#swatches button').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.color === S.accent);
  });
  document.querySelectorAll('#themes button').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.theme === S.theme);
  });
  $('toggle-win').classList.toggle('on', S.mailWin);
  $('toggle-lose').classList.toggle('on', S.mailLose);
  $('toggle-win').setAttribute('aria-pressed', S.mailWin ? 'true' : 'false');
  $('toggle-lose').setAttribute('aria-pressed', S.mailLose ? 'true' : 'false');
}

async function loadSettings() {
  const s = await api('/api/admin/settings');
  S.resto = s.restaurant_name || S.resto || '';
  S.cooldown = Math.min(720, Math.max(1, Number(s.spin_cooldown_hours) || 24));
  if (s.theme_accent) S.accent = hexOf(s.theme_accent);
  if (s.daily_covers) S.covers = Math.max(10, Number(s.daily_covers) || 100);
  if (s.daily_gifts != null && s.daily_gifts !== '') S.gifts = Math.max(0, Number(s.daily_gifts) || 0);
  if (S.gifts > S.covers) S.gifts = S.covers;
  applyTheme();
  paintProfile();
  $('hello-name').textContent = S.resto || 'Votre restaurant';
}

async function loadEmail() {
  const e = await api('/api/admin/email-settings');
  S.emailMeta = {
    email_from_name: e.email_from_name || '',
    email_reply_to: e.email_reply_to || '',
    reminder_days: Number(e.reminder_days) || 3,
  };
  S.mailWin = e.send_win_email !== 0 && e.send_win_email !== false;
  S.mailLose = !!e.send_lose_email && Number(e.send_lose_email) !== 0;
  paintProfile();
}

function scheduleNameSave() {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(async () => {
    const name = $('resto-input').value.trim();
    if (!name || name === S.resto) return;
    S.resto = name;
    $('hello-name').textContent = name;
    try { await api('/api/admin/settings', { method: 'PUT', body: { restaurant_name: name } }); }
    catch (e) { toast(e.message); }
  }, 500);
}

async function saveCooldown() {
  try { await api('/api/admin/settings', { method: 'PUT', body: { spin_cooldown_hours: S.cooldown } }); }
  catch (e) { toast(e.message); }
}

async function saveAccent() {
  applyTheme();
  paintProfile();
  try { await api('/api/admin/settings', { method: 'PUT', body: { theme_accent: S.accent } }); }
  catch (e) { toast(e.message); }
}

async function saveEmail() {
  paintProfile();
  try {
    await api('/api/admin/email-settings', {
      method: 'PUT',
      body: {
        email_from_name: S.emailMeta.email_from_name,
        email_reply_to: S.emailMeta.email_reply_to,
        send_win_email: S.mailWin,
        send_lose_email: S.mailLose,
        reminder_days: S.emailMeta.reminder_days,
      },
    });
  } catch (e) { toast(e.message); }
}

function spinMeta(spin) {
  const status = spinStatus(spin);
  const when = fmtWhen(spin.won_at);
  if (status === 'pending') return `Tiré le ${when} · valable jusqu’au ${fmtDay(spin.deadline)}`;
  if (status === 'used') return `Tiré le ${when} · utilisé le ${fmtShort(spin.used_at)}`;
  return `Tiré le ${when}`;
}

function renderSheet() {
  const body = $('sheet-body');
  if (S.sheet === 'client') {
    const c = S.customers.find((x) => String(x.id) === String(S.clientId));
    if (!c) { body.innerHTML = ''; return; }
    const spins = c.spins || [];
    const wins = spins.filter((s) => spinStatus(s) !== 'lose').length;
    const cards = spins.map((s) => {
      const status = spinStatus(s);
      const b = BADGE[status];
      const action = status === 'pending'
        ? `<button type="button" class="btn-mint" data-act="use-spin" data-id="${esc(s.id)}">Valider le gain</button>`
        : '';
      return `<div class="spin-card glass">
        <div class="top"><strong>${esc(s.prize_name || 'Lot')}</strong><div class="badge" style="background:${b[1]};color:${b[2]}">${b[0]}</div></div>
        <div class="when">${esc(spinMeta(s))}</div>
        ${action}
      </div>`;
    }).join('');
    body.innerHTML = `<div class="who-lg">
        <div class="avatar">${esc(initials(c))}</div>
        <div><h3>${esc(c.first_name)} ${esc(c.last_name)}</h3><p>${esc(c.email || '')}${c.phone ? ' · ' + esc(c.phone) : ''}</p></div>
      </div>
      <div class="pills">
        <div class="pill">${spins.length} tirages</div>
        <div class="pill">${wins} gains</div>
        <div class="pill">client depuis le ${esc(fmtShort(c.created_at))}</div>
      </div>
      <div class="rows">${cards}</div>`;
    return;
  }
  if (S.sheet === 'result' && S.result) {
    const res = S.result;
    const win = Number(res.deadline_days) > 0;
    const bg = win ? res.color : 'var(--card)';
    const fg = win ? labelColor(res.color) : 'var(--text)';
    const note = win
      ? `Valable ${res.deadline_days} jours après le tirage · ${num(share(S.prizes, res.probability))} % de chances`
      : `Case perdante · ${num(share(S.prizes, res.probability))} % de chances`;
    body.innerHTML = `<div class="result">
      <div class="eye">TIRAGE DE TEST · NON COMPTABILISÉ</div>
      <div class="result-card" style="background:${esc(bg)};color:${fg}">
        <h3>${esc(res.name)}</h3>
        <p>${esc(res.description || '')}</p>
      </div>
      <div class="note">${esc(note)}</div>
      <div class="pair">
        <button type="button" class="btn-glass glass" data-act="close-sheet">Fermer</button>
        <button type="button" class="btn-accent" data-act="respin">Rejouer</button>
      </div>
    </div>`;
    return;
  }
  if (S.sheet === 'add') {
    const np = S.np;
    const colors = PALETTE.map((c) => {
      const on = c === np.color;
      const ring = on ? '0 0 0 3px var(--bg), 0 0 0 6px var(--text)' : 'none';
      return `<button type="button" data-act="np-color" data-color="${c}" aria-label="Couleur" style="width:46px;height:46px;border-radius:50%;background:${c};box-shadow:${ring}"></button>`;
    }).join('');
    body.innerHTML = `<h3 class="sheet-title">Nouveau lot</h3>
      <input id="np-name" class="field np-field${S.npError ? ' bad' : ''}" placeholder="Ex : Dessert offert" value="${esc(np.name)}">
      <div class="err" id="np-error" ${S.npError ? '' : 'hidden'}>Le nom du lot est obligatoire.</div>
      <div class="step-grid">
        <div class="step-box glass" style="background:var(--card)">
          <div class="lbl">POIDS</div>
          <div class="stepper">
            <button type="button" class="round flat" data-act="np-prob-down">−</button>
            <b>${np.prob}</b>
            <button type="button" class="round flat" data-act="np-prob-up">+</button>
          </div>
        </div>
        <div class="step-box glass" style="background:var(--card)">
          <div class="lbl">VALIDITÉ (JOURS)</div>
          <div class="stepper">
            <button type="button" class="round flat" data-act="np-days-down">−</button>
            <b>${np.days}</b>
            <button type="button" class="round flat" data-act="np-days-up">+</button>
          </div>
        </div>
      </div>
      <div class="hint">0 jour = case « Rien gagné »</div>
      <div class="swatches" style="margin-bottom:20px">${colors}</div>
      <button type="button" class="btn-accent btn-block" data-act="save-prize">Enregistrer</button>`;
  }
}

function openSheet(kind) {
  S.sheet = kind;
  const root = $('sheet');
  root.hidden = false;
  const panel = $('sheet-panel');
  panel.style.animation = 'none';
  void panel.offsetWidth;
  panel.style.animation = '';
  renderSheet();
}

function closeSheet() {
  S.sheet = null;
  $('sheet').hidden = true;
}

async function useSpin(id) {
  try {
    await api('/api/admin/spins/' + id + '/use', { method: 'PUT' });
    S.customers.forEach((c) => {
      (c.spins || []).forEach((s) => {
        if (String(s.id) === String(id)) {
          s.used = 1;
          s.used_at = new Date().toISOString();
        }
      });
    });
    toast('Gain validé');
    renderClients();
    renderSheet();
    loadHome();
  } catch (e) { toast(e.message); }
}

async function savePrize() {
  const name = ($('np-name')?.value || S.np.name || '').trim();
  S.np.name = name;
  if (!name) {
    S.npError = true;
    renderSheet();
    return;
  }
  try {
    await api('/api/admin/prizes', {
      method: 'POST',
      body: {
        name,
        description: '',
        probability: S.np.prob,
        deadline_days: S.np.days,
        color: S.np.days ? S.np.color : '#26252b',
      },
    });
    closeSheet();
    $('wheel').dataset.key = '';
    await loadPrizes();
    toast('Lot ajouté à la roue');
  } catch (e) { toast(e.message); }
}

async function enterApp() {
  showView('view-app');
  S.tab = 'home';
  S.navDir = 0;
  paintTabs();
  document.querySelectorAll('.screen').forEach((el) => {
    el.classList.toggle('on', el.dataset.tab === 'home');
    el.style.animation = 'none';
  });
  layoutNav(false);
  try {
    await Promise.all([
      loadSettings().catch((e) => toast(e.message)),
      loadEmail().catch(() => {}),
      loadPrizes().catch((e) => toast(e.message)),
      loadQr().catch(() => {}),
      loadClients(),
    ]);
  } catch (e) { toast(e.message); }
  renderLots();
  paintProfile();
  S.navDir = 0;
  await loadHome();
  requestAnimationFrame(() => layoutNav(false));
  revealShell();
}

let shellRevealed = false;

function revealShell() {
  if (shellRevealed) return;
  shellRevealed = true;
  const native = document.documentElement.dataset.native === '1';
  const boot = document.getElementById('boot');
  const elapsed = Date.now() - (window.__rwBoot || Date.now());
  const wait = native ? 0 : Math.max(0, 1100 - elapsed);
  setTimeout(() => {
    const done = () => { document.documentElement.dataset.rwReady = '1'; };
    if (!boot || native) {
      if (boot) boot.remove();
      done();
      return;
    }
    boot.classList.add('leave');
    boot.addEventListener('animationend', () => {
      boot.remove();
      done();
    }, { once: true });
  }, wait);
}

function buildLiquid() {
  if (document.getElementById('rwLiquid')) return;
  const W = 362;
  const H = 64;
  const r = H / 2;
  const edge = 22;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = Math.min(Math.max(x + 0.5, r), W - r);
      const dx = x + 0.5 - px;
      const dy = y + 0.5 - r;
      const len = Math.hypot(dx, dy) || 1;
      const dist = r - len;
      const t = dist >= 0 ? Math.max(0, 1 - dist / edge) : 0;
      const m = t * t * (3 - 2 * t);
      const i = (y * W + x) * 4;
      img.data[i] = 128 - (dx / len) * m * 127;
      img.data[i + 1] = 128 - (dy / len) * m * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = `<filter id="rwLiquid" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feImage href="${canvas.toDataURL()}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" result="map"/><feDisplacementMap in="SourceGraphic" in2="map" scale="46" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  document.body.appendChild(svg);
}

function bindPress() {
  document.addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest && ev.target.closest('button');
    if (!b) return;
    b.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(.9, .86)', offset: 0.25 },
      { transform: 'scale(1.06, 1.08)', offset: 0.55 },
      { transform: 'scale(.98, .97)', offset: 0.8 },
      { transform: 'scale(1)' },
    ], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' });
    const rect = b.getBoundingClientRect();
    const z = Math.max(rect.width, rect.height) * 2.2;
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.style.overflow = 'hidden';
    const ripple = document.createElement('span');
    ripple.style.cssText = `position:absolute;pointer-events:none;border-radius:50%;width:${z}px;height:${z}px;left:${ev.clientX - rect.left - z / 2}px;top:${ev.clientY - rect.top - z / 2}px;background:radial-gradient(circle,rgba(255,255,255,.55) 0,rgba(255,255,255,.18) 45%,transparent 70%)`;
    b.appendChild(ripple);
    const anim = ripple.animate(
      [{ transform: 'scale(0)', opacity: 1 }, { transform: 'scale(1)', opacity: 0 }],
      { duration: 600, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
    anim.onfinish = () => ripple.remove();
  }, true);
}

function onClick(event) {
  const btn = event.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'next-ob') nextOb();
  else if (act === 'skip-ob') skipOb();
  else if (act === 'tab') goTab(btn.dataset.tab);
  else if (act === 'period') {
    S.period = btn.dataset.period;
    S.day = null;
    renderHome();
    runCount();
  } else if (act === 'bar') {
    const i = Number(btn.dataset.i);
    S.day = S.day === i ? null : i;
    renderHome();
    runCount();
  } else if (act === 'go-pending') goTab('clients', { filter: 'pending' });
  else if (act === 'go-lots') goTab('lots');
  else if (act === 'filter') {
    S.filter = btn.dataset.filter;
    paintFilters();
    renderClients();
  } else if (act === 'open-client') {
    S.clientId = btn.dataset.id;
    openSheet('client');
  } else if (act === 'close-sheet') closeSheet();
  else if (act === 'use-spin') useSpin(btn.dataset.id);
  else if (act === 'spin' || act === 'respin') spin();
  else if (act === 'covers-up') { S.covers += 10; renderLots(); }
  else if (act === 'covers-down') { S.covers = Math.max(10, S.covers - 10, S.gifts); renderLots(); }
  else if (act === 'gifts-up') { S.gifts = Math.min(S.covers, S.gifts + 1); renderLots(); }
  else if (act === 'gifts-down') { S.gifts = Math.max(0, S.gifts - 1); renderLots(); }
  else if (act === 'apply-calc') applyCalc();
  else if (act === 'prob-up') bumpProb(btn.dataset.id, 1);
  else if (act === 'prob-down') bumpProb(btn.dataset.id, -1);
  else if (act === 'prob-del') deletePrize(btn.dataset.id);
  else if (act === 'open-add') {
    S.np = { name: '', prob: 10, days: 30, color: '#00c2ff' };
    S.npError = false;
    openSheet('add');
  } else if (act === 'np-prob-up') { S.np.prob += 1; S.np.name = $('np-name')?.value || S.np.name; renderSheet(); }
  else if (act === 'np-prob-down') { S.np.prob = Math.max(1, S.np.prob - 1); S.np.name = $('np-name')?.value || S.np.name; renderSheet(); }
  else if (act === 'np-days-up') { S.np.days = Math.min(365, S.np.days + 5); S.np.name = $('np-name')?.value || S.np.name; renderSheet(); }
  else if (act === 'np-days-down') { S.np.days = Math.max(0, S.np.days - 5); S.np.name = $('np-name')?.value || S.np.name; renderSheet(); }
  else if (act === 'np-color') { S.np.color = btn.dataset.color; S.np.name = $('np-name')?.value || S.np.name; renderSheet(); }
  else if (act === 'save-prize') savePrize();
  else if (act === 'copy') copyLink();
  else if (act === 'download') downloadQr();
  else if (act === 'cd-up') { S.cooldown = Math.min(720, S.cooldown + 1); paintProfile(); saveCooldown(); }
  else if (act === 'cd-down') { S.cooldown = Math.max(1, S.cooldown - 1); paintProfile(); saveCooldown(); }
  else if (act === 'accent') { S.accent = btn.dataset.color; saveAccent(); }
  else if (act === 'theme') { S.theme = btn.dataset.theme; applyTheme(); paintProfile(); }
  else if (act === 'mail-win') { S.mailWin = !S.mailWin; saveEmail(); }
  else if (act === 'mail-lose') { S.mailLose = !S.mailLose; saveEmail(); }
  else if (act === 'logout') doLogout();
}

function boot() {
  try {
    const theme = localStorage.getItem('rw-theme');
    if (theme === 'Sombre' || theme === 'Clair') S.theme = theme;
    const accent = localStorage.getItem('rw-accent');
    if (accent) S.accent = hexOf(accent);
  } catch { /* ignore */ }
  applyTheme();
  buildLiquid();
  bindPress();
  document.addEventListener('click', onClick);
  $('login-form').addEventListener('submit', doLogin);
  const loginBtn = $('login-form').querySelector('button[type="submit"]');
  loginBtn.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse') return;
    doLogin(event);
  });
  ['login-email', 'login-pwd'].forEach((id) => {
    $(id).addEventListener('focus', () => {
      setTimeout(() => $(id).scrollIntoView({ block: 'center' }), 280);
    });
  });
  $('q').addEventListener('input', () => {
    S.q = $('q').value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadClients, 250);
  });
  $('resto-input').addEventListener('input', scheduleNameSave);
  $('resto-input').addEventListener('blur', () => {
    if (!$('resto-input').value.trim()) $('resto-input').value = S.resto || '';
  });
  $('ob-name').addEventListener('input', () => {
    $('ob-error').hidden = true;
    $('ob-name').classList.remove('bad');
  });
  $('np-name')?.addEventListener('input', () => {});
  document.addEventListener('input', (event) => {
    if (event.target.id === 'np-name') {
      S.np.name = event.target.value;
      S.npError = false;
      event.target.classList.remove('bad');
      const err = $('np-error');
      if (err) err.hidden = true;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSheet();
  });
  window.addEventListener('resize', () => {
    layoutNav(false);
    if (S.tab === 'home') renderHome();
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layoutNav(false));
  paintOnboarding();
  checkAuth();
}

async function checkAuth() {
  let done = false;
  try { done = localStorage.getItem('rw-ob-done') === '1'; } catch { /* ignore */ }
  try {
    const me = await api('/api/admin/me');
    if (me && me.isAdmin) {
      S.authed = true;
      S.resto = me.restaurant_name || '';
      if (me.theme_accent) S.accent = hexOf(me.theme_accent);
      applyTheme();
      const field = $('ob-name');
      if (!field.value) field.value = S.resto;
      if (done) await enterApp();
      else showOnboarding();
      return;
    }
  } catch { /* hors ligne : on reste sur la porte */ }
  if (done) showLogin();
  else showOnboarding();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fmtInt, spinStatus, matchClient, wheelBackground, pickPrizeIndex, spinRotation,
    winPercent, share, calcTarget, labelColor, clientBadge, initials,
  };
}
