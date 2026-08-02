const express = require('express');
const session = require('express-session');
const QRCode  = require('qrcode');
const path    = require('path');
const cron    = require('node-cron');
const { db, createDefaultPrizes } = require('./database');
const { sendSpinEmail, sendReminderEmail } = require('./mailer');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// HTML jamais mis en cache (les JS/CSS/images restent cachés normalement)
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'restau-wheel-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// ─── Middleware ───────────────────────────────────────────────────────────────
function requireRestaurant(req, res, next) {
  if (req.session?.restaurantId) return next();
  res.status(401).json({ error: 'Non autorisé' });
}

function requireSuperAdmin(req, res, next) {
  if (req.session?.isSuperAdmin) return next();
  res.status(401).json({ error: 'Non autorisé' });
}

// ─── Routes publiques client ─────────────────────────────────────────────────

// Lots actifs d'un restaurant (pour dessiner la roue)
app.get('/api/prizes', (req, res) => {
  const rid = parseInt(req.query.r);
  if (!rid) return res.status(400).json({ error: 'Restaurant manquant' });
  const prizes = db.prepare('SELECT * FROM prizes WHERE restaurant_id=? AND active=1').all(rid);
  res.json(prizes);
});

// Thème du restaurant (couleur principale, nom)
app.get('/api/theme', (req, res) => {
  const rid = parseInt(req.query.r);
  if (!rid) return res.json({ theme_accent: '#FFD700' });
  const r = db.prepare('SELECT name, theme_accent FROM restaurants WHERE id=? AND active=1').get(rid);
  if (!r) return res.json({ theme_accent: '#FFD700' });
  res.json({ theme_accent: r.theme_accent, restaurant_name: r.name });
});

// Tirage de la roue
app.post('/api/spin', (req, res) => {
  const { email, first_name, last_name, restaurant_id } = req.body;
  const rid = parseInt(restaurant_id);

  if (!email || !first_name || !last_name || !rid) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  const resto = db.prepare('SELECT id FROM restaurants WHERE id=? AND active=1').get(rid);
  if (!resto) return res.status(404).json({ error: 'Restaurant introuvable' });

  // Créer ou retrouver le client pour CE restaurant
  let customer = db.prepare('SELECT * FROM customers WHERE email=? AND restaurant_id=? COLLATE NOCASE').get(email.toLowerCase().trim(), rid);
  if (!customer) {
    const r = db.prepare('INSERT INTO customers (restaurant_id, email, first_name, last_name) VALUES (?,?,?,?)').run(rid, email.toLowerCase().trim(), first_name.trim(), last_name.trim());
    customer = db.prepare('SELECT * FROM customers WHERE id=?').get(r.lastInsertRowid);
  }

  // Tirage pondéré
  const prizes = db.prepare('SELECT * FROM prizes WHERE restaurant_id=? AND active=1').all(rid);
  const total  = prizes.reduce((s, p) => s + p.probability, 0);
  let rand = Math.random() * total;
  let prize = prizes[prizes.length - 1];
  for (const p of prizes) { rand -= p.probability; if (rand <= 0) { prize = p; break; } }

  const isReal   = prize.deadline_days > 0;
  const deadline = isReal ? new Date(Date.now() + prize.deadline_days * 86400000).toISOString() : null;

  const spin = db.prepare('INSERT INTO spins (customer_id, prize_id, deadline) VALUES (?,?,?)').run(customer.id, prize.id, deadline);

  res.json({
    prize: { id: prize.id, name: prize.name, description: prize.description, color: prize.color, deadline_days: prize.deadline_days, deadline, is_real_prize: isReal },
    spin_id: spin.lastInsertRowid,
    customer: { first_name: customer.first_name, last_name: customer.last_name }
  });

  // Email asynchrone (n'impacte pas la réponse au client)
  const restaurant = db.prepare('SELECT * FROM restaurants WHERE id=?').get(rid);
  sendSpinEmail({ customer, prize: { ...prize, deadline }, restaurant, isWin: isReal }).catch(() => {});
});

// Opt-in rappels (public — le spin_id est renvoyé juste après le tirage)
app.put('/api/spin/:id/reminders', (req, res) => {
  const { allow } = req.body;
  db.prepare('UPDATE spins SET allow_reminders=? WHERE id=?').run(allow ? 1 : 0, parseInt(req.params.id));
  res.json({ success: true });
});

// ─── Inscription restaurant ───────────────────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });
  if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'Email invalide' });

  const exists = db.prepare('SELECT id FROM restaurants WHERE email=? COLLATE NOCASE').get(email.trim());
  if (exists) return res.status(409).json({ error: 'Cet email est déjà utilisé' });

  const r = db.prepare('INSERT INTO restaurants (name, email, password) VALUES (?,?,?)').run(name.trim(), email.toLowerCase().trim(), password);
  createDefaultPrizes(r.lastInsertRowid);

  req.session.restaurantId   = r.lastInsertRowid;
  req.session.restaurantName = name.trim();
  res.json({ success: true, restaurant_id: r.lastInsertRowid });
});

// ─── Auth admin restaurant ────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  const r = db.prepare('SELECT * FROM restaurants WHERE email=? COLLATE NOCASE AND active=1').get(email?.trim());
  if (!r || password !== r.password) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  req.session.restaurantId   = r.id;
  req.session.restaurantName = r.name;
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/admin/me', (req, res) => {
  if (!req.session?.restaurantId) return res.json({ isAdmin: false });
  const r = db.prepare('SELECT name, url, theme_accent FROM restaurants WHERE id=?').get(req.session.restaurantId);
  res.json({ isAdmin: true, restaurant_name: r?.name || '', restaurant_url: r?.url || '', theme_accent: r?.theme_accent || '#FFD700' });
});

// ─── Routes admin (protégées par restaurant) ─────────────────────────────────
app.get('/api/admin/stats', requireRestaurant, (req, res) => {
  const rid = req.session.restaurantId;
  const totalSpins  = db.prepare('SELECT COUNT(*) as n FROM spins WHERE customer_id IN (SELECT id FROM customers WHERE restaurant_id=?)').get(rid).n;
  const totalWins   = db.prepare('SELECT COUNT(*) as n FROM spins WHERE customer_id IN (SELECT id FROM customers WHERE restaurant_id=?) AND prize_id IN (SELECT id FROM prizes WHERE deadline_days>0)').get(rid).n;
  const usedWins    = db.prepare('SELECT COUNT(*) as n FROM spins WHERE used=1 AND customer_id IN (SELECT id FROM customers WHERE restaurant_id=?)').get(rid).n;
  const expiredWins = db.prepare('SELECT COUNT(*) as n FROM spins WHERE used=0 AND deadline IS NOT NULL AND deadline<CURRENT_TIMESTAMP AND customer_id IN (SELECT id FROM customers WHERE restaurant_id=?)').get(rid).n;
  const pendingWins = db.prepare('SELECT COUNT(*) as n FROM spins WHERE used=0 AND deadline IS NOT NULL AND deadline>CURRENT_TIMESTAMP AND customer_id IN (SELECT id FROM customers WHERE restaurant_id=?)').get(rid).n;
  res.json({ totalSpins, totalWins, usedWins, expiredWins, pendingWins });
});

app.get('/api/admin/search', requireRestaurant, (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Recherche trop courte' });
  const rid  = req.session.restaurantId;
  const term = `%${q.trim()}%`;
  const customers = db.prepare('SELECT * FROM customers WHERE restaurant_id=? AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?) ORDER BY last_name, first_name LIMIT 20').all(rid, term, term, term);
  const result = customers.map(c => {
    const spins = db.prepare('SELECT s.*, p.name as prize_name, p.description as prize_description, p.color as prize_color, p.deadline_days FROM spins s LEFT JOIN prizes p ON s.prize_id=p.id WHERE s.customer_id=? AND p.deadline_days>0 ORDER BY s.won_at DESC').all(c.id);
    return { ...c, spins };
  });
  res.json(result);
});

app.put('/api/admin/spins/:id/use', requireRestaurant, (req, res) => {
  const rid  = req.session.restaurantId;
  const spin = db.prepare('SELECT s.* FROM spins s JOIN customers c ON s.customer_id=c.id WHERE s.id=? AND c.restaurant_id=?').get(parseInt(req.params.id), rid);
  if (!spin) return res.status(404).json({ error: 'Gain introuvable' });
  if (spin.used) return res.status(400).json({ error: 'Déjà utilisé' });
  if (spin.deadline && new Date(spin.deadline) < new Date()) return res.status(400).json({ error: 'Ce gain a expiré' });
  db.prepare('UPDATE spins SET used=1, used_at=CURRENT_TIMESTAMP WHERE id=?').run(spin.id);
  res.json({ success: true });
});

// CRUD lots
app.get('/api/admin/prizes', requireRestaurant, (req, res) => {
  res.json(db.prepare('SELECT * FROM prizes WHERE restaurant_id=? ORDER BY probability DESC').all(req.session.restaurantId));
});

app.post('/api/admin/prizes', requireRestaurant, (req, res) => {
  const { name, description, probability, deadline_days, color } = req.body;
  if (!name || probability == null || deadline_days == null) return res.status(400).json({ error: 'Champs requis manquants' });
  const r = db.prepare('INSERT INTO prizes (restaurant_id, name, description, probability, deadline_days, color) VALUES (?,?,?,?,?,?)').run(req.session.restaurantId, name, description || '', parseInt(probability), parseInt(deadline_days), color || '#FF6B6B');
  res.json(db.prepare('SELECT * FROM prizes WHERE id=?').get(r.lastInsertRowid));
});

app.put('/api/admin/prizes/:id', requireRestaurant, (req, res) => {
  const { name, description, probability, deadline_days, color, active } = req.body;
  const id = parseInt(req.params.id);
  db.prepare('UPDATE prizes SET name=COALESCE(?,name), description=COALESCE(?,description), probability=COALESCE(?,probability), deadline_days=COALESCE(?,deadline_days), color=COALESCE(?,color), active=COALESCE(?,active) WHERE id=? AND restaurant_id=?').run(name, description, probability != null ? parseInt(probability) : null, deadline_days != null ? parseInt(deadline_days) : null, color, active != null ? (active ? 1 : 0) : null, id, req.session.restaurantId);
  res.json(db.prepare('SELECT * FROM prizes WHERE id=?').get(id));
});

app.delete('/api/admin/prizes/:id', requireRestaurant, (req, res) => {
  db.prepare('UPDATE prizes SET active=0 WHERE id=? AND restaurant_id=?').run(parseInt(req.params.id), req.session.restaurantId);
  res.json({ success: true });
});

// Paramètres restaurant
app.get('/api/admin/settings', requireRestaurant, (req, res) => {
  const r = db.prepare('SELECT name, url, theme_accent FROM restaurants WHERE id=?').get(req.session.restaurantId);
  res.json({ restaurant_name: r?.name, restaurant_url: r?.url, theme_accent: r?.theme_accent });
});

app.put('/api/admin/settings', requireRestaurant, (req, res) => {
  const { restaurant_name, restaurant_url, admin_password, theme_accent } = req.body;
  const rid = req.session.restaurantId;
  if (restaurant_name) db.prepare('UPDATE restaurants SET name=? WHERE id=?').run(restaurant_name, rid);
  if (restaurant_url)  db.prepare('UPDATE restaurants SET url=?  WHERE id=?').run(restaurant_url,  rid);
  if (theme_accent)    db.prepare('UPDATE restaurants SET theme_accent=? WHERE id=?').run(theme_accent, rid);
  if (admin_password && admin_password.length >= 4) db.prepare('UPDATE restaurants SET password=? WHERE id=?').run(admin_password, rid);
  if (restaurant_name) req.session.restaurantName = restaurant_name;
  res.json({ success: true });
});

// Paramètres email par restaurant
app.get('/api/admin/email-settings', requireRestaurant, (req, res) => {
  const r = db.prepare('SELECT email_from_name, email_reply_to, send_win_email, send_lose_email, reminder_days FROM restaurants WHERE id=?').get(req.session.restaurantId);
  res.json(r || {});
});

app.put('/api/admin/email-settings', requireRestaurant, (req, res) => {
  const { email_from_name, email_reply_to, send_win_email, send_lose_email, reminder_days } = req.body;
  const rid = req.session.restaurantId;
  db.prepare('UPDATE restaurants SET email_from_name=?, email_reply_to=?, send_win_email=?, send_lose_email=?, reminder_days=? WHERE id=?')
    .run(email_from_name || null, email_reply_to || null, send_win_email ? 1 : 0, send_lose_email ? 1 : 0, parseInt(reminder_days) || 3, rid);
  res.json({ success: true });
});

// QR code
app.get('/api/admin/qrcode', requireRestaurant, async (req, res) => {
  const r   = db.prepare('SELECT url FROM restaurants WHERE id=?').get(req.session.restaurantId);
  const url = (r?.url || `http://localhost:${PORT}`) + `/client?r=${req.session.restaurantId}`;
  try {
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.json({ qr, url });
  } catch { res.status(500).json({ error: 'Erreur génération QR code' }); }
});

// ─── Super-admin ──────────────────────────────────────────────────────────────
app.post('/api/superadmin/login', (req, res) => {
  const { password } = req.body;
  const stored = db.prepare("SELECT value FROM settings WHERE key='superadmin_password'").get();
  if (stored && password === stored.value) {
    req.session.isSuperAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect' });
  }
});

app.post('/api/superadmin/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/superadmin/me', (req, res) => {
  res.json({ isSuperAdmin: !!req.session?.isSuperAdmin });
});

app.get('/api/superadmin/restaurants', requireSuperAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM customers c WHERE c.restaurant_id=r.id) as total_customers,
      (SELECT COUNT(*) FROM spins s JOIN customers c ON s.customer_id=c.id WHERE c.restaurant_id=r.id) as total_spins
    FROM restaurants r ORDER BY r.created_at DESC
  `).all();
  res.json(rows);
});

app.post('/api/superadmin/restaurants', requireSuperAdmin, (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court' });
  const exists = db.prepare('SELECT id FROM restaurants WHERE email=? COLLATE NOCASE').get(email.trim());
  if (exists) return res.status(409).json({ error: 'Email déjà utilisé' });
  const r = db.prepare('INSERT INTO restaurants (name, email, password) VALUES (?,?,?)').run(name.trim(), email.toLowerCase().trim(), password);
  createDefaultPrizes(r.lastInsertRowid);
  res.json(db.prepare('SELECT * FROM restaurants WHERE id=?').get(r.lastInsertRowid));
});

app.put('/api/superadmin/restaurants/:id', requireSuperAdmin, (req, res) => {
  const { name, email, password, active } = req.body;
  const id = parseInt(req.params.id);
  if (name)     db.prepare('UPDATE restaurants SET name=?     WHERE id=?').run(name, id);
  if (email)    db.prepare('UPDATE restaurants SET email=?    WHERE id=?').run(email.toLowerCase().trim(), id);
  if (password && password.length >= 4) db.prepare('UPDATE restaurants SET password=? WHERE id=?').run(password, id);
  if (active != null) db.prepare('UPDATE restaurants SET active=? WHERE id=?').run(active ? 1 : 0, id);
  res.json(db.prepare('SELECT * FROM restaurants WHERE id=?').get(id));
});

// Config SMTP globale
app.get('/api/superadmin/smtp', requireSuperAdmin, (req, res) => {
  const get = key => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r?.value || ''; };
  res.json({ smtp_host: get('smtp_host'), smtp_port: get('smtp_port'), smtp_user: get('smtp_user'), smtp_pass: get('smtp_pass') });
});

app.put('/api/superadmin/smtp', requireSuperAdmin, (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass } = req.body;
  const set = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)');
  if (smtp_host != null) set.run('smtp_host', smtp_host);
  if (smtp_port != null) set.run('smtp_port', String(smtp_port));
  if (smtp_user != null) set.run('smtp_user', smtp_user);
  if (smtp_pass != null) set.run('smtp_pass', smtp_pass);
  res.json({ success: true });
});

// Test d'envoi SMTP
app.post('/api/superadmin/smtp/test', requireSuperAdmin, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Adresse email requise' });
  const { sendTestEmail } = require('./mailer');
  const result = await sendTestEmail(to);
  res.json(result);
});

app.put('/api/superadmin/password', requireSuperAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court' });
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('superadmin_password', password);
  res.json({ success: true });
});

// ─── Pages HTML ───────────────────────────────────────────────────────────────
app.get('/client',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'client',     'index.html')));
app.get('/admin',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin',      'index.html')));
app.get('/register',    (req, res) => res.sendFile(path.join(__dirname, 'public', 'register',   'index.html')));
app.get('/superadmin',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'superadmin', 'index.html')));
app.get('/',            (req, res) => res.redirect('/admin'));

// ─── Cron : rappels toutes les 3 semaines jusqu'à la deadline (9h) ───────────
cron.schedule('0 9 * * *', async () => {
  const INTERVAL_DAYS = 21;
  const now = new Date();

  // Spins actifs (non utilisés, pas expirés, avec une vraie deadline)
  // dont le dernier rappel date de plus de 21 jours (ou jamais envoyé + spin > 21 jours)
  const spins = db.prepare(`
    SELECT s.*, c.email, c.first_name, c.last_name, c.restaurant_id,
           p.name as prize_name
    FROM spins s
    JOIN customers c ON s.customer_id=c.id
    JOIN prizes   p ON s.prize_id=p.id
    WHERE s.used=0
      AND s.allow_reminders=1
      AND s.deadline IS NOT NULL
      AND datetime(s.deadline) > datetime('now')
      AND (
        (s.last_reminder_at IS NULL     AND datetime(s.won_at,       '+${INTERVAL_DAYS} days') <= datetime('now'))
        OR
        (s.last_reminder_at IS NOT NULL AND datetime(s.last_reminder_at, '+${INTERVAL_DAYS} days') <= datetime('now'))
      )
  `).all();

  for (const row of spins) {
    const restaurant = db.prepare('SELECT * FROM restaurants WHERE id=? AND active=1').get(row.restaurant_id);
    if (!restaurant || !restaurant.reminder_days) continue;

    const daysLeft = Math.ceil((new Date(row.deadline) - now) / 86400000);
    const customer = { id: row.customer_id, email: row.email, first_name: row.first_name, last_name: row.last_name };
    const prize    = { name: row.prize_name };

    await sendReminderEmail({ customer, spin: row, prize, restaurant, daysLeft });
    db.prepare('UPDATE spins SET last_reminder_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
  }
});

app.listen(PORT, () => {
  console.log(`\n🍽️  Restau Wheel démarré sur http://localhost:${PORT}`);
  console.log(`   → Page client    : http://localhost:${PORT}/client?r=ID`);
  console.log(`   → Admin          : http://localhost:${PORT}/admin`);
  console.log(`   → Inscription    : http://localhost:${PORT}/register`);
  console.log(`   → Super-admin    : http://localhost:${PORT}/superadmin`);
  console.log(`   → Mot de passe super-admin : superadmin123\n`);
});
