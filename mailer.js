const nodemailer = require('nodemailer');
const { db } = require('./database');

async function getSetting(key) {
  const r = await db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r?.value || '';
}

// ─── Transporter (construit à la demande pour prendre les settings à jour) ───
async function getTransporter() {
  const host = await getSetting('smtp_host');
  const port = parseInt(await getSetting('smtp_port')) || 587;
  const user = await getSetting('smtp_user');
  const pass = await getSetting('smtp_pass');
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function getFromAddress(restaurant) {
  const fromName  = restaurant.email_from_name || restaurant.name;
  const fromEmail = await getSetting('smtp_user');
  return `"${fromName}" <${fromEmail}>`;
}

// ─── Template email ───────────────────────────────────────────────────────────
function buildWinEmail({ customerName, prizeName, prizeDesc, deadline, restaurantName, isWin }) {
  const deadlineStr = deadline
    ? new Date(deadline).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    : null;

  if (!isWin) {
    return {
      subject: `Merci de votre visite chez ${restaurantName} 🍽️`,
      html: `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f1117;color:#fff;border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#1a1a3e,#0d0d1a);padding:36px 32px;text-align:center;">
    <div style="font-size:3rem;">🍽️</div>
    <h1 style="color:#FFD700;font-size:1.6rem;margin:12px 0 4px;">${restaurantName}</h1>
    <p style="color:#8892a4;margin:0;">Programme de fidélité</p>
  </div>
  <div style="padding:32px;text-align:center;">
    <div style="font-size:3rem;margin-bottom:16px;">😊</div>
    <h2 style="color:#fff;font-size:1.3rem;margin-bottom:8px;">Pas de chance cette fois, ${customerName.split(' ')[0]} !</h2>
    <p style="color:#8892a4;line-height:1.6;">Mais ne vous découragez pas — revenez nous voir et retentez votre chance à votre prochaine visite !</p>
    <div style="margin-top:24px;padding:16px;background:rgba(255,255,255,0.05);border-radius:12px;color:#8892a4;font-size:0.88rem;">
      À bientôt chez ${restaurantName} 👋
    </div>
  </div>
</div>`
    };
  }

  return {
    subject: `🎉 Vous avez gagné chez ${restaurantName} !`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f1117;color:#fff;border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#1a1a3e,#0d0d1a);padding:36px 32px;text-align:center;">
    <div style="font-size:3rem;">🍽️</div>
    <h1 style="color:#FFD700;font-size:1.6rem;margin:12px 0 4px;">${restaurantName}</h1>
    <p style="color:#8892a4;margin:0;">Programme de fidélité</p>
  </div>
  <div style="padding:32px;text-align:center;">
    <div style="font-size:3.5rem;margin-bottom:16px;">🎉</div>
    <h2 style="color:#FFD700;font-size:1.5rem;margin-bottom:8px;">Félicitations ${customerName.split(' ')[0]} !</h2>
    <p style="color:#8892a4;margin-bottom:24px;">Vous avez gagné lors de votre visite chez <strong style="color:#fff;">${restaurantName}</strong></p>

    <div style="background:rgba(255,215,0,0.08);border:2px solid rgba(255,215,0,0.4);border-radius:16px;padding:24px;margin-bottom:24px;">
      <div style="font-size:1.4rem;font-weight:900;color:#FFD700;margin-bottom:6px;">${prizeName}</div>
      <div style="color:#a0aec0;font-size:0.95rem;margin-bottom:16px;">${prizeDesc}</div>
      ${deadlineStr ? `
      <div style="display:inline-block;background:rgba(255,215,0,0.12);border:1px solid rgba(255,215,0,0.3);border-radius:8px;padding:8px 16px;color:#FFD700;font-size:0.88rem;">
        ⏰ Valable jusqu'au ${deadlineStr}
      </div>` : ''}
    </div>

    <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;color:#8892a4;font-size:0.88rem;line-height:1.6;">
      📍 <strong style="color:#fff;">À présenter lors de votre prochaine visite</strong><br>
      Montrez simplement cet email à votre serveur pour bénéficier de votre gain.
    </div>
  </div>
  <div style="padding:20px 32px;text-align:center;color:#4a5568;font-size:0.78rem;border-top:1px solid rgba(255,255,255,0.05);">
    À bientôt chez ${restaurantName} 🍽️
  </div>
</div>`
  };
}

function buildReminderEmail({ customerName, prizeName, deadline, restaurantName, daysLeft }) {
  const deadlineStr = new Date(deadline).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  return {
    subject: `⏰ Votre lot expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''} — ${restaurantName}`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f1117;color:#fff;border-radius:16px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#1a1a3e,#0d0d1a);padding:36px 32px;text-align:center;">
    <div style="font-size:3rem;">🍽️</div>
    <h1 style="color:#FFD700;font-size:1.6rem;margin:12px 0 4px;">${restaurantName}</h1>
  </div>
  <div style="padding:32px;text-align:center;">
    <div style="font-size:3rem;margin-bottom:16px;">⏰</div>
    <h2 style="color:#fff;font-size:1.3rem;margin-bottom:8px;">N'oubliez pas votre lot, ${customerName.split(' ')[0]} !</h2>
    <p style="color:#8892a4;margin-bottom:24px;">Votre gain chez <strong style="color:#fff;">${restaurantName}</strong> expire bientôt.</p>

    <div style="background:rgba(255,215,0,0.08);border:2px solid rgba(255,215,0,0.4);border-radius:16px;padding:24px;margin-bottom:24px;">
      <div style="font-size:1.3rem;font-weight:900;color:#FFD700;margin-bottom:8px;">${prizeName}</div>
      <div style="background:rgba(252,129,129,0.15);border:1px solid rgba(252,129,129,0.4);border-radius:8px;padding:8px 16px;color:#fc8181;font-size:0.88rem;">
        ⚠️ Expire le ${deadlineStr} (dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''})
      </div>
    </div>

    <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px;color:#8892a4;font-size:0.88rem;">
      Venez vite récupérer votre lot chez ${restaurantName} avant qu'il expire !
    </div>
  </div>
</div>`
  };
}

// ─── Envoi ────────────────────────────────────────────────────────────────────
async function sendSpinEmail({ customer, prize, restaurant, isWin }) {
  const transport = await getTransporter();
  if (!transport) return { ok: false, reason: 'SMTP non configuré' };
  if (!restaurant.send_win_email && isWin)   return { ok: false, reason: 'emails désactivés' };
  if (!restaurant.send_lose_email && !isWin) return { ok: false, reason: 'emails désactivés' };

  const { subject, html } = buildWinEmail({
    customerName:   `${customer.first_name} ${customer.last_name}`,
    prizeName:      prize.name,
    prizeDesc:      prize.description,
    deadline:       prize.deadline,
    restaurantName: restaurant.name,
    isWin,
  });

  try {
    await transport.sendMail({
      from:    await getFromAddress(restaurant),
      replyTo: restaurant.email_reply_to || undefined,
      to:      customer.email,
      subject,
      html,
    });
    return { ok: true };
  } catch (e) {
    console.error('[Mailer] Erreur envoi email:', e.message);
    return { ok: false, reason: e.message };
  }
}

async function sendReminderEmail({ customer, spin, prize, restaurant, daysLeft }) {
  const transport = await getTransporter();
  if (!transport) return;
  const { subject, html } = buildReminderEmail({
    customerName:   `${customer.first_name} ${customer.last_name}`,
    prizeName:      prize.name,
    deadline:       spin.deadline,
    restaurantName: restaurant.name,
    daysLeft,
  });
  try {
    await transport.sendMail({
      from:    await getFromAddress(restaurant),
      replyTo: restaurant.email_reply_to || undefined,
      to:      customer.email,
      subject, html,
    });
    console.log(`[Mailer] Rappel envoyé à ${customer.email}`);
  } catch (e) {
    console.error('[Mailer] Erreur rappel:', e.message);
  }
}

async function sendTestEmail(to) {
  const transport = await getTransporter();
  if (!transport) return { ok: false, reason: 'SMTP non configuré' };
  try {
    await transport.sendMail({
      from:    await getFromAddress({ name: 'Restau Wheel', email_from_name: null }),
      to,
      subject: '✅ Test SMTP — Restau Wheel',
      html:    '<p>La configuration SMTP fonctionne correctement !</p>',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

function escMail(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendProspectEmail({ restaurantName, contactName, phone, email }) {
  const transport = await getTransporter();
  if (!transport) return { ok: false, reason: 'smtp_unconfigured' };
  const to = 'enzodemonchauxacker@gmail.com';
  const resto = escMail(restaurantName);
  const who = escMail(contactName);
  const tel = escMail(phone);
  const mail = escMail(email);
  try {
    await transport.sendMail({
      from: await getFromAddress({ name: 'Restau Wheel', email_from_name: 'Restau Wheel' }),
      to,
      replyTo: email || undefined,
      subject: `Prospect Restau Wheel — ${String(restaurantName || '').slice(0, 80)}`,
      html: `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a">
  <p style="font-size:12px;letter-spacing:.14em;color:#ff2d6a;font-weight:700">PROSPECTION</p>
  <h1 style="font-size:22px;margin:8px 0 16px">Nouveau lead</h1>
  <p><strong>Restaurant :</strong> ${resto}</p>
  <p><strong>Contact :</strong> ${who || '—'}</p>
  <p><strong>Téléphone :</strong> <a href="tel:${tel}">${tel}</a></p>
  <p><strong>Email :</strong> ${mail ? `<a href="mailto:${mail}">${mail}</a>` : '—'}</p>
</div>`,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function sendOutreachEmail({ restaurantName, email, unsubUrl }) {
  const transport = await getTransporter();
  if (!transport) return { ok: false, reason: 'smtp_unconfigured' };
  const resto = escMail(restaurantName);
  try {
    await transport.sendMail({
      from: await getFromAddress({ name: 'Restau Wheel', email_from_name: 'Enzo · Restau Wheel' }),
      to: email,
      replyTo: 'enzodemonchauxacker@gmail.com',
      subject: `${restaurantName} — une roue de fidélité pour vos tables`,
      html: `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a;line-height:1.5">
  <p>Bonjour,</p>
  <p>Je me permets de vous écrire au sujet de <strong>${resto}</strong>.</p>
  <p>Restau Wheel pose une petite roue sur vos tables : les clients scannent, jouent, et reviennent chercher leur lot. Vous gardez les lots et les probabilités. <strong>20 € / mois</strong>.</p>
  <p>Vous pouvez tester en 30 secondes, sans compte :<br>
  <a href="https://restauwheel.com/demo?src=email">restauwheel.com/demo</a></p>
  <p>Je suis Enzo, 07 68 03 68 38. Répondez à cet email ou appelez-moi si vous voulez voir ça en vrai.</p>
  <p style="margin-top:28px;font-size:12px;color:#666">
    Prospection B2B Restau Wheel · Lauris<br>
    <a href="${unsubUrl}">Ne plus recevoir ces emails</a>
  </p>
</div>`,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = { sendSpinEmail, sendReminderEmail, sendTestEmail, sendProspectEmail, sendOutreachEmail };
