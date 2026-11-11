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

/** Étapes du pipeline. Une étape enregistrée reste, sinon on reprend le segment calculé. */
const STAGES = ['new', 'once', 'regular', 'pending', 'dormant'];

const FIELD_ERRORS = {
  first_name: 'Le prénom est requis.',
  last_name: 'Le nom est requis.',
  email: 'L’e-mail n’est pas valide.',
  restaurant_id: 'Choisis un restaurant.',
  stage: 'Cette étape n’existe pas.',
  note: 'La note est vide.',
  task: 'La tâche est vide.',
};

function cleanText(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.slice(0, max);
}

function cleanNote(value) {
  const text = cleanText(value, 2000);
  return text || null;
}

function cleanTaskTitle(value) {
  const text = cleanText(value, 180);
  return text || null;
}

function effectiveStage(row, now = new Date()) {
  const saved = String(row?.crm_stage || '').trim();
  if (STAGES.includes(saved)) return saved;
  return classifyCustomer(row, now);
}

function personCard(row, now = new Date()) {
  const saved = String(row?.crm_stage || '').trim();
  return {
    id: row.id,
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    name: displayName(row),
    email: row.email || '',
    phone: row.phone || '',
    restaurant_id: row.restaurant_id,
    restaurant_name: row.restaurant_name || '',
    stage: effectiveStage(row, now),
    stage_manual: STAGES.includes(saved),
    spin_count: num(row.spin_count),
    pending_count: num(row.pending_count),
    note_count: num(row.note_count),
    open_tasks: num(row.open_tasks),
    last_spin_at: row.last_spin_at || null,
    created_at: row.created_at || null,
  };
}

function spinLine(row) {
  return {
    id: row.id,
    prize: row.prize_name || '',
    won_at: row.won_at || null,
    used: num(row.used) === 1,
    deadline: row.deadline || null,
  };
}

function buildPersonFile({ customer, notes = [], tasks = [], spins = [], now = new Date() } = {}) {
  return {
    person: personCard(customer, now),
    notes: notes.map((note) => ({
      id: note.id,
      body: note.body || '',
      created_at: note.created_at || null,
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title || '',
      done: num(task.done) === 1,
      created_at: task.created_at || null,
    })),
    spins: spins.map(spinLine),
  };
}

function groupPipeline(people, stages = STAGES) {
  const buckets = new Map(stages.map((key) => [key, []]));
  for (const person of people || []) {
    const key = buckets.has(person.stage) ? person.stage : stages[0];
    buckets.get(key).push(person);
  }
  return stages.map((key) => ({ key, people: buckets.get(key) }));
}

function validEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 160) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

/**
 * Champs acceptés pour créer ou modifier une fiche.
 * En création, prénom, nom, e-mail et restaurant sont obligatoires.
 */
function parsePersonInput(body, { creating = false } = {}) {
  const src = body && typeof body === 'object' ? body : {};
  const value = {};
  const need = (key) => creating || Object.prototype.hasOwnProperty.call(src, key);

  if (need('first_name')) {
    const first = cleanText(src.first_name, 80);
    if (!first) return { error: FIELD_ERRORS.first_name };
    value.first_name = first;
  }
  if (need('last_name')) {
    const last = cleanText(src.last_name, 80);
    if (!last) return { error: FIELD_ERRORS.last_name };
    value.last_name = last;
  }
  if (need('email')) {
    const email = validEmail(src.email);
    if (!email) return { error: FIELD_ERRORS.email };
    value.email = email;
  }
  if (need('phone') || creating) {
    value.phone = cleanText(src.phone, 30);
  }
  if (need('restaurant_id')) {
    const id = parseInt(src.restaurant_id, 10);
    if (!id || id < 1) return { error: FIELD_ERRORS.restaurant_id };
    value.restaurant_id = id;
  }
  if (Object.prototype.hasOwnProperty.call(src, 'stage')) {
    if (src.stage == null || src.stage === '' || src.stage === 'auto') value.crm_stage = null;
    else if (!STAGES.includes(src.stage)) return { error: FIELD_ERRORS.stage };
    else value.crm_stage = src.stage;
  }
  return { value };
}

module.exports = {
  SEGMENTS,
  STAGES,
  FIELD_ERRORS,
  parisWeekKeys,
  classifyCustomer,
  buildCrmSnapshot,
  effectiveStage,
  personCard,
  buildPersonFile,
  groupPipeline,
  cleanNote,
  cleanTaskTitle,
  parsePersonInput,
};
