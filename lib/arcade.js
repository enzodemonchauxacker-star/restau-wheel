const crypto = require('crypto');

const DEFAULT_CODE = 'piste';
const DEFAULT_GIFT = {
  label: 'Partie offerte',
  detail: 'À récupérer au comptoir.',
};

function hashArcadeCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function cleanGift(input) {
  const label = String(input?.label || '').replace(/\s+/g, ' ').trim();
  const detail = String(input?.detail || '').replace(/\s+/g, ' ').trim();
  if (!label || label.length > 80) return null;
  if (detail.length > 180) return null;
  return { label, detail };
}

// The throw is a show. The gift does not depend on how many pins fall.
function rewardForThrow(gift) {
  const cleaned = cleanGift(gift);
  return cleaned || { ...DEFAULT_GIFT };
}

module.exports = {
  DEFAULT_CODE,
  DEFAULT_GIFT,
  hashArcadeCode,
  safeEqual,
  cleanGift,
  rewardForThrow,
};
