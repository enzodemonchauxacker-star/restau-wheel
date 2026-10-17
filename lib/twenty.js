/** Pont Restau Wheel → Twenty. Twenty reste un service à part, appelé par son API. */

const BATCH = 60;

function cleanBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.origin;
}

function chunk(list, size = BATCH) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function companyPayload(restaurant) {
  return { name: String(restaurant?.name || 'Restaurant').trim().slice(0, 255) || 'Restaurant' };
}

function phonePayload(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  const compact = raw.replace(/[^\d+]/g, '');
  if (compact.replace(/\D/g, '').length < 8) return null;
  let number = compact;
  let calling = '+33';
  let country = 'FR';
  if (compact.startsWith('+33')) {
    number = `0${compact.slice(3)}`;
  } else if (compact.startsWith('+')) {
    return null;
  } else if (!compact.startsWith('0')) {
    return null;
  }
  return {
    primaryPhoneNumber: number,
    primaryPhoneCountryCode: country,
    primaryPhoneCallingCode: calling,
    additionalPhones: null,
  };
}

function personPayload(customer, companyId) {
  const email = String(customer?.email || '').trim().toLowerCase();
  const body = {
    name: {
      firstName: String(customer?.first_name || '').trim(),
      lastName: String(customer?.last_name || '').trim(),
    },
    emails: { primaryEmail: email, additionalEmails: null },
  };
  const phones = phonePayload(customer?.phone);
  if (phones) body.phones = phones;
  if (companyId) body.companyId = companyId;
  return body;
}

function dedupeCustomers(customers) {
  const seen = new Set();
  const unique = [];
  let skipped = 0;
  for (const customer of customers || []) {
    const email = String(customer?.email || '').trim().toLowerCase();
    if (!email || seen.has(email)) {
      skipped += 1;
      continue;
    }
    seen.add(email);
    unique.push(customer);
  }
  return { unique, skipped };
}

function createdRecords(response, plural) {
  const key = `create${plural.charAt(0).toUpperCase()}${plural.slice(1)}`;
  const rows = response?.data?.[key];
  return Array.isArray(rows) ? rows : [];
}

module.exports = {
  BATCH,
  cleanBaseUrl,
  chunk,
  companyPayload,
  phonePayload,
  personPayload,
  dedupeCustomers,
  createdRecords,
};
