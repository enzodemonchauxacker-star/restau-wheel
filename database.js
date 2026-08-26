const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

// Charge .env local si DATABASE_URL absent (Vercel injecte déjà les vars)
function loadEnvFile() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}
loadEnvFile();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL manquant — configure Neon (voir .env ou Vercel)');
}

// Prefer pooled URL for serverless (WebSocket/HTTP)
function toPooled(url) {
  if (/-pooler\./i.test(url) || /@ep-[a-z0-9-]+-pooler\./i.test(url)) return url;
  return url.replace(/(@ep-[a-z0-9-]+)\./i, '$1-pooler.');
}
const connectionString = toPooled(process.env.DATABASE_URL);

const sql = neon(connectionString);

/** Convertit les ? SQLite en $1, $2… Postgres */
function toPg(text) {
  let i = 0;
  return text
    .replace(/\bIFNULL\s*\(/gi, 'COALESCE(')
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\s+settings\b/gi,
      'INSERT INTO settings')
    .replace(/\bINSERT\s+OR\s+REPLACE\s+INTO\s+settings\b/gi,
      'INSERT INTO settings')
    .replace(/\?/g, () => `$${++i}`);
}

function finalizeSettingsUpsert(text, original) {
  if (/INSERT\s+OR\s+IGNORE\s+INTO\s+settings/i.test(original)) {
    return `${text} ON CONFLICT (key) DO NOTHING`;
  }
  if (/INSERT\s+OR\s+REPLACE\s+INTO\s+settings/i.test(original)) {
    return `${text} ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  }
  if (/INSERT\s+OR\s+IGNORE\s+INTO\s+restaurants/i.test(original)) {
    return `${text.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO')} ON CONFLICT (email) DO NOTHING`;
  }
  return text;
}

let readyPromise = null;
let initializing = false;

function newPublicCode() {
  return crypto.randomBytes(4).toString('hex');
}

function firstRow(result) {
  if (!result) return undefined;
  if (Array.isArray(result)) return result[0];
  if (Array.isArray(result.rows)) return result.rows[0];
  return undefined;
}

function allRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.rows)) return result.rows;
  return [];
}

async function backfillPublicCodes() {
  const missing = allRows(await sql`SELECT id FROM restaurants WHERE public_code IS NULL OR public_code = ''`);
  for (const row of missing) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = newPublicCode();
      try {
        await sql`UPDATE restaurants SET public_code = ${code} WHERE id = ${row.id}`;
        break;
      } catch {
        /* collision unique, on retente */
      }
    }
  }
}

async function ensureReady() {
  if (initializing) return;
  if (!readyPromise) readyPromise = initSchema();
  return readyPromise;
}

async function initSchema() {
  initializing = true;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS restaurants (
        id                  SERIAL PRIMARY KEY,
        name                TEXT NOT NULL,
        email               TEXT NOT NULL UNIQUE,
        password            TEXT NOT NULL,
        theme_accent        TEXT NOT NULL DEFAULT '#FFD700',
        url                 TEXT NOT NULL DEFAULT 'http://localhost:3000',
        email_from_name     TEXT,
        email_reply_to      TEXT,
        send_win_email      INTEGER NOT NULL DEFAULT 1,
        send_lose_email     INTEGER NOT NULL DEFAULT 0,
        reminder_days       INTEGER NOT NULL DEFAULT 3,
        active              INTEGER NOT NULL DEFAULT 1,
        daily_covers        INTEGER,
        daily_gifts         INTEGER,
        spin_cooldown_hours INTEGER NOT NULL DEFAULT 24,
        public_code         TEXT UNIQUE,
        created_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS theme_accent TEXT NOT NULL DEFAULT '#FFD700'`;
    await sql`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_code TEXT`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS restaurants_public_code_uidx ON restaurants (public_code)`;
    await backfillPublicCodes();

    await sql`
      CREATE TABLE IF NOT EXISTS prizes (
        id            SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT DEFAULT '',
        probability   INTEGER NOT NULL DEFAULT 10,
        deadline_days INTEGER NOT NULL DEFAULT 30,
        color         TEXT NOT NULL DEFAULT '#FF6B6B',
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS customers (
        id            SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL,
        email         TEXT NOT NULL,
        first_name    TEXT NOT NULL,
        last_name     TEXT NOT NULL,
        phone         TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS spins (
        id               SERIAL PRIMARY KEY,
        customer_id      INTEGER NOT NULL,
        prize_id         INTEGER,
        won_at           TIMESTAMPTZ DEFAULT NOW(),
        deadline         TIMESTAMPTZ,
        used             INTEGER NOT NULL DEFAULT 0,
        used_at          TIMESTAMPTZ,
        last_reminder_at TIMESTAMPTZ,
        allow_reminders  INTEGER NOT NULL DEFAULT 0,
        sms_week_sent    INTEGER NOT NULL DEFAULT 0
      )
    `;
    await sql`ALTER TABLE spins ADD COLUMN IF NOT EXISTS device_id TEXT`;
    await sql`CREATE INDEX IF NOT EXISTS spins_device_id_idx ON spins (device_id)`;

    await sql`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS prospects (
        id               SERIAL PRIMARY KEY,
        restaurant_name  TEXT NOT NULL,
        contact_name     TEXT DEFAULT '',
        phone            TEXT NOT NULL,
        email            TEXT DEFAULT '',
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS prospects_created_at_idx ON prospects (created_at DESC)`;
    await sql`ALTER TABLE prospects ALTER COLUMN phone SET DEFAULT ''`;
    await sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'form'`;
    await sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS osm_id TEXT`;
    await sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS address TEXT DEFAULT ''`;
    await sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website TEXT DEFAULT ''`;
    await sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS city TEXT DEFAULT ''`;
    await sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'`;
    await sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ`;
    await sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS google_place_id TEXT`;
    await sql`ALTER TABLE prospects ADD COLUMN IF NOT EXISTS siret TEXT DEFAULT ''`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS prospects_osm_id_uidx ON prospects (osm_id) WHERE osm_id IS NOT NULL AND osm_id <> ''`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS prospects_google_place_id_uidx ON prospects (google_place_id) WHERE google_place_id IS NOT NULL AND google_place_id <> ''`;

    await sql`
      CREATE TABLE IF NOT EXISTS demo_visits (
        id            SERIAL PRIMARY KEY,
        visitor_hash  TEXT NOT NULL,
        referrer      TEXT DEFAULT '',
        source        TEXT DEFAULT '',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS demo_visits_created_at_idx ON demo_visits (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS demo_visits_hash_created_idx ON demo_visits (visitor_hash, created_at DESC)`;

    const defaults = [
      ['superadmin_password', 'superadmin123'],
      ['smtp_host', ''],
      ['smtp_port', '587'],
      ['smtp_user', ''],
      ['smtp_pass', ''],
      ['twilio_sid', ''],
      ['twilio_token', ''],
      ['twilio_from', ''],
      ['prospect_city', 'Lauris'],
      ['prospect_radius_km', '12'],
      ['prospect_auto', '1'],
      ['google_places_key', ''],
      ['pappers_api_token', ''],
    ];
    for (const [k, v] of defaults) {
      await sql`INSERT INTO settings (key, value) VALUES (${k}, ${v}) ON CONFLICT (key) DO NOTHING`;
    }

    if (process.env.SUPERADMIN_PASSWORD) {
      await sql`
        INSERT INTO settings (key, value) VALUES ('superadmin_password', ${process.env.SUPERADMIN_PASSWORD})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }

    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM restaurants`;
    if (n === 0) {
      const rows = await sql`
        INSERT INTO restaurants (name, email, password, theme_accent, url, public_code)
        VALUES (
          'Restau Wheel Demo',
          'teddy@restauwheel.com',
          'teddy2026',
          '#FF2D6A',
          ${process.env.PUBLIC_BASE_URL || 'https://restauwheel.com'},
          ${newPublicCode()}
        )
        RETURNING id
      `;
      await createDefaultPrizes(rows[0].id);
      console.log('[DB] Seed Neon admin: teddy@restauwheel.com / teddy2026 (id=' + rows[0].id + ')');
    } else {
      // Complète les lots manquants pour le resto démo si seed partiel
      const demo = await sql`SELECT id FROM restaurants WHERE email = 'teddy@restauwheel.com' LIMIT 1`;
      if (demo[0]) {
        const [{ pn }] = await sql`SELECT COUNT(*)::int AS pn FROM prizes WHERE restaurant_id = ${demo[0].id}`;
        if (pn === 0) await createDefaultPrizes(demo[0].id);
      }
    }

    await ensureDemoRestaurant();

    console.log('[DB] Neon Postgres prêt');
  } finally {
    initializing = false;
  }
}

/**
 * API compatible better-sqlite3 / node:sqlite (async).
 * Tous les appels .get/.all/.run doivent être await.
 */
const db = {
  prepare(originalSql) {
    const base = finalizeSettingsUpsert(toPg(originalSql), originalSql);
    return {
      async get(...params) {
        await ensureReady();
        const rows = allRows(await sql.query(base, params));
        return rows[0];
      },
      async all(...params) {
        await ensureReady();
        return allRows(await sql.query(base, params));
      },
      async run(...params) {
        await ensureReady();
        const isInsert = /^\s*INSERT\b/i.test(originalSql);
        const intoSettings = /\bINTO\s+settings\b/i.test(originalSql);
        const q = isInsert && !intoSettings && !/\bRETURNING\b/i.test(base) ? `${base} RETURNING id` : base;
        const rows = allRows(await sql.query(q, params));
        return {
          lastInsertRowid: firstRow(rows)?.id ?? null,
          changes: rows.length,
        };
      },
    };
  },

  async exec(multiSql) {
    await ensureReady();
    // Pas de multi-statements via neon HTTP — no-op legacy
    void multiSql;
  },
};

async function ensureDemoRestaurant() {
  const existing = allRows(await sql`
    SELECT id FROM restaurants
    WHERE public_code = 'demo' OR lower(email) = 'demo@restauwheel.com'
    LIMIT 1
  `);
  let id = existing[0]?.id;
  if (id) {
    await sql`UPDATE restaurants SET public_code = 'demo', name = 'Restau Wheel', active = 1 WHERE id = ${id}`;
  } else {
    const rows = allRows(await sql`
      INSERT INTO restaurants (name, email, password, theme_accent, url, public_code)
      VALUES (
        'Restau Wheel',
        'demo@restauwheel.com',
        ${crypto.randomBytes(16).toString('hex')},
        '#FF2D6A',
        ${process.env.PUBLIC_BASE_URL || 'https://restauwheel.com'},
        'demo'
      )
      RETURNING id
    `);
    id = rows[0]?.id;
  }
  if (!id) return;
  const [{ pn }] = allRows(await sql`SELECT COUNT(*)::int AS pn FROM prizes WHERE restaurant_id = ${id} AND active = 1`);
  if (!pn) await createDefaultPrizes(id);
}

async function createDefaultPrizes(restaurantId) {
  await ensureReady();
  const ins = db.prepare(
    'INSERT INTO prizes (restaurant_id, name, description, probability, deadline_days, color) VALUES (?,?,?,?,?,?)'
  );
  await ins.run(restaurantId, 'Rien', 'Pas de chance cette fois… Retentez à la prochaine visite !', 6, 0, '#374151');
  await ins.run(restaurantId, '10% sur la note', "Réduction de 10% sur l'addition totale", 2, 30, '#DC2626');
  await ins.run(restaurantId, 'Dessert offert', 'Un dessert au choix offert', 2, 30, '#059669');
  await ins.run(restaurantId, 'Boisson offerte', 'Une boisson au choix offerte', 2, 30, '#2563EB');
}

module.exports = { db, createDefaultPrizes, ensureReady, newPublicCode, ensureDemoRestaurant };
