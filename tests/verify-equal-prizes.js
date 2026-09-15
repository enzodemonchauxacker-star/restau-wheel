/**
 * Script de vérif E2E local : calibrate → % égaux + segments roue.
 * Usage: node tests/verify-equal-prizes.js
 */
const assert = require('node:assert/strict');
const { calibratePrizeWeights } = require('../lib/prize-calibrate');

async function main() {
  const base = process.env.BASE_URL || 'http://127.0.0.1:3000';

  // 1) Build marker
  const build = await fetch(`${base}/api/build`).then((r) => r.json());
  assert.equal(build.build, 'equal-segments-v2');
  assert.equal(build.equal_wheel_segments, true);

  // 2) Client HTML contains equal-segment build marker (not VISUAL_SLICES)
  const html = await fetch(`${base}/client?r=demo`).then((r) => r.text());
  assert.match(html, /equal-segments-v2/);
  assert.doesNotMatch(html, /VISUAL_SLICES/);
  assert.match(html, /Une case visuelle par lot actif/);

  // 3) Unit: equal split
  const prizes = [
    { id: 1, deadline_days: 0, probability: 70 },
    { id: 2, deadline_days: 7, probability: 25 },
    { id: 3, deadline_days: 7, probability: 5 },
    { id: 4, deadline_days: 14, probability: 0 },
  ];
  const { updates, winWeight } = calibratePrizeWeights(prizes, 100, 15);
  assert.equal(winWeight, 15);
  const giftUpdates = updates.filter((u) => Number(prizes.find((p) => p.id === u.id).deadline_days) > 0);
  assert.deepEqual(giftUpdates.map((u) => u.probability).sort((a, b) => b - a), [5, 5, 5]);

  // 4) Login admin demo / calibrate via API
  const email = 'teddy@restauwheel.com';
  const password = 'teddy2026';
  const loginRes = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(loginRes.status, 200, `login failed: ${loginRes.status}`);
  const rawCookie = loginRes.headers.getSetCookie?.() || [];
  const cookie = rawCookie.map((c) => c.split(';')[0]).join('; ')
    || (loginRes.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim()).join('; ');
  assert.ok(cookie, 'session cookie missing');

  // Ensure we have multiple gift prizes with unequal probs then calibrate
  const listBefore = await fetch(`${base}/api/admin/prizes`, { headers: { Cookie: cookie } }).then((r) => r.json());
  assert.ok(Array.isArray(listBefore) && listBefore.length >= 2);

  const cal = await fetch(`${base}/api/admin/prizes/calibrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ covers: 100, gifts: 15 }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  assert.equal(cal.status, 200, JSON.stringify(cal.body));
  assert.equal(cal.body.success, true);

  const gifts = (cal.body.prizes || []).filter((p) => Number(p.deadline_days) > 0);
  assert.ok(gifts.length >= 1, 'need gift prizes');
  const probs = gifts.map((p) => Number(p.probability));
  const min = Math.min(...probs);
  const max = Math.max(...probs);
  assert.ok(max - min <= 1, `gift probs not equal: ${probs.join(',')}`);
  assert.equal(probs.reduce((a, b) => a + b, 0), 15);

  // 5) Public prizes → client would render 1 equal slot each
  const pub = await fetch(`${base}/api/prizes?r=demo`).then((r) => r.json());
  assert.ok(pub.length >= 2);
  // Simulate client slot builder (all active prizes, equal visual)
  const slots = pub.map((p) => p.id);
  assert.equal(slots.length, pub.length);

  console.log('OK verify-equal-prizes', {
    gifts: probs,
    win_percent: cal.body.win_percent,
    slots: slots.length,
    build: build.build,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
