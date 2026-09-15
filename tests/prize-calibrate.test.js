const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { splitEqually, calibratePrizeWeights } = require('../lib/prize-calibrate');

describe('splitEqually', () => {
  it('répartit exactement et le plus équitablement possible', () => {
    assert.deepEqual(splitEqually(15, 3), [5, 5, 5]);
    assert.deepEqual(splitEqually(10, 3), [4, 3, 3]);
    assert.deepEqual(splitEqually(1, 3), [1, 0, 0]);
    assert.deepEqual(splitEqually(0, 3), [0, 0, 0]);
    assert.deepEqual(splitEqually(15, 0), []);
  });
});

describe('calibratePrizeWeights', () => {
  it('répartit le % de gains à parts égales entre les cadeaux', () => {
    const prizes = [
      { id: 1, deadline_days: 0 },
      { id: 2, deadline_days: 7 },
      { id: 3, deadline_days: 7 },
      { id: 4, deadline_days: 14 },
    ];
    // 15 cadeaux / 100 couverts → 15 % de gains, 85 % « Rien »
    const { winWeight, loseWeight, realWeights, loseWeights } = calibratePrizeWeights(prizes, 100, 15);
    assert.equal(winWeight, 15);
    assert.equal(loseWeight, 85);
    assert.deepEqual(realWeights, [5, 5, 5]);
    assert.deepEqual(loseWeights, [85]);
    assert.equal(realWeights.reduce((a, b) => a + b, 0) + loseWeights.reduce((a, b) => a + b, 0), 100);
  });

  it('ne dépend pas des probabilités actuelles (plus de prorata)', () => {
    const prizes = [
      { id: 1, deadline_days: 0, probability: 70 },
      { id: 2, deadline_days: 7, probability: 25 },
      { id: 3, deadline_days: 7, probability: 5 },
    ];
    const { realWeights } = calibratePrizeWeights(prizes, 100, 20);
    assert.deepEqual(realWeights, [10, 10]);
  });

  it('met tout le reste sur le premier lot « Rien »', () => {
    const prizes = [
      { id: 1, deadline_days: 0 },
      { id: 2, deadline_days: 0 },
      { id: 3, deadline_days: 7 },
    ];
    const { realWeights, loseWeights, updates } = calibratePrizeWeights(prizes, 50, 10);
    assert.deepEqual(realWeights, [20]);
    assert.deepEqual(loseWeights, [80, 0]);
    assert.deepEqual(
      updates.map((u) => ({ id: u.id, probability: u.probability })),
      [
        { id: 3, probability: 20 },
        { id: 1, probability: 80 },
        { id: 2, probability: 0 },
      ]
    );
  });

  it('attache chaque poids à l’id du lot (pas d’index fragile)', () => {
    const prizes = [
      { id: 10, deadline_days: 7, probability: 99 },
      { id: 20, deadline_days: 0, probability: 1 },
      { id: 30, deadline_days: 14, probability: 0 },
    ];
    const { updates, winWeight } = calibratePrizeWeights(prizes, 100, 20);
    assert.equal(winWeight, 20);
    const byId = Object.fromEntries(updates.map((u) => [u.id, u.probability]));
    assert.equal(byId[10], 10);
    assert.equal(byId[30], 10);
    assert.equal(byId[20], 80);
  });
});
