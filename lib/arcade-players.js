const fs = require('fs');
const path = require('path');

const GAMES = new Set(['bowling', 'laser', 'pince', 'butin']);

function filePath() {
  return process.env.ARCADE_PLAYERS_FILE || path.join(__dirname, '..', 'data', 'arcade-players.json');
}

function acceptsConsent(value) {
  return value === true || value === 1 || value === 'true' || value === '1' || value === 'on';
}

function cleanName(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (text.length < 1 || text.length > 60) return '';
  return text;
}

function cleanEmail(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) || text.length > 120) return '';
  return text;
}

function cleanPhone(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  const digits = text.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  return text.slice(0, 24);
}

function cleanPrize(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > 80) return '';
  return text;
}

function read() {
  try {
    const data = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

function write(players) {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(players, null, 2));
  fs.renameSync(tmp, file);
}

function create(body) {
  const source = body || {};
  if (!acceptsConsent(source.consent)) return { error: 'consent_required' };
  const first = cleanName(source.first);
  const last = cleanName(source.last);
  const email = cleanEmail(source.email);
  const phone = cleanPhone(source.phone);
  const game = GAMES.has(source.game) ? source.game : '';
  if (!first || !last || !email || !phone || !game) return { error: 'invalid_player' };
  const prize = cleanPrize(source.prize);
  const finished = prize && prize !== 'Partie en cours';
  const win = finished && (source.win === true || source.win === 'true' || source.win === 1);
  const players = read();
  const player = {
    id: 'live-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    first,
    last,
    email,
    phone,
    game,
    prize: finished ? prize : 'Partie en cours',
    win,
    status: win ? 'pending' : (finished ? 'played' : 'pending'),
    visits: 1,
    at: new Date().toISOString().slice(0, 10),
    consent: true,
  };
  players.unshift(player);
  write(players.slice(0, 500));
  return { player };
}

function finish(id, body) {
  if (!/^live-[a-z0-9-]+$/.test(String(id || ''))) return { error: 'not_found', status: 404 };
  const players = read();
  const player = players.find((item) => item.id === id);
  if (!player) return { error: 'not_found', status: 404 };
  const source = body || {};
  const prize = cleanPrize(source.prize) || 'Pas de lot cette fois';
  const win = source.win === true || source.win === 'true' || source.win === 1;
  if (player.prize !== 'Partie en cours') player.visits += 1;
  player.prize = prize;
  player.win = win;
  player.status = win ? 'pending' : 'played';
  write(players);
  return { player };
}

function mount(app) {
  app.get('/arcade/api/joueurs', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ players: read() });
  });
  app.post('/arcade/api/joueurs', (req, res) => {
    const result = create(req.body || {});
    if (result.error) return res.status(400).json(result);
    res.status(201).json(result);
  });
  app.patch('/arcade/api/joueurs/:id', (req, res) => {
    const result = finish(req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  });
}

module.exports = {
  acceptsConsent,
  cleanEmail,
  cleanName,
  cleanPhone,
  create,
  finish,
  list: read,
  mount,
};
