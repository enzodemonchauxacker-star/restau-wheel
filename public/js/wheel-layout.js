/**
 * Répartition visuelle des parts de la roue (n’affecte pas les probabilités serveur).
 * Compatible navigateur + Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WheelLayout = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Parts VISUELLES égales par lot (la roue a l’air équitable).
   * Les probabilités réelles restent gérées uniquement côté serveur.
   */
  function visualCounts(list, target) {
    const active = (list || []).filter((p) => (p.probability || 0) > 0);
    if (!active.length) return [];
    const n = active.length;
    const goal = Math.max(target, n);
    const base = Math.floor(goal / n);
    let rem = goal - base * n;
    // Reste réparti de façon stable (ordre d’id) pour rester déterministe
    const ordered = active
      .slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return ordered.map((p, i) => ({
      prize: p,
      n: base + (i < rem ? 1 : 0),
    }));
  }

  function circularDist(a, b, n) {
    const d = Math.abs(a - b);
    return Math.min(d, n - d);
  }

  /**
   * Place les parts en round-robin / residual fair-share autour du cercle.
   * Avec des comptes égaux → alternance régulière (ex. A B C D A B C D …).
   */
  function spreadSlots(items) {
    if (!items || !items.length) return [];
    const N = items.length;
    const piles = new Map();
    for (const s of items) {
      if (!piles.has(s.id)) piles.set(s.id, []);
      piles.get(s.id).push(s);
    }
    if (piles.size === 1) return items.slice();

    const groups = [...piles.entries()]
      .map(([id, arr]) => ({ id, items: arr, count: arr.length, assigned: 0 }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const out = [];
    for (let i = 0; i < N; i++) {
      let best = null;
      let bestScore = -Infinity;
      const lastId = out.length ? out[out.length - 1].id : null;
      for (const g of groups) {
        if (g.assigned >= g.count) continue;
        const ideal = (g.count / N) * (i + 1);
        let score = ideal - g.assigned;
        if (lastId !== null && g.id === lastId) score -= 1; // fort: éviter deux mêmes d’affilée
        const tie = -groups.indexOf(g) * 1e-9;
        if (score + tie > bestScore) {
          bestScore = score + tie;
          best = g;
        }
      }
      if (!best) break;
      out.push(best.items[best.assigned++]);
    }

    // Rotation qui minimise la suite circulaire du même lot (jonction début/fin)
    let bestRot = out;
    let bestRun = maxAdjacentRun(out);
    for (let rot = 1; rot < N; rot++) {
      const candidate = out.slice(rot).concat(out.slice(0, rot));
      const run = maxAdjacentRun(candidate);
      if (run < bestRun) {
        bestRun = run;
        bestRot = candidate;
      }
    }
    return bestRot;
  }

  /** Construit le tableau de slots à partir de la liste de lots API. */
  function buildSlots(prizes, targetSlices) {
    const slots = [];
    visualCounts(prizes, targetSlices).forEach(({ prize: p, n }) => {
      for (let i = 0; i < n; i++) {
        slots.push({
          id: p.id,
          name: p.name,
          is_real: (p.deadline_days || 0) > 0,
          color: p.color,
        });
      }
    });
    return spreadSlots(slots);
  }

  /** Max d’occurrences consécutives du même id (sur cercle). */
  function maxAdjacentRun(slots) {
    if (!slots.length) return 0;
    const N = slots.length;
    let maxRun = 1;
    let run = 1;
    for (let i = 1; i < N; i++) {
      if (slots[i].id === slots[i - 1].id) {
        run++;
        maxRun = Math.max(maxRun, run);
      } else {
        run = 1;
      }
    }
    // Wrap-around
    if (slots[0].id === slots[N - 1].id) {
      let head = 1;
      while (head < N && slots[head].id === slots[0].id) head++;
      let tail = 1;
      while (tail < N && slots[N - 1 - tail].id === slots[0].id) tail++;
      maxRun = Math.max(maxRun, Math.min(N, head + tail));
    }
    return maxRun;
  }

  return { visualCounts, spreadSlots, buildSlots, maxAdjacentRun, circularDist };
});
