/**
 * Répartit `total` en `n` parts entières aussi égales que possible.
 * La somme des parts vaut exactement `total` (sauf n<=0).
 * Ex. splitEqually(15, 3) → [5,5,5] ; splitEqually(10, 3) → [4,3,3]
 */
function splitEqually(total, n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  const sum = Math.max(0, Math.floor(Number(total) || 0));
  if (count <= 0) return [];
  if (sum <= 0) return Array(count).fill(0);

  const base = Math.floor(sum / count);
  const rem = sum - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Calcule les probabilités calibrées pour les lots cadeaux et les lots « Rien ».
 * - Budget gains = round((gifts/covers)*100)
 * - Réparti équitablement entre tous les lots cadeaux (deadline_days > 0)
 * - Le reste va au premier lot « Rien » (les autres restent à 0)
 *
 * @param {{ deadline_days: number }[]} prizes
 * @param {number} covers
 * @param {number} gifts
 * @returns {{ winWeight: number, loseWeight: number, realWeights: number[], loseWeights: number[] }}
 */
function calibratePrizeWeights(prizes, covers, gifts) {
  const list = Array.isArray(prizes) ? prizes : [];
  const c = Math.max(1, Math.floor(Number(covers) || 0));
  const g = Math.max(0, Math.min(c, Math.floor(Number(gifts) || 0)));

  const real = list.filter((p) => Number(p.deadline_days) > 0);
  const lose = list.filter((p) => !(Number(p.deadline_days) > 0));

  const TOTAL = 100;
  const winWeight = Math.round((g / c) * TOTAL);
  const loseWeight = TOTAL - winWeight;

  const realWeights = splitEqually(winWeight, real.length);
  const loseWeights = lose.map((_, i) => (i === 0 ? Math.max(0, loseWeight) : 0));

  return { winWeight, loseWeight, realWeights, loseWeights };
}

module.exports = { splitEqually, calibratePrizeWeights };
