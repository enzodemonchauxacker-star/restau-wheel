const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  visualCounts,
  spreadSlots,
  buildSlots,
  maxAdjacentRun,
  circularDist,
} = require('../public/js/wheel-layout.js');

describe('wheel-layout — répartition visuelle', () => {
  it('conserve le nombre de parts par lot (probabilités inchangées côté serveur)', () => {
    const prizes = [
      { id: 1, name: 'Rien', probability: 50, deadline_days: 0, color: '#374151' },
      { id: 2, name: '10%', probability: 17, deadline_days: 30, color: '#DC2626' },
      { id: 3, name: 'Dessert', probability: 17, deadline_days: 30, color: '#059669' },
      { id: 4, name: 'Boisson', probability: 16, deadline_days: 30, color: '#2563EB' },
    ];
    const counts = Object.fromEntries(visualCounts(prizes, 12).map((c) => [c.prize.id, c.n]));
    const slots = buildSlots(prizes, 12);
    assert.equal(slots.length, 12);
    for (const [id, n] of Object.entries(counts)) {
      assert.equal(slots.filter((s) => String(s.id) === String(id)).length, n);
    }
  });

  it('espace les lots gagnants autour du cercle (Oliviers 50/17/17/16)', () => {
    const prizes = [
      { id: 60, name: 'Rien', probability: 50, deadline_days: 0, color: '#374151' },
      { id: 61, name: '10% sur la note', probability: 17, deadline_days: 30, color: '#DC2626' },
      { id: 62, name: 'Dessert offert', probability: 17, deadline_days: 30, color: '#059669' },
      { id: 63, name: 'Boisson offerte', probability: 16, deadline_days: 30, color: '#2563EB' },
    ];
    const slots = buildSlots(prizes, 12);
    const names = slots.map((s) => s.name);
    // Avec 6 Rien + 2+2+2, on peut alterner : aucune suite > 1
    assert.ok(maxAdjacentRun(slots) <= 1, `run trop long: ${names.join(' | ')}`);
    // Les deux parts d’un même lot gagnant restent opposées
    for (const id of [61, 62, 63]) {
      const idxs = slots.map((s, i) => (s.id === id ? i : -1)).filter((i) => i >= 0);
      assert.equal(idxs.length, 2);
      assert.ok(circularDist(idxs[0], idxs[1], 12) >= 5, `${id} trop proches: ${idxs} → ${names.join('|')}`);
    }
  });

  it('évite les gros blocs de Rien même quand le perdant domine', () => {
    const prizes = [
      { id: 1, name: 'Rien', probability: 75, deadline_days: 0, color: '#374151' },
      { id: 2, name: '10%', probability: 10, deadline_days: 30, color: '#DC2626' },
      { id: 3, name: 'Dessert', probability: 8, deadline_days: 30, color: '#059669' },
      { id: 4, name: 'Boisson', probability: 7, deadline_days: 30, color: '#2563EB' },
    ];
    const slots = buildSlots(prizes, 12);
    const run = maxAdjacentRun(slots);
    // Ancien algo greedy pouvait coller 5+ Rien ; on vise ≤ 3
    assert.ok(run <= 3, `run=${run} slots=${slots.map((s) => s.name).join(',')}`);
    // Chaque lot gagnant apparaît et n’est pas collé à lui-même
    for (const id of [2, 3, 4]) {
      const idxs = slots.map((s, i) => (s.id === id ? i : -1)).filter((i) => i >= 0);
      assert.ok(idxs.length >= 1);
      if (idxs.length > 1) {
        assert.ok(circularDist(idxs[0], idxs[1], 12) >= 2);
      }
    }
  });

  it('spreadSlots est déterministe', () => {
    const items = [
      { id: 'a' }, { id: 'a' }, { id: 'a' }, { id: 'a' },
      { id: 'b' }, { id: 'b' },
      { id: 'c' }, { id: 'd' },
    ];
    const a = spreadSlots(items).map((s) => s.id).join('');
    const b = spreadSlots(items).map((s) => s.id).join('');
    assert.equal(a, b);
  });
});
