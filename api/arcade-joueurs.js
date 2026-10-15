const { create, finish, list } = require('../lib/arcade-players');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  if (!raw) return {};
  return JSON.parse(raw);
}

module.exports = function arcadeJoueurs(req, res) {
  try {
    const url = new URL(req.url || '/', 'https://arcade.local');
    const id = url.searchParams.get('id') || ((req.url || '').match(/joueurs\/(live-[a-z0-9-]+)/) || [])[1];
    if (req.method === 'GET') return send(res, 200, { players: list() });
    const body = readBody(req);
    if (req.method === 'POST') {
      const result = create(body);
      if (result.error) return send(res, 400, result);
      return send(res, 201, result);
    }
    if (req.method === 'PATCH') {
      const result = finish(id, body);
      if (result.error) return send(res, result.status || 400, result);
      return send(res, 200, result);
    }
    res.setHeader('Allow', 'GET, POST, PATCH');
    return send(res, 405, { error: 'method' });
  } catch (error) {
    return send(res, 500, { error: 'server' });
  }
};
