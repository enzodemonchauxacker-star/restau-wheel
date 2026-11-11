/** Remplit une série (semaine = 7, année = 12) à partir de buckets 1-indexés. */
function seriesFromRows(rows, size) {
  const out = Array.from({ length: size }, () => 0);
  for (const row of rows || []) {
    const i = Math.round(Number(row.bucket)) - 1;
    if (i >= 0 && i < size) out[i] = Number(row.n) || 0;
  }
  return out;
}

module.exports = { seriesFromRows };
