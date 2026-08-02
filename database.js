const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'restau.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS prizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    probability INTEGER NOT NULL DEFAULT 10,
    deadline_days INTEGER NOT NULL DEFAULT 30,
    color TEXT NOT NULL DEFAULT '#FF6B6B',
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS spins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    prize_id INTEGER,
    won_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deadline DATETIME,
    used INTEGER NOT NULL DEFAULT 0,
    used_at DATETIME,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (prize_id) REFERENCES prizes(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const initSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
initSetting.run('admin_password', 'admin123');
initSetting.run('restaurant_name', 'Mon Restaurant');
initSetting.run('restaurant_url', 'http://localhost:3000');
initSetting.run('theme_accent', '#FFD700');

// probability = nombre de cases sur la roue (total = 12 cases)
const prizesCount = db.prepare('SELECT COUNT(*) as count FROM prizes').get();
if (prizesCount.count === 0) {
  const ins = db.prepare('INSERT INTO prizes (name, description, probability, deadline_days, color) VALUES (?, ?, ?, ?, ?)');
  ins.run('Rien',             'Pas de chance cette fois… Retentez à la prochaine visite !', 6, 0,  '#374151');
  ins.run('10% sur la note',  "Réduction de 10% sur l'addition totale",                    2, 30, '#DC2626');
  ins.run('Dessert offert',   'Un dessert au choix offert',                                 2, 30, '#059669');
  ins.run('Boisson offerte',  'Une boisson au choix offerte',                               2, 30, '#2563EB');
}

module.exports = db;
