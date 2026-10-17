/** CRM clientèle — règles pures, partagées par l’API super-admin. */

const SEGMENTS = ['pending', 'regular', 'new', 'once', 'dormant'];

function parisDateParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, d] = fmt.format(now).split('-').map(Number);
  return { y, m, d };
}

/** Lundi (Europe/Paris) des n dernières semaines, du plus ancien au plus récent. */
function parisWeekKeys(n = 8, now = new Date()) {
  const { y, m, d } = parisDateParts(now);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const mondayOffset = (utc.getUTCDay() + 6) % 7;
  const monday = utc.getTime() - mondayOffset * 86400000;
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    weeks.push(new Date(monday - i * 7 * 86400000).toISOString().slice(0, 10));
  }
  return weeks;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function daySpan(from, to) {
  return (to.getTime() - from.getTime()) / 86400000;
}

/**
 * Segment exclusif, par priorité :
 * gain encore à honorer → habitué actif → inscrit récent → silencieux → une seule visite récente.
 */
function classifyCustomer(row, now = new Date()) {
  const created = row?.created_at ? new Date(row.created_at) : now;
  const last = row?.last_spin_at ? new Date(row.last_spin_at) : null;
  const ageDays = daySpan(created, now);
  const idleDays = last ? daySpan(last, now) : ageDays;
  const spins = num(row?.spin_count);
  if (num(row?.pending_count) > 0) return 'pending';
  if (spins >= 2 && last && idleDays <= 30) return 'regular';
  if (ageDays <= 14) return 'new';
  if (!last || idleDays > 30) return 'dormant';
  return 'once';
}

function displayName(row) {
  return [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
}

function weekKey(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function buildCrmSnapshot({
  customers = [],
  weekly = [],
  prizes = [],
  restaurant = null,
  truncated = false,
  now = new Date(),
} = {}) {
  const counts = { pending: 0, regular: 0, new: 0, once: 0, dormant: 0 };
  let spins = 0;
  let wins = 0;
  let redeemed = 0;
  let withPhone = 0;
  let returning = 0;
  let new30 = 0;
  const people = [];

  for (const row of customers) {
    const segment = classifyCustomer(row, now);
    counts[segment] += 1;
    const spinCount = num(row.spin_count);
    spins += spinCount;
    wins += num(row.win_count);
    redeemed += num(row.redeemed_count);
    if (String(row.phone || '').trim()) withPhone += 1;
    if (spinCount >= 2) returning += 1;
    const created = row.created_at ? new Date(row.created_at) : null;
    if (created && daySpan(created, now) <= 30) new30 += 1;
    const last = row.last_spin_at ? new Date(row.last_spin_at).getTime() : 0;
    const joined = created ? created.getTime() : 0;
    people.push({
      id: row.id,
      name: displayName(row),
      email: row.email || '',
      phone: row.phone || '',
      restaurant_name: row.restaurant_name || '',
      segment,
      spin_count: spinCount,
      pending_count: num(row.pending_count),
      last_spin_at: row.last_spin_at || null,
      created_at: row.created_at || null,
      activity: Math.max(last, joined),
    });
  }

  people.sort((a, b) => b.activity - a.activity);
  const recent = people.slice(0, 8).map(({ activity, ...rest }) => rest);
  const total = customers.length;
  const byWeek = new Map(weekly.map((row) => [weekKey(row.week), num(row.customers)]));

  return {
    restaurant: restaurant ? { id: restaurant.id, name: restaurant.name } : null,
    truncated: !!truncated,
    kpis: {
      customers: total,
      new_30d: new30,
      returning,
      return_rate: total ? returning / total : 0,
      pending: counts.pending,
      with_phone: withPhone,
      phone_rate: total ? withPhone / total : 0,
      spins,
      wins,
      redeemed,
      redemption_rate: wins ? redeemed / wins : null,
    },
    segments: SEGMENTS.map((key) => ({ key, count: counts[key] })),
    weekly: parisWeekKeys(8, now).map((week) => ({
      week,
      customers: byWeek.get(week) || 0,
    })),
    prizes: prizes.slice(0, 5).map((row) => {
      const prizeWins = num(row.wins);
      const prizeRedeemed = num(row.redeemed);
      return {
        name: row.name || '',
        wins: prizeWins,
        redeemed: prizeRedeemed,
        redemption_rate: prizeWins ? prizeRedeemed / prizeWins : null,
      };
    }),
    recent,
  };
}

module.exports = {
  SEGMENTS,
  parisWeekKeys,
  classifyCustomer,
  buildCrmSnapshot,
};
