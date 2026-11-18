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

  /** Répartit les lots sur `target` parts lisibles. Chaque lot a au moins 1 case. */
  function visualCounts(list, target) {
    const active = (list || []).filter((p) => (p.probability || 0) > 0);
    if (!active.length) return [];
    const goal = Math.max(target, active.length);
    const total = active.reduce((s, p) => s + p.probability, 0) || 1;
    const counts = active.map((p) => ({
      prize: p,
      n: Math.max(1, Math.round((p.probability / total) * goal)),
    }));
    let sum = counts.reduce((s, c) => s + c.n, 0);
    const fattest = () => counts.reduce((a, b) => (a.n >= b.n ? a : b));
    while (sum > goal && counts.some((c) => c.n > 1)) {
      const row = fattest();
      if (row.n <= 1) break;
      row.n--;
      sum--;
    }
    while (sum < goal) {
      fattest().n++;
      sum++;
    }
    return counts;
  }

  function circularDist(a, b, n) {
    const d = Math.abs(a - b);
    return Math.min(d, n - d);
  }

  /** `n` indices régulièrement espacés sur un cercle de taille N (phase choisie). */
  function evenPositions(N, n, phase) {
    const pos = [];
    for (let k = 0; k < n; k++) {
      pos.push(Math.round(phase + (k * N) / n) % N);
    }
    // Dédupliquer collisions d’arrondi en poussant au prochain libre
    const used = new Set();
    for (let i = 0; i < pos.length; i++) {
      let p = pos[i];
      let guard = 0;
      while (used.has(p) && guard < N) {
        p = (p + 1) % N;
        guard++;
      }
      used.add(p);
      pos[i] = p;
    }
    return pos;
  }

  /**
   * Place les parts pour un enchaînement régulier autour du cercle —
   * sans changer le nombre de parts par lot.
   *
   * 1) Le lot majoritaire (souvent « Rien ») est mis de côté
   * 2) Les autres lots sont posés sur une grille régulière
   * 3) Dans cette grille, chaque lot est aussi espacé
   * 4) Les cases restantes sont remplies par le lot majoritaire
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

    const groups = [...piles.values()].sort((a, b) => {
      if (a.length !== b.length) return b.length - a.length; // majorité d’abord pour l’identifier
      return String(a[0].id).localeCompare(String(b[0].id));
    });
    const majority = groups[0];
    const rareGroups = groups
      .slice(1)
      .sort((a, b) => {
        if (a.length !== b.length) return a.length - b.length;
        return String(a[0].id).localeCompare(String(b[0].id));
      });

    const rareCount = rareGroups.reduce((s, g) => s + g.length, 0);
    const out = new Array(N).fill(null);

    // Grille régulière pour tous les lots non majoritaires
    let bestPhase = 0;
    let bestMinGap = -1;
    for (let phase = 0; phase < N; phase++) {
      const pos = evenPositions(N, rareCount, phase).slice().sort((a, b) => a - b);
      let minGap = N;
      for (let i = 0; i < pos.length; i++) {
        const a = pos[i];
        const b = pos[(i + 1) % pos.length];
        const gap = i + 1 === pos.length ? a + N - b : b - a;
        minGap = Math.min(minGap, gap);
      }
      if (minGap > bestMinGap || (minGap === bestMinGap && phase < bestPhase)) {
        bestMinGap = minGap;
        bestPhase = phase;
      }
    }
    const rarePositions = evenPositions(N, rareCount, bestPhase).sort((a, b) => a - b);

    // Sur ces positions, placer chaque lot rare de façon espacée
    const rareSlots = rarePositions.map((p) => ({ p, item: null }));
    for (const pile of rareGroups) {
      const m = pile.length;
      const idxs = evenPositions(rareCount, m, 0);
      // Choisir un décalage dans la sous-grille qui évite les collisions
      let placed = false;
      for (let shift = 0; shift < rareCount && !placed; shift++) {
        const targets = idxs.map((i) => (i + shift) % rareCount);
        if (targets.every((t) => rareSlots[t].item === null)) {
          targets.sort((a, b) => a - b);
          for (let i = 0; i < m; i++) {
            rareSlots[targets[i]].item = pile[i];
          }
          placed = true;
        }
      }
      if (!placed) {
        // Fallback : premières cases libres
        let pi = 0;
        for (let i = 0; i < rareCount && pi < m; i++) {
          if (!rareSlots[i].item) rareSlots[i].item = pile[pi++];
        }
      }
    }

    for (const slot of rareSlots) {
      if (slot.item) out[slot.p] = slot.item;
    }

    let mi = 0;
    for (let i = 0; i < N; i++) {
      if (!out[i]) out[i] = majority[mi++];
    }
    return out;
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
