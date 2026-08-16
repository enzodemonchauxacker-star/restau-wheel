/**
 * SMS via Twilio (API REST).
 * Env :
 *   TWILIO_ACCOUNT_SID (AC…)
 *   TWILIO_FROM (+…)
 *   Auth : TWILIO_API_KEY (SK…) + TWILIO_API_SECRET
 *        ou TWILIO_AUTH_TOKEN (legacy)
 *   SMS_ENABLED=1 — active les envois (sinon aucun SMS, défaut)
 * Ou settings DB : twilio_sid, twilio_token / twilio_api_key+secret, twilio_from
 */
const { db } = require('./database');

const TRIAL_TEMPLATE_WIN = process.env.TWILIO_TRIAL_TEMPLATE_WIN || 'sms_2fa';
const TRIAL_TEMPLATE_REMINDER = process.env.TWILIO_TRIAL_TEMPLATE_REMINDER || 'sms_appointment_reminders';

async function getSetting(key) {
  const r = await db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r?.value || '';
}

function smsEnabled() {
  return process.env.SMS_ENABLED === '1' || process.env.SMS_ENABLED === 'true';
}

function useTrialTemplates() {
  return process.env.TWILIO_TRIAL_TEMPLATES === '1' || process.env.TWILIO_TRIAL_TEMPLATES === 'true';
}

async function getTwilioConfig() {
  if (!smsEnabled()) return null;
  const accountSid = process.env.TWILIO_ACCOUNT_SID || await getSetting('twilio_sid');
  const from = process.env.TWILIO_FROM || await getSetting('twilio_from');
  const apiKey = process.env.TWILIO_API_KEY || await getSetting('twilio_api_key');
  const apiSecret = process.env.TWILIO_API_SECRET || await getSetting('twilio_api_secret');
  const authToken = process.env.TWILIO_AUTH_TOKEN || await getSetting('twilio_token');

  if (!accountSid || !from) return null;

  // Préférer Auth Token si dispo (plus fiable en trial)
  if (authToken) {
    return { accountSid, username: accountSid, password: authToken, from };
  }
  if (apiKey && apiSecret) {
    return { accountSid, username: apiKey, password: apiSecret, from };
  }
  return null;
}

/** Normalise un numéro FR/international vers E.164 */
function normalizePhone(raw) {
  if (!raw) return null;
  let d = String(raw).trim().replace(/[\s.\-()]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (d.startsWith('0') && d.length === 10) d = '+33' + d.slice(1);
  if (!d.startsWith('+')) {
    if (/^33\d{9}$/.test(d)) d = '+' + d;
    else return null;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(d)) return null;
  return d;
}

/**
 * Sur trial Twilio, le destinataire FR vérifié matche parfois +3306… (0 conservé)
 * plutôt que l'E.164 strict +336…
 */
function toTwilioPhone(e164) {
  if (!useTrialTemplates()) return e164;
  const m = e164 && e164.match(/^\+33([1-9]\d{8})$/);
  if (m) return `+330${m[1]}`;
  return e164;
}

async function sendSms(to, body) {
  const cfg = await getTwilioConfig();
  if (!cfg) return { ok: false, reason: 'Twilio non configuré' };

  const dest = toTwilioPhone(to);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const auth = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
  const params = new URLSearchParams({ To: dest, From: cfg.from, Body: body });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[SMS] Twilio error:', data.message || res.status, { to: dest });
      return { ok: false, reason: data.message || `HTTP ${res.status}` };
    }
    console.log('[SMS] OK', data.sid, '→', data.to, 'status=', data.status);
    return { ok: true, sid: data.sid, body: data.body };
  } catch (e) {
    console.error('[SMS] Erreur:', e.message);
    return { ok: false, reason: e.message };
  }
}

async function sendWinSms({ customer, prize, restaurant }) {
  const phone = normalizePhone(customer.phone);
  if (!phone) return { ok: false, reason: 'pas de téléphone' };

  if (useTrialTemplates()) {
    return sendSms(phone, TRIAL_TEMPLATE_WIN);
  }

  const deadlineStr = prize.deadline
    ? new Date(prize.deadline).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    : null;

  const msg = deadlineStr
    ? `${restaurant.name} : Bravo ${customer.first_name} ! Tu as gagne « ${prize.name} ». Valable jusqu'au ${deadlineStr}. A bientot !`
    : `${restaurant.name} : Bravo ${customer.first_name} ! Tu as gagne « ${prize.name} ». A bientot !`;

  return sendSms(phone, msg);
}

async function sendLoseSms({ customer, prize, restaurant }) {
  const phone = normalizePhone(customer.phone);
  if (!phone) return { ok: false, reason: 'pas de téléphone' };

  if (useTrialTemplates()) {
    return sendSms(phone, TRIAL_TEMPLATE_REMINDER);
  }

  const msg = `${restaurant.name} : Dommage ${customer.first_name}… Pas de gain cette fois (« ${prize.name} »). Retente ta chance a la prochaine visite !`;
  return sendSms(phone, msg);
}

async function sendExpirySms({ customer, prize, restaurant, daysLeft }) {
  const phone = normalizePhone(customer.phone);
  if (!phone) return { ok: false, reason: 'pas de téléphone' };

  if (useTrialTemplates()) {
    return sendSms(phone, TRIAL_TEMPLATE_REMINDER);
  }

  const days = Math.max(1, daysLeft);
  const msg = days === 1
    ? `${restaurant.name} : ${customer.first_name}, il ne te reste qu'1 jour pour recuperer « ${prize.name} » ! Passe vite nous voir.`
    : `${restaurant.name} : ${customer.first_name}, il ne te reste que ${days} jours pour recuperer « ${prize.name} » avant expiration. Passe nous voir !`;

  return sendSms(phone, msg);
}

module.exports = {
  normalizePhone,
  getTwilioConfig,
  sendSms,
  sendWinSms,
  sendLoseSms,
  sendExpirySms,
  useTrialTemplates,
};
