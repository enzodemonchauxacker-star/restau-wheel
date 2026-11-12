'use strict';

const WEEK = [18, 24, 15, 31, 22, 36, 27];
const MONTH = [40, 55, 48, 62, 70, 58, 80, 74, 66, 90, 84, 96];
const WEEK_LETTERS = 'LMMJVSD';
const MONTH_LETTERS = 'JFMAMJJASOND';
const PRIZES = [
  { name: 'Café offert', color: '#ffd60a', chance: 20 },
  { name: 'Dessert offert', color: '#ff2d6a', chance: 15 },
  { name: '−10 % sur la note', color: '#00c2ff', chance: 15 },
  { name: 'Boisson offerte', color: '#00e5c8', chance: 20 },
  { name: 'Perdu', color: '#26252b', chance: 30 },
];
const CLIENTS = [
  { name: 'Camille Durand', sub: 'Dessert offert · aujourd’hui', status: 'pending', badge: 'EN ATTENTE' },
  { name: 'Hugo Petit', sub: '−10 % · hier', status: 'pending', badge: 'EN ATTENTE' },
  { name: 'Léa Martin', sub: 'Café offert · utilisé', status: 'used', badge: 'UTILISÉ' },
  { name: 'Gabriel Roux', sub: 'Boisson offerte · utilisé', status: 'used', badge: 'UTILISÉ' },
  { name: 'Inès Bernard', sub: 'Dessert offert · expiré', status: 'expired', badge: 'EXPIRÉ' },
  { name: 'Noah Garcia', sub: 'Café offert · expiré', status: 'expired', badge: 'EXPIRÉ' },
];
const BADGE = {
  pending: ['#ffd60a', '#0a0a0a'],
  used: ['#00e5c8', '#0a0a0a'],
  expired: ['#ff2d6a', '#0a0a0a'],
};

const state = { tab: 'home', period: 'week', filter: 'all', q: '' };

const $ = (id) => document.getElementById(id);

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 1600);
}

function series() {
  return state.period === 'week' ? WEEK : MONTH;
}

function paintBars() {
  const values = series();
  const max = Math.max(...values, 1);
  const letters = state.period === 'week' ? WEEK_LETTERS : MONTH_LETTERS;
  $('stat-kicker').textContent = state.period === 'week' ? 'SEMAINE' : 'MOIS';
  $('stat-spins').textContent = String(values.reduce((sum, n) => sum + n, 0));
  $('bars').innerHTML = values.map((n, i) => {
    const h = Math.max(8, Math.round((n / max) * 78));
    return `<button type="button"><i class="bar" style="height:${h}px"></i><small>${letters[i]}</small></button>`;
  }).join('');
}

function paintClients() {
  const q = state.q.trim().toLowerCase();
  const rows = CLIENTS.filter((c) => {
    if (state.filter !== 'all' && c.status !== state.filter) return false;
    if (!q) return true;
    return `${c.name} ${c.sub}`.toLowerCase().includes(q);
  });
  $('client-list').innerHTML = rows.map((c) => {
    const [bg, fg] = BADGE[c.status];
    const initials = c.name.split(' ').map((p) => p[0]).slice(0, 2).join('');
    return `<div class="row glass">
      <div class="avatar">${initials}</div>
      <div class="meta"><strong>${c.name}</strong><div class="sub">${c.sub}</div></div>
      <div class="badge" style="background:${bg};color:${fg}">${c.badge}</div>
    </div>`;
  }).join('');
  $('client-empty').hidden = rows.length !== 0;
}

function paintPrizes() {
  const stops = PRIZES.map((p, i) => {
    const start = PRIZES.slice(0, i).reduce((s, item) => s + item.chance, 0);
    return `${p.color} ${start}% ${start + p.chance}%`;
  }).join(', ');
  const wheel = `conic-gradient(${stops})`;
  $('wheel').style.background = wheel;
  $('mini-wheel').style.background = wheel;
  $('prize-list').innerHTML = PRIZES.map((p) => `<div class="row glass">
    <div class="avatar" style="background:${p.color}"></div>
    <div class="meta"><strong>${p.name}</strong><div class="sub">${p.chance} %</div></div>
  </div>`).join('');
}

function layoutNav() {
  const nav = $('dock');
  const ind = $('dock-ind');
  const btn = nav.querySelector(`[data-tab="${state.tab}"]`);
  if (!btn) return;
  const nr = nav.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  ind.style.left = `${br.left - nr.left}px`;
  ind.style.right = `${nr.right - br.right}px`;
}

function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.screen').forEach((el) => {
    el.classList.toggle('on', el.dataset.tab === tab);
  });
  document.querySelectorAll('#dock button').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.tab === tab);
  });
  layoutNav();
  $('scroll').scrollTop = 0;
}

document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'tab') showTab(btn.dataset.tab);
  if (act === 'period') {
    state.period = btn.dataset.period;
    document.querySelectorAll('#periods button').forEach((el) => el.classList.toggle('on', el === btn));
    paintBars();
  }
  if (act === 'filter') {
    state.filter = btn.dataset.filter;
    document.querySelectorAll('#filters button').forEach((el) => el.classList.toggle('on', el === btn));
    paintClients();
  }
  if (act === 'go-pending') {
    state.filter = 'pending';
    document.querySelectorAll('#filters button').forEach((el) => {
      el.classList.toggle('on', el.dataset.filter === 'pending');
    });
    paintClients();
    showTab('clients');
  }
  if (act === 'go-lots') showTab('lots');
  if (act === 'accent') {
    document.documentElement.style.setProperty('--accent', btn.dataset.color);
    document.querySelectorAll('#swatches button').forEach((el) => el.classList.toggle('on', el === btn));
    paintPrizes();
  }
  if (act === 'theme') {
    document.documentElement.dataset.theme = btn.dataset.theme;
    document.querySelectorAll('#themes button').forEach((el) => el.classList.toggle('on', el === btn));
  }
});

$('q').addEventListener('input', () => {
  state.q = $('q').value;
  paintClients();
});

$('resto-input').addEventListener('input', () => {
  const name = $('resto-input').value.trim() || 'Reikon';
  $('hello-name').textContent = name;
});

let spinAngle = 0;
$('spin-btn').addEventListener('click', () => {
  spinAngle += 360 * 5 + Math.floor(Math.random() * 360);
  $('wheel').style.transform = `rotate(${spinAngle}deg)`;
  toast('La roue tourne');
});

function link() {
  return `${location.origin}/reikon`;
}

$('qr-url').textContent = link();
$('copy-btn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(link()); } catch { /* ignore */ }
  toast('Lien copié');
});
$('share-btn').addEventListener('click', async () => {
  if (navigator.share) {
    try { await navigator.share({ title: 'Reikon', url: link() }); return; } catch { /* ignore */ }
  }
  try { await navigator.clipboard.writeText(link()); } catch { /* ignore */ }
  toast('Lien copié');
});
$('export-btn').addEventListener('click', () => toast('Export prêt'));

paintBars();
paintClients();
paintPrizes();
requestAnimationFrame(layoutNav);
window.addEventListener('resize', layoutNav);
