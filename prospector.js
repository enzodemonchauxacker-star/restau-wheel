const { db } = require('./database');
const { normalizePhone } = require('./sms');

const UA = 'RestauWheel/1.0 (https://restauwheel.com; teddy@restauwheel.com)';
const OVERPASS_URLS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function getSetting(key, fallback = '') {
  const r = await db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return (r?.value != null && String(r.value).trim() !== '') ? String(r.value).trim() : fallback;
}

async function getSecret(settingKey, envKey) {
  const fromEnv = envKey && process.env[envKey] ? String(process.env[envKey]).trim() : '';
  if (fromEnv) return fromEnv;
  return getSetting(settingKey, '');
}

function secretHint(val) {
  const s = String(val || '');
  if (!s) return '';
  return s.length <= 4 ? '••••' : `••••${s.slice(-4)}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(le|la|les|the|restaurant|resto|cafe|bar|brasserie|pizzeria)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cityKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function sameCity(a, b) {
  const na = cityKey(a);
  const nb = cityKey(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function namesMatch(a, b) {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function extractPostcode(address) {
  const m = String(address || '').match(/\b(\d{5})\b/);
  return m ? m[1] : '';
}

const geoCache = new Map();
async function geocodeCached(city) {
  const key = String(city || '').trim().toLowerCase();
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key);
  const geo = await geocodeCity(city);
  geoCache.set(key, geo);
  return geo;
}

async function geocodeCity(city) {
  const q = /france/i.test(city) ? city : `${city}, France`;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=fr&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Géocodage impossible (${res.status})`);
  const rows = await res.json();
  if (!rows?.[0]) throw new Error(`Ville introuvable : ${city}`);
  return {
    lat: parseFloat(rows[0].lat),
    lon: parseFloat(rows[0].lon),
    label: rows[0].display_name,
  };
}

function overpassQuery(lat, lon, radiusM) {
  const r = Math.min(Math.max(radiusM, 1000), 15000);
  return `[out:json][timeout:12];
(
  nwr["amenity"="restaurant"](around:${r},${lat},${lon});
  nwr["amenity"="cafe"](around:${r},${lat},${lon});
  nwr["amenity"="fast_food"](around:${r},${lat},${lon});
);
out tags center 80;`;
}

async function fetchOverpass(query) {
  const controllers = [];
  const attempts = OVERPASS_URLS.map(async (endpoint) => {
    const ac = new AbortController();
    controllers.push(ac);
    const timer = setTimeout(() => ac.abort(), 10000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.elements)) throw new Error('Overpass vide');
      return data;
    } finally {
      clearTimeout(timer);
    }
  });
  try {
    const data = await Promise.any(attempts);
    controllers.forEach((c) => c.abort());
    return data;
  } catch {
    throw new Error('Overpass trop lent');
  }
}

function mapPhotonFeature(feat, cityFallback) {
  const p = feat?.properties || {};
  const name = String(p.name || '').trim();
  if (!name) return null;
  const osmType = { N: 'node', W: 'way', R: 'relation' }[p.osm_type] || 'node';
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const cityLine = [p.postcode, p.city || cityFallback].filter(Boolean).join(' ');
  return {
    osm_id: p.osm_id != null ? `${osmType}/${p.osm_id}` : '',
    restaurant_name: name.slice(0, 80),
    phone: '',
    email: '',
    website: '',
    address: [street, cityLine].filter(Boolean).join(', ').slice(0, 200),
    city: String(cityFallback || p.city || '').slice(0, 80),
  };
}

async function fetchPhoton(city, lat, lon) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', `restaurant ${city}`);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('limit', '50');
  url.searchParams.set('lang', 'fr');
  url.searchParams.append('osm_tag', 'amenity:restaurant');
  url.searchParams.append('osm_tag', 'amenity:cafe');
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ac.signal });
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    const data = await res.json();
    const feats = Array.isArray(data.features) ? data.features : [];
    return feats.filter((feat) => {
      const c = feat?.properties?.city;
      return !c || sameCity(c, city);
    });
  } finally {
    clearTimeout(timer);
  }
}

function tag(tags, ...keys) {
  if (!tags) return '';
  for (const k of keys) {
    const v = tags[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function formatAddress(tags) {
  const street = [tag(tags, 'addr:housenumber'), tag(tags, 'addr:street')].filter(Boolean).join(' ');
  const city = [tag(tags, 'addr:postcode'), tag(tags, 'addr:city')].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ');
}

function osmKey(el) {
  if (!el || !el.type || el.id == null) return '';
  return `${el.type}/${el.id}`;
}

function firstValidPhone(raw) {
  if (!raw) return '';
  const chunks = String(raw).split(/[|/·;]|(?:\s+ou\s+)/i);
  for (const chunk of chunks) {
    const n = normalizePhone(chunk) || normalizePhone(String(chunk).replace(/[^\d+]/g, ''));
    if (n) return n;
    const digits = String(chunk).replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('0')) {
      const n2 = normalizePhone(digits);
      if (n2) return n2;
    }
  }
  return '';
}

function mapElement(el, cityFallback) {
  const tags = el.tags || {};
  const name = tag(tags, 'name', 'brand');
  if (!name) return null;
  const rawPhone = tag(tags, 'phone', 'contact:phone', 'mobile', 'contact:mobile', 'phone:mobile', 'contact:cellphone');
  return {
    osm_id: osmKey(el),
    restaurant_name: name.slice(0, 80),
    phone: firstValidPhone(rawPhone),
    email: tag(tags, 'email', 'contact:email').toLowerCase().slice(0, 120),
    website: tag(tags, 'website', 'contact:website', 'url').slice(0, 200),
    address: formatAddress(tags).slice(0, 200),
    city: String(cityFallback || tag(tags, 'addr:city')).slice(0, 80),
  };
}

function isUsefulSite(url) {
  if (!url) return false;
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
    return !/(facebook|instagram|twitter|x\.com|tiktok|tripadvisor|thefork|lafourchette|google|youtube|linktr\.ee)\./i.test(host)
      && !/^(facebook|instagram|tripadvisor)\.com$/i.test(host);
  } catch {
    return false;
  }
}

function pickSiteEmail(list) {
  const skip = /noreply|no-reply|sentry|wixpress|example|domain|wordpress|cloudflare|png|jpg|svg/i;
  for (const raw of list) {
    const e = String(raw || '').trim().toLowerCase().replace(/^mailto:/, '').split('?')[0];
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e) || skip.test(e)) continue;
    return e.slice(0, 120);
  }
  return '';
}

function pickSitePhone(list) {
  const scored = [];
  for (const raw of list) {
    const n = firstValidPhone(raw);
    if (!n) continue;
    let score = 0;
    if (n.startsWith('+33490') || n.startsWith('+33491') || n.startsWith('+33486')) score += 5;
    if (n.startsWith('+336') || n.startsWith('+337')) score += 3;
    if (n.startsWith('+339')) score += 2;
    if (n.startsWith('+33')) score += 1;
    scored.push({ n, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.n || '';
}

async function fetchHtml(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 7000);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RestauWheel/1.0; +https://restauwheel.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buf.slice(0, 220000));
    return text;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function extractFromHtml(html) {
  if (!html) return { phone: '', email: '' };
  const tels = [...html.matchAll(/href=["']tel:([^"']+)/gi)].map((m) => m[1]);
  const mails = [...html.matchAll(/href=["']mailto:([^"'?]+)/gi)].map((m) => m[1]);
  const nearTel = [...html.matchAll(/(?:t[eé]l(?:[eé]phone)?|r[eé]serv(?:ation)?|appel(?:ez)?)[^<]{0,80}?(0[1-9](?:[\s.\-]?\d{2}){4})/gi)].map((m) => m[1]);
  const loosePhones = html.match(/0[1-9](?:[\s.\-]?\d{2}){4}/g) || [];
  const looseMails = html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  return {
    phone: pickSitePhone([...tels, ...nearTel, ...loosePhones]),
    email: pickSiteEmail([...mails, ...looseMails]),
  };
}

function extraContactUrls(base, html) {
  const urls = [];
  const re = /href=["']([^"']*(?:contact|nous-contacter|reservation|r[eé]servation|mentions)[^"']*)["']/gi;
  let m;
  while ((m = re.exec(html)) && urls.length < 2) {
    try {
      const abs = new URL(m[1], base).href;
      if (abs.startsWith('http') && !urls.includes(abs)) urls.push(abs);
    } catch { /* ignore */ }
  }
  return urls;
}

async function contactsFromWebsite(website) {
  if (!isUsefulSite(website)) return { phone: '', email: '' };
  const home = website.startsWith('http') ? website : `https://${website}`;
  const html = await fetchHtml(home);
  let found = extractFromHtml(html);
  if (found.phone && found.email) return found;
  for (const extra of extraContactUrls(home, html)) {
    const more = extractFromHtml(await fetchHtml(extra));
    found = {
      phone: found.phone || more.phone,
      email: found.email || more.email,
    };
    if (found.phone && found.email) break;
  }
  return found;
}

async function fillProspect(id, patch) {
  const cur = await db.prepare('SELECT * FROM prospects WHERE id=?').get(id);
  if (!cur) return false;
  const phone = cur.phone || patch.phone || '';
  const email = cur.email || patch.email || '';
  const website = cur.website || patch.website || '';
  const address = cur.address || patch.address || '';
  const googlePlaceId = cur.google_place_id || patch.google_place_id || null;
  const siret = cur.siret || patch.siret || '';
  const osmId = cur.osm_id || patch.osm_id || null;
  if (
    phone === (cur.phone || '')
    && email === (cur.email || '')
    && website === (cur.website || '')
    && address === (cur.address || '')
    && googlePlaceId === (cur.google_place_id || null)
    && siret === (cur.siret || '')
    && osmId === (cur.osm_id || null)
  ) return false;
  await db.prepare(
    'UPDATE prospects SET phone=?, email=?, website=?, address=?, google_place_id=?, siret=?, osm_id=? WHERE id=?'
  ).run(phone, email, website, address, googlePlaceId, siret, osmId, id);
  return true;
}

async function insertProspect(row) {
  await db.prepare(`
    INSERT INTO prospects
      (restaurant_name, contact_name, phone, email, source, osm_id, google_place_id, siret, address, website, city, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    row.restaurant_name,
    row.contact_name || '',
    row.phone || '',
    row.email || '',
    row.source || 'osm',
    row.osm_id || null,
    row.google_place_id || null,
    row.siret || '',
    row.address || '',
    row.website || '',
    row.city || '',
    'new'
  );
}

async function findExistingProspect(row, { fuzzy = true } = {}) {
  if (row.google_place_id) {
    const hit = await db.prepare('SELECT * FROM prospects WHERE google_place_id=? LIMIT 1').get(row.google_place_id);
    if (hit) return hit;
  }
  if (row.osm_id) {
    const hit = await db.prepare('SELECT * FROM prospects WHERE osm_id=? LIMIT 1').get(row.osm_id);
    if (hit) return hit;
  }
  if (row.phone) {
    const hit = await db.prepare("SELECT * FROM prospects WHERE phone=? AND phone <> '' LIMIT 1").get(row.phone);
    if (hit) return hit;
  }
  if (row.siret) {
    const hit = await db.prepare("SELECT * FROM prospects WHERE siret=? AND siret <> '' LIMIT 1").get(row.siret);
    if (hit) return hit;
  }
  const exact = await db.prepare(
    "SELECT * FROM prospects WHERE lower(restaurant_name)=lower(?) AND lower(coalesce(city,'')) = lower(?) LIMIT 1"
  ).get(row.restaurant_name, row.city || '');
  if (exact) return exact;

  if (fuzzy && row.city && row.restaurant_name) {
    const neighbors = await db.prepare(
      "SELECT * FROM prospects WHERE lower(coalesce(city,'')) = lower(?) LIMIT 80"
    ).all(row.city);
    return neighbors.find((r) => namesMatch(r.restaurant_name, row.restaurant_name)) || null;
  }
  return null;
}

async function alreadyExists(row) {
  return !!(await findExistingProspect(row));
}

async function upsertOsmProspects(rows) {
  let added = 0;
  let skipped = 0;
  const osmIds = rows.map((r) => r.osm_id).filter(Boolean);
  const known = new Set();
  if (osmIds.length) {
    const placeholders = osmIds.map(() => '?').join(',');
    const hits = await db.prepare(
      `SELECT osm_id FROM prospects WHERE osm_id IN (${placeholders})`
    ).all(...osmIds);
    for (const h of hits) known.add(h.osm_id);
  }
  for (const row of rows) {
    if (row.osm_id && known.has(row.osm_id)) {
      skipped++;
      continue;
    }
    const existing = await findExistingProspect(row, { fuzzy: false });
    if (existing) {
      skipped++;
      continue;
    }
    await insertProspect({ ...row, source: 'osm' });
    added++;
    if (row.osm_id) known.add(row.osm_id);
  }
  return { added, skipped };
}

async function googlePlaces(path, key, body) {
  const res = await fetch(`https://places.googleapis.com/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Clé Google Places refusée. Active « Places API (New) » sur la clé.');
  }
  if (!res.ok) {
    let msg = `Google Places ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error?.message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

function mapGooglePlace(place, cityFallback) {
  const name = place?.displayName?.text || '';
  if (!name) return null;
  return {
    google_place_id: place.id || '',
    restaurant_name: String(name).slice(0, 80),
    phone: firstValidPhone(place.internationalPhoneNumber || place.nationalPhoneNumber),
    email: '',
    website: String(place.websiteUri || '').slice(0, 200),
    address: String(place.formattedAddress || '').slice(0, 200),
    city: cityFallback.slice(0, 80),
    source: 'google',
  };
}

async function fetchGoogleNearby(lat, lon, radiusM, key) {
  const data = await googlePlaces('places:searchNearby', key, {
    includedTypes: ['restaurant', 'cafe', 'bar'],
    maxResultCount: 20,
    languageCode: 'fr',
    regionCode: 'FR',
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius: Math.min(Math.max(radiusM, 100), 50000),
      },
    },
  });
  return Array.isArray(data.places) ? data.places : [];
}

async function googleFindPlace(name, city, key) {
  const geo = city ? await geocodeCached(city).catch(() => null) : null;
  const body = {
    textQuery: [name, city, 'restaurant'].filter(Boolean).join(' '),
    languageCode: 'fr',
    regionCode: 'FR',
    maxResultCount: 3,
  };
  if (geo) {
    body.locationBias = {
      circle: {
        center: { latitude: geo.lat, longitude: geo.lon },
        radius: 15000,
      },
    };
  }
  const data = await googlePlaces('places:searchText', key, body);
  const places = Array.isArray(data.places) ? data.places : [];
  const mapped = places.map((p) => mapGooglePlace(p, city || '')).filter(Boolean);
  return mapped.find((p) => namesMatch(p.restaurant_name, name)) || mapped[0] || null;
}

async function upsertGoogleProspects(places, city) {
  let added = 0;
  let merged = 0;
  for (const place of places) {
    const row = mapGooglePlace(place, city);
    if (!row) continue;
    const existing = await findExistingProspect(row);
    if (existing) {
      if (await fillProspect(existing.id, row)) merged++;
      continue;
    }
    await insertProspect(row);
    added++;
  }
  return { added, merged };
}

function isRestoNaf(code) {
  return /^56/.test(String(code || ''));
}

async function pappersGet(path, token, params) {
  const q = new URLSearchParams({ api_token: token, ...params });
  const res = await fetch(`https://api.pappers.fr/v2/${path}?${q}`, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Token Pappers refusé. Vérifie la clé sur pappers.fr/api.');
  }
  if (res.status === 402) {
    throw new Error('Plus de jetons Pappers. Recharge le compte ou désactive Pappers.');
  }
  if (!res.ok) {
    let msg = `Pappers ${res.status}`;
    try {
      const j = await res.json();
      msg = j.message || j.error || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

function pickPappersHit(results, name) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) return null;
  const restos = list.filter((r) => isRestoNaf(r.code_naf));
  const pool = restos.length ? restos : list;
  return pool.find((r) => namesMatch(r.nom_entreprise || r.denomination, name)) || pool[0] || null;
}

function contactsFromPappersFiche(fiche) {
  const phones = [
    fiche?.telephone,
    fiche?.siege?.telephone,
    fiche?.etablissement?.telephone,
  ];
  const emails = [
    fiche?.email,
    fiche?.siege?.email,
    fiche?.etablissement?.email,
  ];
  const sites = fiche?.sites_internet || fiche?.site_internet || fiche?.siege?.site_internet || '';
  const site = Array.isArray(sites) ? (sites[0] || '') : String(sites || '');
  return {
    phone: pickSitePhone(phones.filter(Boolean)) || firstValidPhone(phones.find(Boolean)),
    email: pickSiteEmail(emails.filter(Boolean)),
    website: String(site).slice(0, 200),
    siret: String(fiche?.siege?.siret || fiche?.siret || '').slice(0, 14),
  };
}

async function pappersLookup(name, address, city, token) {
  const params = {
    q: name,
    par_page: '5',
    entreprise_cessee: 'false',
  };
  const cp = extractPostcode(address);
  if (cp) params.code_postal = cp;
  else if (city) params.q = `${name} ${city}`;
  const data = await pappersGet('recherche', token, params);
  const hit = pickPappersHit(data.resultats || data.entreprises || [], name);
  if (!hit?.siren) return null;
  const fiche = await pappersGet('entreprise', token, {
    siren: String(hit.siren),
    champs_supplementaires: 'telephone,email',
  });
  return contactsFromPappersFiche(fiche);
}

async function enrichFromWebsites(limit) {
  const rows = await db.prepare(`
    SELECT id, website, phone, email FROM prospects
    WHERE website IS NOT NULL AND website <> ''
      AND (coalesce(phone,'') = '' OR coalesce(email,'') = '')
    ORDER BY id DESC LIMIT ?
  `).all(limit);
  let updated = 0;
  for (const row of rows) {
    const found = await contactsFromWebsite(row.website);
    if (await fillProspect(row.id, found)) updated++;
  }
  return { checked: rows.length, updated };
}

async function enrichFromGoogle(key, limit) {
  const rows = await db.prepare(`
    SELECT id, restaurant_name, city, phone, email, website FROM prospects
    WHERE coalesce(phone,'') = ''
    ORDER BY id DESC LIMIT ?
  `).all(limit);
  let updated = 0;
  for (const row of rows) {
    const found = await googleFindPlace(row.restaurant_name, row.city, key);
    await sleep(120);
    if (!found) continue;
    if (await fillProspect(row.id, found)) updated++;
  }
  return { checked: rows.length, updated };
}

async function enrichFromPappers(token, limit) {
  const rows = await db.prepare(`
    SELECT id, restaurant_name, city, address, phone, email FROM prospects
    WHERE coalesce(phone,'') = '' OR coalesce(email,'') = ''
    ORDER BY id DESC LIMIT ?
  `).all(limit);
  let updated = 0;
  for (const row of rows) {
    try {
      const found = await pappersLookup(row.restaurant_name, row.address, row.city, token);
      await sleep(200);
      if (!found) continue;
      if (await fillProspect(row.id, found)) updated++;
    } catch (e) {
      if (/jetons|refusé|refus/i.test(e.message || '')) throw e;
    }
  }
  return { checked: rows.length, updated };
}

async function enrichMissingContacts(limit = 20) {
  const googleKey = await getSecret('google_places_key', 'GOOGLE_PLACES_API_KEY');
  const pappersKey = await getSecret('pappers_api_token', 'PAPPERS_API_TOKEN');
  const stats = {
    checked: 0,
    updated: 0,
    website: 0,
    google: 0,
    pappers: 0,
    google_ok: !!googleKey,
    pappers_ok: !!pappersKey,
  };

  const webLimit = (googleKey || pappersKey) ? Math.min(8, limit) : limit;
  const web = await enrichFromWebsites(webLimit);
  stats.website = web.updated;
  stats.checked += web.checked;
  stats.updated += web.updated;

  if (googleKey) {
    try {
      const g = await enrichFromGoogle(googleKey, Math.min(20, limit));
      stats.google = g.updated;
      stats.checked += g.checked;
      stats.updated += g.updated;
    } catch (e) {
      stats.google_error = e.message || 'Google Places erreur';
    }
  }

  if (pappersKey) {
    try {
      const p = await enrichFromPappers(pappersKey, Math.min(12, limit));
      stats.pappers = p.updated;
      stats.checked += p.checked;
      stats.updated += p.updated;
    } catch (e) {
      stats.pappers_error = e.message || 'Pappers erreur';
    }
  }

  return stats;
}

/**
 * Cherche les restos autour d’une ville (OSM + Google si clé) et les enregistre.
 */
async function scanCity(cityRaw, radiusKmRaw) {
  const city = String(cityRaw || '').trim();
  const radiusKm = Math.min(40, Math.max(3, parseInt(radiusKmRaw, 10) || 12));
  if (city.length < 2) throw new Error('Ville requise');

  const geo = await geocodeCity(city);
  let osmError = '';
  let mapped = [];
  try {
    const data = await fetchOverpass(overpassQuery(geo.lat, geo.lon, radiusKm * 1000));
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const seen = new Set();
    for (const el of elements) {
      const row = mapElement(el, city);
      if (!row || seen.has(row.osm_id)) continue;
      seen.add(row.osm_id);
      mapped.push(row);
      if (mapped.length >= 80) break;
    }
  } catch (e) {
    osmError = e.message || 'OpenStreetMap indisponible';
  }
  if (!mapped.length) {
    try {
      const feats = await fetchPhoton(city, geo.lat, geo.lon);
      const seen = new Set();
      for (const feat of feats) {
        const row = mapPhotonFeature(feat, city);
        if (!row || (row.osm_id && seen.has(row.osm_id))) continue;
        if (row.osm_id) seen.add(row.osm_id);
        mapped.push(row);
      }
      if (mapped.length) osmError = '';
    } catch (e) {
      osmError = osmError || e.message || 'Recherche ville impossible';
    }
  }
  const { added, skipped } = mapped.length
    ? await upsertOsmProspects(mapped)
    : { added: 0, skipped: 0 };

  let googleAdded = 0;
  let googleMerged = 0;
  let googleError = '';
  const googleKey = await getSecret('google_places_key', 'GOOGLE_PLACES_API_KEY');
  if (googleKey) {
    try {
      const places = await fetchGoogleNearby(geo.lat, geo.lon, radiusKm * 1000, googleKey);
      const g = await upsertGoogleProspects(places, city);
      googleAdded = g.added;
      googleMerged = g.merged;
    } catch (e) {
      googleError = e.message || 'Google Places erreur';
    }
  }

  if (!mapped.length && !googleAdded && (osmError || googleError)) {
    throw new Error(osmError || googleError);
  }

  return {
    city,
    label: geo.label,
    radius_km: radiusKm,
    found: mapped.length + googleAdded,
    added: added + googleAdded,
    skipped,
    google_added: googleAdded,
    google_merged: googleMerged,
    google_ok: !!googleKey && !googleError,
    google_error: googleError || undefined,
    osm_error: osmError || undefined,
    pappers_ok: !!(await getSecret('pappers_api_token', 'PAPPERS_API_TOKEN')),
    enriched: 0,
  };
}

async function scanFromSettings() {
  const enabled = await getSetting('prospect_auto', '1');
  if (enabled === '0' || enabled === 'false') return { skipped: true, reason: 'auto_off' };
  const city = await getSetting('prospect_city', 'Lauris');
  const radius = await getSetting('prospect_radius_km', '12');
  return scanCity(city, radius);
}

module.exports = { scanCity, scanFromSettings, getSetting, getSecret, secretHint, enrichMissingContacts, sameCity };
