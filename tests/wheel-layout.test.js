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
  it('donne le même nombre de parts à chaque lot (visuel ≠ probas serveur)', () => {
    const prizes = [
      { id: 1, name: 'Rien', probability: 85, deadline_days: 0, color: '#374151' },
      { id: 2, name: 'Dessert', probability: 5, deadline_days: 30, color: '#059669' },
      { id: 3, name: 'Boisson', probability: 5, deadline_days: 30, color: '#2563EB' },
      { id: 4, name: 'Café', probability: 5, deadline_days: 30, color: '#F59E0B' },
    ];
    const counts = visualCounts(prizes, 12).map((c) => c.n);
    assert.deepEqual(counts, [3, 3, 3, 3]);
    const slots = buildSlots(prizes, 12);
    assert.equal(slots.length, 12);
    for (const id of [1, 2, 3, 4]) {
      assert.equal(slots.filter((s) => s.id === id).length, 3);
    }
  });

  it('alterne les lots autour du cercle (Demo 85% Rien)', () => {
    const prizes = [
      { id: 1, name: 'Rien', probability: 85, deadline_days: 0, color: '#374151' },
      { id: 3, name: 'Dessert offert', probability: 5, deadline_days: 30, color: '#059669' },
      { id: 4, name: 'Boisson offerte', probability: 5, deadline_days: 30, color: '#2563EB' },
      { id: 47, name: 'Café offert', probability: 5, deadline_days: 30, color: '#F59E0B' },
    ];
    const slots = buildSlots(prizes, 12);
    const names = slots.map((s) => s.name);
    assert.ok(maxAdjacentRun(slots) <= 1, `run trop long: ${names.join(' | ')}`);
    for (const id of [1, 3, 4, 47]) {
      const idxs = slots.map((s, i) => (s.id === id ? i : -1)).filter((i) => i >= 0);
      assert.equal(idxs.length, 3);
      // 3 parts sur 12 → écart ≈ 4
      assert.ok(
        circularDist(idxs[0], idxs[1], 12) >= 3,
        `${id} trop proches: ${idxs} → ${names.join('|')}`
      );
    }
  });

  it('reste équitable avec des proba équilibrées (Oliviers)', () => {
    const prizes = [
      { id: 60, name: 'Rien', probability: 50, deadline_days: 0, color: '#374151' },
      { id: 61, name: '10% sur la note', probability: 17, deadline_days: 30, color: '#DC2626' },
      { id: 62, name: 'Dessert offert', probability: 17, deadline_days: 30, color: '#059669' },
      { id: 63, name: 'Boisson offerte', probability: 16, deadline_days: 30, color: '#2563EB' },
    ];
    const slots = buildSlots(prizes, 12);
    assert.ok(maxAdjacentRun(slots) <= 1, slots.map((s) => s.name).join(' | '));
    for (const id of [60, 61, 62, 63]) {
      assert.equal(slots.filter((s) => s.id === id).length, 3);
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
