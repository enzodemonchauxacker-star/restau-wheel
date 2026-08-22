const express = require('express');
const cookieSession = require('cookie-session');
const QRCode  = require('qrcode');
const path    = require('path');
const cron    = require('node-cron');
const { db, createDefaultPrizes, ensureReady } = require('./database');
const { sendSpinEmail, sendReminderEmail } = require('./mailer');
const { normalizePhone, sendExpirySms } = require('./sms');

const app  = express();
const PORT = process.env.PORT || 3000;

if (process.env.VERCEL) {
  app.set('trust proxy', 1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// HTML jamais mis en cache (les JS/CSS/images restent cachés normalement)
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});
app.get('/favicon.ico', async (req, res) => res.redirect(301, '/favicon.png'));
app.use(express.static(path.join(__dirname, 'public')));

// Session en cookie (compatible Vercel serverless — pas de MemoryStore)
app.use(cookieSession({
  name: 'rw_sess',
  keys: [process.env.SESSION_SECRET || 'restau-wheel-secret-2024', 'rw-fallback-key'],
  maxAge: 8 * 60 * 60 * 1000,
  httpOnly: true,
  secure: process.env.VERCEL === '1' || process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
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
app.get('/api/prizes', async (req, res) => {
  const rid = parseInt(req.query.r);
  if (!rid) return res.status(400).json({ error: 'Restaurant manquant' });
  const prizes = await db.prepare('SELECT * FROM prizes WHERE restaurant_id=? AND active=1').all(rid);
  res.json(prizes);
});

// Thème du restaurant (couleur principale, nom)
app.get('/api/theme', async (req, res) => {
  const rid = parseInt(req.query.r);
  if (!rid) return res.json({ theme_accent: '#FFD700' });
  const r = await db.prepare('SELECT name, theme_accent FROM restaurants WHERE id=? AND active=1').get(rid);
  if (!r) return res.json({ theme_accent: '#FFD700' });
  res.json({ theme_accent: r.theme_accent, restaurant_name: r.name });
});

// Tirage de la roue
app.post('/api/spin', async (req, res) => {
  const { email, first_name, last_name, phone, restaurant_id } = req.body;
  const rid = parseInt(restaurant_id);

  if (!email || !first_name || !last_name || !phone || !rid) {
    return res.status(400).json({ error: 'Tous les champs sont requis (dont le téléphone)' });
  }
  const phoneNorm = normalizePhone(phone);
  if (!phoneNorm) {
    return res.status(400).json({ error: 'Numéro de téléphone invalide (ex: 06 12 34 56 78)' });
  }
  const resto = await db.prepare('SELECT id, spin_cooldown_hours FROM restaurants WHERE id=? AND active=1').get(rid);
  if (!resto) return res.status(404).json({ error: 'Restaurant introuvable' });

  const emailNorm = email.toLowerCase().trim();
  const cooldownH = Math.max(1, parseInt(resto.spin_cooldown_hours, 10) || 24);
  const sinceHours = cooldownH;

  // Anti-abus : 1 tirage / email / resto pendant le cooldown
  const recentEmail = await db.prepare(`
    SELECT s.won_at, p.name as prize_name
    FROM spins s
    JOIN customers c ON c.id = s.customer_id
    LEFT JOIN prizes p ON p.id = s.prize_id
    WHERE c.restaurant_id = ? AND lower(c.email) = ?
      AND s.won_at > NOW() - (? || ' hours')::interval
    ORDER BY s.won_at DESC LIMIT 1
  `).get(rid, emailNorm, String(sinceHours));

  if (recentEmail) {
    return res.status(429).json({
      error: `Tu as déjà tourné la roue. Reviens dans ${cooldownH}h.`,
      code: 'already_spun',
      cooldown_hours: cooldownH,
      last_prize: recentEmail.prize_name,
      last_spin_at: recentEmail.won_at,
    });
  }

  // Anti-abus : même téléphone (évite de changer d'email)
  const recentPhone = await db.prepare(`
    SELECT s.won_at
    FROM spins s
    JOIN customers c ON c.id = s.customer_id
    WHERE c.restaurant_id = ? AND c.phone = ?
      AND s.won_at > NOW() - (? || ' hours')::interval
    ORDER BY s.won_at DESC LIMIT 1
  `).get(rid, phoneNorm, String(sinceHours));

  if (recentPhone) {
    return res.status(429).json({
      error: `Ce numéro a déjà tourné la roue. Reviens dans ${cooldownH}h.`,
      code: 'already_spun_phone',
      cooldown_hours: cooldownH,
      last_spin_at: recentPhone.won_at,
    });
  }

  // Créer ou retrouver le client pour CE restaurant
  let customer = await db.prepare('SELECT * FROM customers WHERE lower(email)=lower(?) AND restaurant_id=? ').get(emailNorm, rid);
  if (!customer) {
    const r = await db.prepare('INSERT INTO customers (restaurant_id, email, first_name, last_name, phone) VALUES (?,?,?,?,?)')
      .run(rid, emailNorm, first_name.trim(), last_name.trim(), phoneNorm);
    customer = await db.prepare('SELECT * FROM customers WHERE id=?').get(r.lastInsertRowid);
  } else if (!customer.phone || customer.phone !== phoneNorm) {
    await db.prepare('UPDATE customers SET phone=? WHERE id=?').run(phoneNorm, customer.id);
    customer = { ...customer, phone: phoneNorm };
  }

  // Tirage pondéré
  const prizes = await db.prepare('SELECT * FROM prizes WHERE restaurant_id=? AND active=1').all(rid);
  const total  = prizes.reduce((s, p) => s + p.probability, 0);
  let rand = Math.random() * total;
  let prize = prizes[prizes.length - 1];
  for (const p of prizes) { rand -= p.probability; if (rand <= 0) { prize = p; break; } }

  const isReal   = prize.deadline_days > 0;
  const deadline = isReal ? new Date(Date.now() + prize.deadline_days * 86400000).toISOString() : null;

  // Opt-in SMS auto si gain réel + téléphone
  const spin = await db.prepare('INSERT INTO spins (customer_id, prize_id, deadline, allow_reminders) VALUES (?,?,?,?)')
    .run(customer.id, prize.id, deadline, isReal ? 1 : 0);

  res.json({
    prize: { id: prize.id, name: prize.name, description: prize.description, color: prize.color, deadline_days: prize.deadline_days, deadline, is_real_prize: isReal },
    spin_id: spin.lastInsertRowid,
    customer: { first_name: customer.first_name, last_name: customer.last_name, phone: phoneNorm }
  });

  const restaurant = await db.prepare('SELECT * FROM restaurants WHERE id=?').get(rid);
  sendSpinEmail({ customer, prize: { ...prize, deadline }, restaurant, isWin: isReal }).catch(() => {});
  // SMS désactivé pour l’instant (SMS_ENABLED=1 pour réactiver)
  // const smsPayload = { customer: { ...customer, phone: phoneNorm }, prize: { ...prize, deadline }, restaurant };
  // if (isReal) sendWinSms(smsPayload).catch(() => {});
  // else sendLoseSms(smsPayload).catch(() => {});
});
// Opt-in rappels (public — le spin_id est renvoyé juste après le tirage)
app.put('/api/spin/:id/reminders', async (req, res) => {
  const { allow } = req.body;
  await db.prepare('UPDATE spins SET allow_reminders=? WHERE id=?').run(allow ? 1 : 0, parseInt(req.params.id));
  res.json({ success: true });
});

// ─── Inscription restaurant ───────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });
  if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ error: 'Email invalide' });

  const exists = await db.prepare('SELECT id FROM restaurants WHERE lower(email)=lower(?) ').get(email.trim());
  if (exists) return res.status(409).json({ error: 'Cet email est déjà utilisé' });

  const r = await db.prepare('INSERT INTO restaurants (name, email, password) VALUES (?,?,?)').run(name.trim(), email.toLowerCase().trim(), password);
  await createDefaultPrizes(r.lastInsertRowid);

  req.session.restaurantId   = r.lastInsertRowid;
  req.session.restaurantName = name.trim();
  res.json({ success: true, restaurant_id: r.lastInsertRowid });
});

// ─── Auth admin restaurant ────────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  const r = await db.prepare('SELECT * FROM restaurants WHERE lower(email)=lower(?) AND active=1').get(email?.trim());
  if (!r || password !== r.password) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  req.session.restaurantId   = r.id;
  req.session.restaurantName = r.name;
  res.json({ success: true });
});

app.post('/api/admin/logout', async (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.get('/api/admin/me', async (req, res) => {
  if (!req.session?.restaurantId) return res.json({ isAdmin: false });
  const r = await db.prepare('SELECT name, url, theme_accent FROM restaurants WHERE id=?').get(req.session.restaurantId);
  res.json({ isAdmin: true, restaurant_name: r?.name || '', restaurant_url: r?.url || '', theme_accent: r?.theme_accent || '#FFD700' });
});

// ─── Routes admin (protégées par restaurant) ─────────────────────────────────
app.get('/api/admin/stats', requireRestaurant, async (req, res) => {
  const rid = req.session.restaurantId;
  const totalSpins  = (await db.prepare('SELECT COUNT(*)::int as n FROM spins WHERE customer_id IN (SELECT id FROM customers WHERE restaurant_id=?)').get(rid)).n;
  const totalWins   = (await db.prepare('SELECT COUNT(*)::int as n FROM spins WHERE customer_id IN (SELECT id FROM customers WHERE restaurant_id=?) AND prize_id IN (SELECT id FROM prizes WHERE deadline_days>0)').get(rid)).n;
  const usedWins    = (await db.prepare('SELECT COUNT(*)::int as n FROM spins WHERE used=1 AND customer_id IN (SELECT id FROM customers WHERE restaurant_id=?)').get(rid)).n;
  const expiredWins = (await db.prepare('SELECT COUNT(*)::int as n FROM spins WHERE used=0 AND deadline IS NOT NULL AND deadline<CURRENT_TIMESTAMP AND customer_id IN (SELECT id FROM customers WHERE restaurant_id=?)').get(rid)).n;
  const pendingWins = (await db.prepare('SELECT COUNT(*)::int as n FROM spins WHERE used=0 AND deadline IS NOT NULL AND deadline>CURRENT_TIMESTAMP AND customer_id IN (SELECT id FROM customers WHERE restaurant_id=?)').get(rid)).n;
  res.json({ totalSpins, totalWins, usedWins, expiredWins, pendingWins });
});

app.get('/api/admin/search', requireRestaurant, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const rid = req.session.restaurantId;
  const resto = await db.prepare('SELECT spin_cooldown_hours FROM restaurants WHERE id=?').get(rid);
  const cooldownH = Math.max(1, parseInt(resto?.spin_cooldown_hours, 10) || 24);

  let customers;
  if (q.length >= 2) {
    const term = `%${q}%`;
    customers = await db.prepare('SELECT * FROM customers WHERE restaurant_id=? AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR IFNULL(phone,\'\') LIKE ?) ORDER BY created_at DESC LIMIT 200').all(rid, term, term, term, term);
  } else {
    customers = await db.prepare('SELECT * FROM customers WHERE restaurant_id=? ORDER BY created_at DESC LIMIT 200').all(rid);
  }

  const result = [];
  for (const c of customers) {
    const spins = await db.prepare(`
      SELECT s.*, p.name as prize_name, p.description as prize_description,
             p.color as prize_color, p.deadline_days
      FROM spins s
      LEFT JOIN prizes p ON s.prize_id=p.id
      WHERE s.customer_id=?
      ORDER BY s.won_at DESC
      LIMIT 50
    `).all(c.id);

    const spin_count = spins.length;
    const win_count = spins.filter(s => s.deadline_days > 0).length;
    const last_spin_at = spins[0]?.won_at || null;
    let in_cooldown = false;
    let cooldown_ends_at = null;
    if (last_spin_at) {
      const raw = last_spin_at instanceof Date ? last_spin_at.toISOString() : String(last_spin_at);
      const last = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
      const ends = new Date(last.getTime() + cooldownH * 3600 * 1000);
      in_cooldown = ends > new Date();
      cooldown_ends_at = ends.toISOString();
    }

    result.push({
      ...c,
      spins,
      spin_count,
      win_count,
      last_spin_at,
      in_cooldown,
      cooldown_hours: cooldownH,
      cooldown_ends_at,
    });
  }
  res.json(result);
});

app.put('/api/admin/spins/:id/use', requireRestaurant, async (req, res) => {
  const rid  = req.session.restaurantId;
  const spin = await db.prepare('SELECT s.* FROM spins s JOIN customers c ON s.customer_id=c.id WHERE s.id=? AND c.restaurant_id=?').get(parseInt(req.params.id), rid);
  if (!spin) return res.status(404).json({ error: 'Gain introuvable' });
  if (spin.used) return res.status(400).json({ error: 'Déjà utilisé' });
  if (spin.deadline && new Date(spin.deadline) < new Date()) return res.status(400).json({ error: 'Ce gain a expiré' });
  await db.prepare('UPDATE spins SET used=1, used_at=CURRENT_TIMESTAMP WHERE id=?').run(spin.id);
  res.json({ success: true });
});

// CRUD lots
app.get('/api/admin/prizes', requireRestaurant, async (req, res) => {
  res.json(await db.prepare('SELECT * FROM prizes WHERE restaurant_id=? ORDER BY probability DESC').all(req.session.restaurantId));
});

app.post('/api/admin/prizes', requireRestaurant, async (req, res) => {
  const { name, description, probability, deadline_days, color } = req.body;
  if (!name || probability == null || deadline_days == null) return res.status(400).json({ error: 'Champs requis manquants' });
  const r = await db.prepare('INSERT INTO prizes (restaurant_id, name, description, probability, deadline_days, color) VALUES (?,?,?,?,?,?)').run(req.session.restaurantId, name, description || '', parseInt(probability), parseInt(deadline_days), color || '#FF6B6B');
  res.json(await db.prepare('SELECT * FROM prizes WHERE id=?').get(r.lastInsertRowid));
});

app.put('/api/admin/prizes/:id', requireRestaurant, async (req, res) => {
  const { name, description, probability, deadline_days, color, active } = req.body;
  const id = parseInt(req.params.id);
  await db.prepare('UPDATE prizes SET name=COALESCE(?,name), description=COALESCE(?,description), probability=COALESCE(?,probability), deadline_days=COALESCE(?,deadline_days), color=COALESCE(?,color), active=COALESCE(?,active) WHERE id=? AND restaurant_id=?').run(name, description, probability != null ? parseInt(probability) : null, deadline_days != null ? parseInt(deadline_days) : null, color, active != null ? (active ? 1 : 0) : null, id, req.session.restaurantId);
  res.json(await db.prepare('SELECT * FROM prizes WHERE id=?').get(id));
});

app.delete('/api/admin/prizes/:id', requireRestaurant, async (req, res) => {
  await db.prepare('UPDATE prizes SET active=0 WHERE id=? AND restaurant_id=?').run(parseInt(req.params.id), req.session.restaurantId);
  res.json({ success: true });
});

/**
 * Calibre les probabilités :
 * ex. 100 couverts/jour, 15 cadeaux → ~15% de gains réels, 85% « Rien ».
 * Les lots avec deadline_days>0 se partagent le budget cadeaux (au prorata de leur poids actuel).
 */
app.post('/api/admin/prizes/calibrate', requireRestaurant, async (req, res) => {
  const rid = req.session.restaurantId;
  const covers = Math.max(1, parseInt(req.body?.covers, 10) || 0);
  const gifts  = Math.max(0, parseInt(req.body?.gifts, 10) || 0);
  if (gifts > covers) {
    return res.status(400).json({ error: 'Les cadeaux / jour ne peuvent pas dépasser les couverts / jour' });
  }

  const prizes = await db.prepare('SELECT * FROM prizes WHERE restaurant_id=? AND active=1').all(rid);
  if (!prizes.length) return res.status(400).json({ error: 'Aucun lot actif' });

  let real = prizes.filter(p => p.deadline_days > 0);
  let lose = prizes.filter(p => !(p.deadline_days > 0));

  // Crée un lot « Rien » si absent
  if (!lose.length && gifts < covers) {
    const ins = await db.prepare(
      'INSERT INTO prizes (restaurant_id, name, description, probability, deadline_days, color) VALUES (?,?,?,?,?,?)'
    ).run(
      rid,
      'Rien',
      'Pas de chance cette fois… Retentez à la prochaine visite !',
      1,
      0,
      '#374151'
    );
    lose = [await db.prepare('SELECT * FROM prizes WHERE id=?').get(ins.lastInsertRowid)];
  }

  if (!real.length && gifts > 0) {
    return res.status(400).json({ error: 'Ajoutez au moins un vrai lot (avec validité > 0 jours) avant de calibrer' });
  }

  const TOTAL = 100;
  const winWeight = Math.round((gifts / covers) * TOTAL);
  const loseWeight = TOTAL - winWeight;

  const upd = db.prepare('UPDATE prizes SET probability=? WHERE id=? AND restaurant_id=?');

  if (real.length) {
    if (winWeight === 0) {
      for (const p of real) await upd.run(0, p.id, rid);
    } else {
      const realSum = real.reduce((s, p) => s + Math.max(1, p.probability), 0);
      let assigned = 0;
      for (let i = 0; i < real.length; i++) {
        const p = real[i];
        let w;
        if (i === real.length - 1) {
          w = Math.max(1, winWeight - assigned);
        } else {
          w = Math.max(1, Math.round((Math.max(1, p.probability) / realSum) * winWeight));
          assigned += w;
        }
        if (assigned > winWeight && i < real.length - 1) {
          w = Math.max(1, w - (assigned - winWeight));
          assigned = winWeight;
        }
        await upd.run(w, p.id, rid);
      }
    }
  }

  if (lose.length) {
    for (let i = 0; i < lose.length; i++) {
      await upd.run(i === 0 ? Math.max(0, loseWeight) : 0, lose[i].id, rid);
    }
  }

  await db.prepare('UPDATE restaurants SET daily_covers=?, daily_gifts=? WHERE id=?').run(covers, gifts, rid);

  const updated = await db.prepare('SELECT * FROM prizes WHERE restaurant_id=? AND active=1 ORDER BY probability DESC').all(rid);
  const totalW = updated.reduce((s, p) => s + p.probability, 0) || 1;
  const winW = updated.filter(p => p.deadline_days > 0).reduce((s, p) => s + p.probability, 0);
  const winPct = Math.round((winW / totalW) * 1000) / 10;

  res.json({
    success: true,
    covers,
    gifts,
    win_percent: winPct,
    expected_gifts_per_day: Math.round((winPct / 100) * covers * 10) / 10,
    prizes: updated,
  });
});

// Paramètres restaurant
app.get('/api/admin/settings', requireRestaurant, async (req, res) => {
  const r = await db.prepare('SELECT name, url, theme_accent, daily_covers, daily_gifts, spin_cooldown_hours FROM restaurants WHERE id=?').get(req.session.restaurantId);
  res.json({
    restaurant_name: r?.name,
    restaurant_url: r?.url,
    theme_accent: r?.theme_accent,
    daily_covers: r?.daily_covers ?? null,
    daily_gifts: r?.daily_gifts ?? null,
    spin_cooldown_hours: r?.spin_cooldown_hours ?? 24,
  });
});

app.put('/api/admin/settings', requireRestaurant, async (req, res) => {
  const { restaurant_name, restaurant_url, admin_password, theme_accent, spin_cooldown_hours } = req.body;
  const rid = req.session.restaurantId;
  if (restaurant_name) await db.prepare('UPDATE restaurants SET name=? WHERE id=?').run(restaurant_name, rid);
  if (restaurant_url)  await db.prepare('UPDATE restaurants SET url=?  WHERE id=?').run(restaurant_url,  rid);
  if (theme_accent)    await db.prepare('UPDATE restaurants SET theme_accent=? WHERE id=?').run(theme_accent, rid);
  if (spin_cooldown_hours != null) {
    const h = Math.min(720, Math.max(1, parseInt(spin_cooldown_hours, 10) || 24));
    await db.prepare('UPDATE restaurants SET spin_cooldown_hours=? WHERE id=?').run(h, rid);
  }
  if (admin_password && admin_password.length >= 4) await db.prepare('UPDATE restaurants SET password=? WHERE id=?').run(admin_password, rid);
  if (restaurant_name) req.session.restaurantName = restaurant_name;
  res.json({ success: true });
});

// Paramètres email par restaurant
app.get('/api/admin/email-settings', requireRestaurant, async (req, res) => {
  const r = await db.prepare('SELECT email_from_name, email_reply_to, send_win_email, send_lose_email, reminder_days FROM restaurants WHERE id=?').get(req.session.restaurantId);
  res.json(r || {});
});

app.put('/api/admin/email-settings', requireRestaurant, async (req, res) => {
  const { email_from_name, email_reply_to, send_win_email, send_lose_email, reminder_days } = req.body;
  const rid = req.session.restaurantId;
  await db.prepare('UPDATE restaurants SET email_from_name=?, email_reply_to=?, send_win_email=?, send_lose_email=?, reminder_days=? WHERE id=?')
    .run(email_from_name || null, email_reply_to || null, send_win_email ? 1 : 0, send_lose_email ? 1 : 0, parseInt(reminder_days) || 3, rid);
  res.json({ success: true });
});

// QR code — toujours l’URL publique (pas l’URL de déploiement Vercel / SSO)
function getPublicBaseUrl(req, storedUrl) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/$/, '');
  }
  const host = (req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  // Ignorer les URLs de déploiement Vercel (…-hash.vercel.app) → SSO
  const isDeployPreview = /vercel\.app$/i.test(host) && /-[a-z0-9]+\.vercel\.app$/i.test(host)
    && !/^[^.]+\.vercel\.app$/i.test(host);
  if (host && !/localhost|127\.0\.0\.1/i.test(host) && !isDeployPreview) {
    return `${proto}://${host}`;
  }
  if (storedUrl && !/localhost|127\.0\.0\.1/i.test(storedUrl)) {
    try {
      const u = new URL(storedUrl);
      const h = u.hostname;
      const preview = /vercel\.app$/i.test(h) && h.split('.').length > 3;
      if (!preview) return storedUrl.replace(/\/$/, '');
    } catch { /* ignore */ }
  }
  return `https://restauwheel.com`;
}

app.get('/api/admin/qrcode', requireRestaurant, async (req, res) => {
  const r = await db.prepare('SELECT url FROM restaurants WHERE id=?').get(req.session.restaurantId);
  const base = getPublicBaseUrl(req, r?.url);
  const url = `${base}/client?r=${req.session.restaurantId}`;
  try {
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1a1a2e', light: '#ffffff' } });
    res.json({ qr, url });
  } catch { res.status(500).json({ error: 'Erreur génération QR code' }); }
});

// ─── Super-admin ──────────────────────────────────────────────────────────────
app.post('/api/superadmin/login', async (req, res) => {
  const { password } = req.body;
  const stored = await db.prepare("SELECT value FROM settings WHERE key='superadmin_password'").get();
  // Env prioritaire (stable sur Vercel) > DB > défaut
  const expected = process.env.SUPERADMIN_PASSWORD || stored?.value || 'superadmin123';
  if (password && String(password) === String(expected)) {
    // cookie-session : réassigner l'objet pour forcer l'écriture du cookie
    req.session = {
      ...(req.session || {}),
      isSuperAdmin: true,
    };
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Mot de passe incorrect' });
});

app.post('/api/superadmin/logout', async (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.get('/api/superadmin/me', async (req, res) => {
  res.json({ isSuperAdmin: !!req.session?.isSuperAdmin });
});

app.get('/api/superadmin/restaurants', requireSuperAdmin, async (req, res) => {
  const rows = await db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM customers c WHERE c.restaurant_id=r.id) as total_customers,
      (SELECT COUNT(*) FROM spins s JOIN customers c ON s.customer_id=c.id WHERE c.restaurant_id=r.id) as total_spins
    FROM restaurants r ORDER BY r.created_at DESC
  `).all();
  res.json(rows);
});

app.post('/api/superadmin/restaurants', requireSuperAdmin, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court' });
  const exists = await db.prepare('SELECT id FROM restaurants WHERE lower(email)=lower(?) ').get(email.trim());
  if (exists) return res.status(409).json({ error: 'Email déjà utilisé' });
  const r = await db.prepare('INSERT INTO restaurants (name, email, password) VALUES (?,?,?)').run(name.trim(), email.toLowerCase().trim(), password);
  await createDefaultPrizes(r.lastInsertRowid);
  res.json(await db.prepare('SELECT * FROM restaurants WHERE id=?').get(r.lastInsertRowid));
});

app.put('/api/superadmin/restaurants/:id', requireSuperAdmin, async (req, res) => {
  const { name, email, password, active } = req.body;
  const id = parseInt(req.params.id);
  if (name)     await db.prepare('UPDATE restaurants SET name=?     WHERE id=?').run(name, id);
  if (email)    await db.prepare('UPDATE restaurants SET email=?    WHERE id=?').run(email.toLowerCase().trim(), id);
  if (password && password.length >= 4) await db.prepare('UPDATE restaurants SET password=? WHERE id=?').run(password, id);
  if (active != null) await db.prepare('UPDATE restaurants SET active=? WHERE id=?').run(active ? 1 : 0, id);
  res.json(await db.prepare('SELECT * FROM restaurants WHERE id=?').get(id));
});

// Config SMTP globale
app.get('/api/superadmin/smtp', requireSuperAdmin, async (req, res) => {
  const get = async (key) => {
    const r = await db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return r?.value || '';
  };
  res.json({
    smtp_host: await get('smtp_host'),
    smtp_port: await get('smtp_port'),
    smtp_user: await get('smtp_user'),
    smtp_pass: await get('smtp_pass'),
  });
});

app.put('/api/superadmin/smtp', requireSuperAdmin, async (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass } = req.body;
  const set = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)');
  if (smtp_host != null) await set.run('smtp_host', smtp_host);
  if (smtp_port != null) await set.run('smtp_port', String(smtp_port));
  if (smtp_user != null) await set.run('smtp_user', smtp_user);
  if (smtp_pass != null) await set.run('smtp_pass', smtp_pass);
  res.json({ success: true });
});

// Config Twilio / SMS
app.get('/api/superadmin/twilio', requireSuperAdmin, async (req, res) => {
  const get = async (key) => {
    const r = await db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    return r?.value || '';
  };
  const hasAuth = !!(process.env.TWILIO_AUTH_TOKEN || (process.env.TWILIO_API_KEY && process.env.TWILIO_API_SECRET));
  const configured = !!(process.env.TWILIO_ACCOUNT_SID && hasAuth && process.env.TWILIO_FROM);
  const token = await get('twilio_token');
  res.json({
    twilio_sid: await get('twilio_sid'),
    twilio_from: await get('twilio_from'),
    twilio_token: token ? '••••••••' : '',
    env_configured: configured,
  });
});

app.put('/api/superadmin/twilio', requireSuperAdmin, async (req, res) => {
  const { twilio_sid, twilio_token, twilio_from } = req.body;
  const set = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)');
  if (twilio_sid != null) await set.run('twilio_sid', twilio_sid);
  if (twilio_from != null) await set.run('twilio_from', twilio_from);
  if (twilio_token != null && !String(twilio_token).startsWith('•')) await set.run('twilio_token', twilio_token);
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

app.put('/api/superadmin/password', requireSuperAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Mot de passe trop court' });
  await db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('superadmin_password', password);
  res.json({ success: true });
});

// ─── Checkout / Stripe ────────────────────────────────────────────────────────
// Mode démo si STRIPE_SECRET_KEY absent. Avec clé + STRIPE_PRICE_ID → Checkout Session.
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
} catch (_) { /* stripe non installé */ }

app.get('/api/checkout/config', async (req, res) => {
  res.json({
    demo: !stripe,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    amount: 2000,
    currency: 'eur',
    label: 'Restau Wheel Pro — 20 €/mois',
  });
});

async function listBillingSubs(email) {
  if (!stripe) return { demo: true, items: [] };
  const customers = await stripe.customers.list({ email, limit: 10 });
  const items = [];
  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'all',
      limit: 20,
    });
    for (const sub of subs.data) {
      if (!['active', 'trialing', 'past_due'].includes(sub.status)) continue;
      items.push(sub);
    }
  }
  return { demo: false, items };
}

async function cancelSubscriptionByEmail(email, via) {
  if (!stripe) return { ok: false, status: 503, error: 'Paiements non configurés' };
  const { items } = await listBillingSubs(email);
  if (!items.length) return { ok: false, status: 404, error: 'Aucun abonnement', code: 'none' };

  let cancelled = 0;
  let already = 0;
  let periodEnd = null;

  for (const sub of items) {
    if (sub.cancel_at_period_end) {
      already++;
      periodEnd = sub.current_period_end;
      continue;
    }
    const updated = await stripe.subscriptions.update(sub.id, {
      cancel_at_period_end: true,
      metadata: {
        ...(sub.metadata || {}),
        cancelled_via: via,
        cancelled_at: new Date().toISOString(),
      },
    });
    cancelled++;
    periodEnd = updated.current_period_end;
  }

  if (!cancelled && !already) {
    return { ok: false, status: 404, error: 'Aucun abonnement', code: 'none' };
  }
  return {
    ok: true,
    cancelled,
    already: cancelled === 0 && already > 0,
    period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };
}

/** Résiliation abonnement Stripe (fin de période) via email de facturation */
app.post('/api/subscription/cancel', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }
  try {
    const result = await cancelSubscriptionByEmail(email, 'restau-wheel-cancel-page');
    if (!result.ok) return res.status(result.status).json({ error: result.error, code: result.code });
    res.json({
      success: true,
      cancelled: result.cancelled,
      already: result.already,
      period_end: result.period_end,
    });
  } catch (e) {
    console.error('[cancel]', e.message);
    res.status(500).json({ error: 'Erreur résiliation' });
  }
});

app.get('/api/admin/subscription', requireRestaurant, async (req, res) => {
  const r = await db.prepare('SELECT email FROM restaurants WHERE id=?').get(req.session.restaurantId);
  const email = r?.email || '';
  try {
    const { demo, items } = await listBillingSubs(email);
    if (demo) return res.json({ demo: true, email, status: 'demo' });
    const live = items[0];
    if (!live) return res.json({ demo: false, email, status: 'none' });
    res.json({
      demo: false,
      email,
      status: live.cancel_at_period_end ? 'canceling' : 'active',
      period_end: live.current_period_end
        ? new Date(live.current_period_end * 1000).toISOString()
        : null,
    });
  } catch (e) {
    console.error('[admin/subscription]', e.message);
    res.status(500).json({ error: 'Erreur abonnement' });
  }
});

app.post('/api/admin/subscription/cancel', requireRestaurant, async (req, res) => {
  if (!req.body?.confirm) return res.status(400).json({ error: 'Confirmation requise' });
  const r = await db.prepare('SELECT email FROM restaurants WHERE id=?').get(req.session.restaurantId);
  const email = r?.email || '';
  try {
    const result = await cancelSubscriptionByEmail(email, 'admin-settings');
    if (!result.ok) return res.status(result.status).json({ error: result.error, code: result.code });
    res.json({
      success: true,
      cancelled: result.cancelled,
      already: result.already,
      period_end: result.period_end,
    });
  } catch (e) {
    console.error('[admin/cancel]', e.message);
    res.status(500).json({ error: 'Erreur résiliation' });
  }
});

app.post('/api/checkout', async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const name  = String(req.body?.name || '').trim();
  if (!email || !name) return res.status(400).json({ error: 'Email et nom requis' });

  // Stripe Checkout (carte collectée côté Stripe — PCI safe)
  if (stripe && process.env.STRIPE_PRICE_ID) {
    try {
      const origin = `${req.protocol}://${req.get('host')}`;
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: email,
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${origin}/admin?paid=1`,
        cancel_url: `${origin}/checkout?canceled=1`,
        metadata: { customer_name: name },
      });
      return res.json({ checkoutUrl: session.url });
    } catch (e) {
      console.error('Stripe error:', e.message);
      return res.status(500).json({ error: 'Erreur Stripe : ' + e.message });
    }
  }

  // Mode démo : pas de PAN stocké, juste confirmation UX
  res.json({
    demo: true,
    success: true,
    last4: String(req.body?.last4 || '').slice(-4),
    brand: req.body?.brand || 'card',
  });
});

// ─── Pages HTML ───────────────────────────────────────────────────────────────
app.get('/client',      async (req, res) => res.sendFile(path.join(__dirname, 'public', 'client',     'index.html')));
app.get('/admin',       async (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin',      'index.html')));
app.get('/register',    async (req, res) => res.sendFile(path.join(__dirname, 'public', 'register',   'index.html')));
app.get('/superadmin',  async (req, res) => res.sendFile(path.join(__dirname, 'public', 'superadmin', 'index.html')));
app.get('/checkout',    async (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout',   'index.html')));
app.get('/cancel',      async (req, res) => res.sendFile(path.join(__dirname, 'public', 'cancel',     'index.html')));
app.get('/carte',       async (req, res) => res.sendFile(path.join(__dirname, 'public', 'carte',      'index.html')));
app.get('/pro',         async (req, res) => res.redirect(301, '/carte'));
app.get('/carte/qr',    async (req, res) => res.sendFile(path.join(__dirname, 'public', 'carte',      'qr.html')));
app.get('/carte.vcf',   async (req, res) => {
  res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="enzo-demonchaux-acker.vcf"');
  res.sendFile(path.join(__dirname, 'public', 'carte.vcf'));
});
app.get('/mentions',    async (req, res) => res.sendFile(path.join(__dirname, 'public', 'mentions',   'index.html')));
app.get('/mentions-legales', async (req, res) => res.redirect(301, '/mentions'));
app.get('/privacy',     async (req, res) => res.redirect(301, '/mentions#privacy'));
app.get('/confidentialite', async (req, res) => res.redirect(301, '/mentions#privacy'));
app.get('/resiliation', async (req, res) => res.redirect(301, '/cancel'));
app.get('/',            async (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── Cron / rappels ───────────────────────────────────────────────────────────
async function runReminderJob() {
  const INTERVAL_DAYS = 21;
  const now = new Date();
  let emailSent = 0;
  let smsSent = 0;

  // ── SMS : J-7 (ou moins) avant expiration, une seule fois ──
  const smsDue = await db.prepare(`
    SELECT s.*, c.email, c.first_name, c.last_name, c.phone, c.restaurant_id,
           p.name as prize_name
    FROM spins s
    JOIN customers c ON s.customer_id=c.id
    JOIN prizes   p ON s.prize_id=p.id
    WHERE s.used=0
      AND s.allow_reminders=1
      AND s.sms_week_sent=0
      AND c.phone IS NOT NULL AND c.phone != ''
      AND s.deadline IS NOT NULL
      AND s.deadline > NOW()
      AND s.deadline <= NOW() + INTERVAL '7 days'
  `).all();

  for (const row of smsDue) {
    const restaurant = await db.prepare('SELECT * FROM restaurants WHERE id=? AND active=1').get(row.restaurant_id);
    if (!restaurant) continue;
    const daysLeft = Math.ceil((new Date(row.deadline) - now) / 86400000);
    const customer = { first_name: row.first_name, last_name: row.last_name, phone: row.phone, email: row.email };
    const prize = { name: row.prize_name };
    const result = await sendExpirySms({ customer, prize, restaurant, daysLeft });
    if (result.ok) {
      await db.prepare('UPDATE spins SET sms_week_sent=1, last_reminder_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
      smsSent++;
    }
  }

  // ── Email : rappels périodiques (toutes les 3 semaines) ──
  const spins = await db.prepare(`
    SELECT s.*, c.email, c.first_name, c.last_name, c.restaurant_id,
           p.name as prize_name
    FROM spins s
    JOIN customers c ON s.customer_id=c.id
    JOIN prizes   p ON s.prize_id=p.id
    WHERE s.used=0
      AND s.allow_reminders=1
      AND s.deadline IS NOT NULL
      AND s.deadline > NOW()
      AND (
        (s.last_reminder_at IS NULL AND s.won_at + INTERVAL '${INTERVAL_DAYS} days' <= NOW())
        OR
        (s.last_reminder_at IS NOT NULL AND s.last_reminder_at + INTERVAL '${INTERVAL_DAYS} days' <= NOW())
      )
  `).all();

  for (const row of spins) {
    const restaurant = await db.prepare('SELECT * FROM restaurants WHERE id=? AND active=1').get(row.restaurant_id);
    if (!restaurant || !restaurant.reminder_days) continue;

    const daysLeft = Math.ceil((new Date(row.deadline) - now) / 86400000);
    const customer = { id: row.customer_id, email: row.email, first_name: row.first_name, last_name: row.last_name };
    const prize    = { name: row.prize_name };

    await sendReminderEmail({ customer, spin: row, prize, restaurant, daysLeft });
    await db.prepare('UPDATE spins SET last_reminder_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
    emailSent++;
  }
  return { checked: spins.length + smsDue.length, emailSent, smsSent };
}

app.get('/api/cron/reminders', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  try {
    const result = await runReminderJob();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

if (!process.env.VERCEL) {
  cron.schedule('0 9 * * *', () => { runReminderJob().catch(console.error); });
}

if (require.main === module) {
  ensureReady()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`\n🍽️  Restau Wheel démarré sur http://localhost:${PORT}`);
        console.log(`   → Landing        : http://localhost:${PORT}/`);
        console.log(`   → Page client    : http://localhost:${PORT}/client?r=ID`);
        console.log(`   → Admin          : http://localhost:${PORT}/admin`);
        console.log(`   → Inscription    : http://localhost:${PORT}/register`);
        console.log(`   → Checkout       : http://localhost:${PORT}/checkout`);
        console.log(`   → Super-admin    : http://localhost:${PORT}/superadmin`);
        console.log(`   → Mot de passe super-admin : superadmin123\n`);
      });
    })
    .catch((e) => {
      console.error('[DB] Impossible de démarrer:', e.message);
      process.exit(1);
    });
}

module.exports = app;