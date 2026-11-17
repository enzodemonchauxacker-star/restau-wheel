'use strict';

const crypto = require('crypto');

function newAffiliateCode() {
  return crypto.randomBytes(4).toString('hex');
}

function normalizeAffiliateCode(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
}

function buildAffiliateRegisterUrl(baseUrl, code) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const ref = normalizeAffiliateCode(code);
  if (!base || !ref) return '';
  return `${base}/register?ref=${encodeURIComponent(ref)}`;
}

module.exports = {
  newAffiliateCode,
  normalizeAffiliateCode,
  buildAffiliateRegisterUrl,
};
