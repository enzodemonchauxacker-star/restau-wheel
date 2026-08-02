const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'restau.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = OFF'); // désactivé pendant la migration

// ─── Nouvelles tables ─────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS restaurants (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    email        TEXT    NOT NULL UNIQUE,
    password     TEXT    NOT NULL,
    theme_accent TEXT    NOT NULL DEFAULT '#FFD700',
    url          TEXT    NOT NULL DEFAULT 'http://localhost:3000',
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS prizes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    name          TEXT    NOT NULL,
    description   TEXT    DEFAULT '',
    probability   INTEGER NOT NULL DEFAULT 10,
    deadline_days INTEGER NOT NULL DEFAULT 30,
    color         TEXT    NOT NULL DEFAULT '#FF6B6B',
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    email         TEXT    NOT NULL,
    first_name    TEXT    NOT NULL,
    last_name     TEXT    NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS spins (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    prize_id    INTEGER,
    won_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    deadline    DATETIME,
    used        INTEGER  NOT NULL DEFAULT 0,
    used_at     DATETIME
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Super-admin password global
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('superadmin_password', 'superadmin123');

// ─── Migration depuis l'ancienne base mono-restaurant ────────────────────────
// Ajoute restaurant_id aux anciennes tables si absent
for (const sql of [
  'ALTER TABLE prizes    ADD COLUMN restaurant_id INTEGER',
  'ALTER TABLE customers ADD COLUMN restaurant_id INTEGER',
]) {
  try { db.exec(sql); } catch (_) { /* colonne déjà présente */ }
}

// S'il existe des lots sans restaurant_id, créer un restaurant par défaut
const orphanPrizes = db.prepare('SELECT COUNT(*) as n FROM prizes WHERE restaurant_id IS NULL').get();
if (orphanPrizes.n > 0) {
  const get = key => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r ? r.value : null; };
  const ins = db.prepare('INSERT OR IGNORE INTO restaurants (name, email, password, theme_accent, url) VALUES (?,?,?,?,?)');
  ins.run(
    get('restaurant_name') || 'Mon Restaurant',
    'admin@monrestaurant.fr',
    get('admin_password')  || 'admin123',
    get('theme_accent')    || '#FFD700',
    get('restaurant_url')  || 'http://localhost:3000'
  );
  const r = db.prepare("SELECT id FROM restaurants WHERE email='admin@monrestaurant.fr'").get();
  if (r) {
    db.prepare('UPDATE prizes    SET restaurant_id=? WHERE restaurant_id IS NULL').run(r.id);
    db.prepare('UPDATE customers SET restaurant_id=? WHERE restaurant_id IS NULL').run(r.id);
  }
}

db.exec('PRAGMA foreign_keys = ON');

// ─── Lots par défaut pour un nouveau restaurant ───────────────────────────────
function createDefaultPrizes(restaurantId) {
  const ins = db.prepare('INSERT INTO prizes (restaurant_id, name, description, probability, deadline_days, color) VALUES (?,?,?,?,?,?)');
  ins.run(restaurantId, 'Rien',            'Pas de chance cette fois… Retentez à la prochaine visite !', 6, 0,  '#374151');
  ins.run(restaurantId, '10% sur la note', "Réduction de 10% sur l'addition totale",                    2, 30, '#DC2626');
  ins.run(restaurantId, 'Dessert offert',  'Un dessert au choix offert',                                 2, 30, '#059669');
  ins.run(restaurantId, 'Boisson offerte', 'Une boisson au choix offerte',                               2, 30, '#2563EB');
}

module.exports = { db, createDefaultPrizes };
