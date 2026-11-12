const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { seriesFromRows } = require('../lib/admin-series');
const {
  fmtInt, spinStatus, matchClient, pickPrizeIndex, spinRotation, winPercent, labelColor,
} = require('../public/admin/app.js');

describe('série de tirages', () => {
  it('aligne les buckets 1-indexés et ignore le hors plage', () => {
    assert.deepEqual(seriesFromRows([
      { bucket: '1', n: '4' },
      { bucket: 3, n: 9 },
      { bucket: 8, n: 100 },
      { bucket: null, n: 5 },
    ], 7), [4, 0, 9, 0, 0, 0, 0]);
    assert.equal(seriesFromRows([{ bucket: '12', n: 2 }], 12)[11], 2);
  });

  it('expose la route semaine / année en fuseau Paris', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(server, /\/api\/admin\/stats\/series/);
    assert.match(server, /Europe\/Paris/);
    assert.match(server, /ISODOW/);
  });
});

describe('logique de l’app mobile', () => {
  it('formate les milliers avec une espace', () => {
    assert.equal(fmtInt(1284), '1 284');
    assert.equal(fmtInt(12), '12');
    assert.equal(fmtInt(1000000), '1 000 000');
  });

  it('classe un tirage', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    assert.equal(spinStatus({ deadline_days: 0, used: 0 }), 'lose');
    assert.equal(spinStatus({ deadline_days: 30, used: 1, deadline: future }), 'used');
    assert.equal(spinStatus({ deadline_days: 30, used: 0, deadline: past }), 'expired');
    assert.equal(spinStatus({ deadline_days: 30, used: 0, deadline: future }), 'pending');
  });

  it('filtre les clients par texte et par statut', () => {
    const rows = [
      { first_name: 'Camille', last_name: 'Durand', email: 'c@mail.fr', phone: '0612', spins: [{ deadline_days: 30, used: 0, deadline: new Date(Date.now() + 86400000).toISOString() }] },
      { first_name: 'Hugo', last_name: 'Petit', email: 'h@mail.fr', phone: '0600', spins: [{ deadline_days: 0, used: 0 }] },
    ];
    assert.equal(matchClient(rows[0], 'camille', 'all'), true);
    assert.equal(matchClient(rows[1], 'camille', 'all'), false);
    assert.equal(matchClient(rows[0], '', 'pending'), true);
    assert.equal(matchClient(rows[1], '', 'pending'), false);
  });

  it('tire un lot au poids et aligne le centre sur le pointeur', () => {
    const prizes = [{ probability: 1 }, { probability: 0 }, { probability: 3 }];
    assert.equal(pickPrizeIndex(prizes, 0), 0);
    assert.equal(pickPrizeIndex(prizes, 0.5), 2);
    const index = 2;
    const count = 6;
    const rot = spinRotation(10, index, count);
    const center = (index + 0.5) * (360 / count);
    assert.equal(((center + rot) % 360 + 360) % 360, 0);
    assert.ok(rot > 10);
  });

  it('calcule la part de gains', () => {
    const prizes = [
      { probability: 10, deadline_days: 30 },
      { probability: 90, deadline_days: 0 },
    ];
    assert.equal(winPercent(prizes), 10);
  });

  it('choisit un texte lisible sur la case', () => {
    assert.equal(labelColor('#ffd60a'), '#0a0a0a');
    assert.equal(labelColor('#26252b'), '#fff8e7');
  });

  it('décale l’iPhone 16 Pro quand le webview est plein écran', () => {
    const { phoneInsets } = require('../public/admin/app.js');
    assert.deepEqual(phoneInsets({
      envTop: 0, envBottom: 0, screenH: 874, innerH: 874, narrow: true,
    }), { top: 62, bottom: 34 });
    assert.deepEqual(phoneInsets({
      envTop: 59, envBottom: 34, screenH: 874, innerH: 874, narrow: true,
    }), { top: 59, bottom: 34 });
    assert.deepEqual(phoneInsets({
      envTop: 0, envBottom: 0, screenH: 874, innerH: 778, narrow: true,
    }), { top: 0, bottom: 0 });
    assert.deepEqual(phoneInsets({
      envTop: 0, envBottom: 0, screenH: 874, innerH: 874, narrow: false,
    }), { top: 0, bottom: 0 });
  });
});

describe('marquage admin', () => {
  it('garde l’export CSV et les écrans du handoff', () => {
    const admin = fs.readFileSync(path.join(__dirname, '../public/admin/index.html'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, '../public/admin/app.js'), 'utf8');
    assert.match(admin, /exportClientsCsv/);
    assert.match(admin, /admin\.clients\.export/);
    assert.match(admin, /RESTAU WHEEL/);
    assert.match(admin, /Tourner la roue/);
    assert.match(app, /Valider le gain/);
    assert.match(app, /\/api\/admin\/stats\/series/);
    assert.match(app, /Gain validé/);
    assert.match(app, /revealShell/);
    assert.match(admin, /id="boot"/);
    assert.doesNotMatch(admin, /\/api\/admin\/crm|id="page-crm"|crm-workspace|twenty-frame/);
  });
});
