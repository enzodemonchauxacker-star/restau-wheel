const express = require('express');
const session = require('express-session');
const QRCode = require('qrcode');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'restau-wheel-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 heures
}));

// ─── Middleware admin ────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Non autorisé' });
}

// ─── Routes client ───────────────────────────────────────────────────────────

// Soumettre infos + faire tourner la roue
app.post('/api/spin', (req, res) => {
  const { email, first_name, last_name } = req.body;

  if (!email || !first_name || !last_name) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }

  // Créer ou retrouver le client
  let customer = db.prepare('SELECT * FROM customers WHERE email = ? COLLATE NOCASE').get(email);
  if (!customer) {
    const result = db.prepare(
      'INSERT INTO customers (email, first_name, last_name) VALUES (?, ?, ?)'
    ).run(email.toLowerCase().trim(), first_name.trim(), last_name.trim());
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
  }

  // Tirer le lot
  const prizes = db.prepare('SELECT * FROM prizes WHERE active = 1').all();
  const totalProb = prizes.reduce((sum, p) => sum + p.probability, 0);
  let rand = Math.random() * totalProb;
  let prize = null;

  for (const p of prizes) {
    rand -= p.probability;
    if (rand <= 0) {
      prize = p;
      break;
    }
  }
  if (!prize) prize = prizes[prizes.length - 1];

  // Vrai lot = pas la case "Rien" (deadline_days > 0)
  const isRealPrize = prize.deadline_days > 0;
  const deadline = isRealPrize
    ? new Date(Date.now() + prize.deadline_days * 86400000).toISOString()
    : null;

  const spin = db.prepare(`
    INSERT INTO spins (customer_id, prize_id, deadline)
    VALUES (?, ?, ?)
  `).run(customer.id, prize.id, deadline);

  res.json({
    prize: {
      id: prize.id,
      name: prize.name,
      description: prize.description,
      color: prize.color,
      deadline_days: prize.deadline_days,
      deadline: deadline,
      is_real_prize: isRealPrize
    },
    spin_id: spin.lastInsertRowid,
    customer: {
      first_name: customer.first_name,
      last_name: customer.last_name
    }
  });
});

// Récupérer les lots actifs (pour afficher la roue)
app.get('/api/prizes', (req, res) => {
  const prizes = db.prepare('SELECT * FROM prizes WHERE active = 1').all();
  res.json(prizes);
});

// ─── Routes admin ────────────────────────────────────────────────────────────

// Login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get();
  if (stored && password === stored.value) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/me', (req, res) => {
  if (req.session && req.session.isAdmin) {
    const name = db.prepare("SELECT value FROM settings WHERE key = 'restaurant_name'").get();
    res.json({ isAdmin: true, restaurant_name: name ? name.value : '' });
  } else {
    res.json({ isAdmin: false });
  }
});

// Recherche client
app.get('/api/admin/search', requireAdmin, (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Recherche trop courte' });
  }

  const term = `%${q.trim()}%`;
  const customers = db.prepare(`
    SELECT * FROM customers
    WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
    ORDER BY last_name, first_name
    LIMIT 20
  `).all(term, term, term);

  const result = customers.map(c => {
    const spins = db.prepare(`
      SELECT s.*, p.name as prize_name, p.description as prize_description,
             p.color as prize_color, p.deadline_days
      FROM spins s
      LEFT JOIN prizes p ON s.prize_id = p.id
      WHERE s.customer_id = ? AND p.deadline_days > 0
      ORDER BY s.won_at DESC
    `).all(c.id);

    return { ...c, spins };
  });

  res.json(result);
});

// Marquer un gain comme utilisé
app.put('/api/admin/spins/:id/use', requireAdmin, (req, res) => {
  const spinId = parseInt(req.params.id);
  const spin = db.prepare('SELECT * FROM spins WHERE id = ?').get(spinId);

  if (!spin) return res.status(404).json({ error: 'Gain introuvable' });
  if (spin.used) return res.status(400).json({ error: 'Déjà utilisé' });

  // Vérifier deadline
  if (spin.deadline && new Date(spin.deadline) < new Date()) {
    return res.status(400).json({ error: 'Ce gain a expiré' });
  }

  db.prepare(`
    UPDATE spins SET used = 1, used_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(spinId);

  res.json({ success: true });
});

// CRUD Lots ──────────────────────────────────────────────────────────────────

app.get('/api/admin/prizes', requireAdmin, (req, res) => {
  const prizes = db.prepare('SELECT * FROM prizes ORDER BY probability DESC').all();
  res.json(prizes);
});

app.post('/api/admin/prizes', requireAdmin, (req, res) => {
  const { name, description, probability, deadline_days, color } = req.body;
  if (!name || probability == null || deadline_days == null) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  const result = db.prepare(`
    INSERT INTO prizes (name, description, probability, deadline_days, color)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, description || '', parseInt(probability), parseInt(deadline_days), color || '#FF6B6B');

  const prize = db.prepare('SELECT * FROM prizes WHERE id = ?').get(result.lastInsertRowid);
  res.json(prize);
});

app.put('/api/admin/prizes/:id', requireAdmin, (req, res) => {
  const { name, description, probability, deadline_days, color, active } = req.body;
  const id = parseInt(req.params.id);

  db.prepare(`
    UPDATE prizes SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      probability = COALESCE(?, probability),
      deadline_days = COALESCE(?, deadline_days),
      color = COALESCE(?, color),
      active = COALESCE(?, active)
    WHERE id = ?
  `).run(name, description, probability != null ? parseInt(probability) : null,
    deadline_days != null ? parseInt(deadline_days) : null,
    color, active != null ? (active ? 1 : 0) : null, id);

  const prize = db.prepare('SELECT * FROM prizes WHERE id = ?').get(id);
  res.json(prize);
});

app.delete('/api/admin/prizes/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('UPDATE prizes SET active = 0 WHERE id = ?').run(id);
  res.json({ success: true });
});

// Paramètres restaurant
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM settings WHERE key != 'admin_password'").all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const { restaurant_name, restaurant_url, admin_password } = req.body;

  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  if (restaurant_name) upsert.run('restaurant_name', restaurant_name);
  if (restaurant_url) upsert.run('restaurant_url', restaurant_url);
  if (admin_password && admin_password.length >= 4) upsert.run('admin_password', admin_password);

  res.json({ success: true });
});

// Générer QR code
app.get('/api/admin/qrcode', requireAdmin, async (req, res) => {
  const urlRow = db.prepare("SELECT value FROM settings WHERE key = 'restaurant_url'").get();
  const url = (urlRow ? urlRow.value : `http://localhost:${PORT}`) + '/client';

  try {
    const qrDataURL = await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' }
    });
    res.json({ qr: qrDataURL, url });
  } catch (err) {
    res.status(500).json({ error: 'Erreur génération QR code' });
  }
});

// Stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const totalSpins = db.prepare('SELECT COUNT(*) as n FROM spins').get().n;
  const totalWins = db.prepare('SELECT COUNT(*) as n FROM spins WHERE prize_id IN (SELECT id FROM prizes WHERE deadline_days > 0)').get().n;
  const usedWins = db.prepare('SELECT COUNT(*) as n FROM spins WHERE used = 1').get().n;
  const expiredWins = db.prepare(`
    SELECT COUNT(*) as n FROM spins
    WHERE used = 0 AND deadline IS NOT NULL AND deadline < CURRENT_TIMESTAMP
  `).get().n;
  const pendingWins = db.prepare(`
    SELECT COUNT(*) as n FROM spins
    WHERE used = 0 AND deadline IS NOT NULL AND deadline > CURRENT_TIMESTAMP
  `).get().n;

  res.json({ totalSpins, totalWins, usedWins, expiredWins, pendingWins });
});

// ─── Pages HTML ──────────────────────────────────────────────────────────────
app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/', (req, res) => {
  res.redirect('/admin');
});

app.listen(PORT, () => {
  console.log(`\n🍽️  Restau Wheel démarré sur http://localhost:${PORT}`);
  console.log(`   → Page client : http://localhost:${PORT}/client`);
  console.log(`   → Admin       : http://localhost:${PORT}/admin`);
  console.log(`   → Mot de passe par défaut : admin123\n`);
});
