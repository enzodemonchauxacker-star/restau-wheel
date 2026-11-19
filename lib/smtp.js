'use strict';

function normalizeSmtpSecure(raw, port) {
  const mode = String(raw || 'auto').trim().toLowerCase();
  if (mode === 'ssl') return { secure: true, requireTLS: false };
  if (mode === 'tls' || mode === 'starttls') return { secure: false, requireTLS: true };
  if (mode === 'none' || mode === 'off') return { secure: false, requireTLS: false };
  return { secure: Number(port) === 465, requireTLS: false };
}

function isSmtpEnabledValue(raw) {
  const v = String(raw == null ? '1' : raw).trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

function restaurantHasOwnSmtp(restaurant) {
  if (!restaurant) return false;
  if (!isSmtpEnabledValue(restaurant.smtp_enabled)) return false;
  return !!(restaurant.smtp_host && restaurant.smtp_user && restaurant.smtp_pass);
}

module.exports = { normalizeSmtpSecure, isSmtpEnabledValue, restaurantHasOwnSmtp };
