const billing = require('../lib/rekone-billing');

let stripe = null;
function getStripe() {
  if (stripe) return stripe;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString('utf8');
    return raw ? JSON.parse(raw) : {};
  }
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

module.exports = async function arcadeBilling(req, res) {
  const url = new URL(req.url || '/', 'https://rekone.local');
  const action = url.searchParams.get('action') || '';
  if (action === 'webhook') {
    const handler = billing.createWebhookHandler({ getStripe });
    return handler({
      body: Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})),
      get(name) { return req.headers[String(name).toLowerCase()]; },
    }, {
      status(code) { res.statusCode = code; return this; },
      json(body) { send(res, res.statusCode || 200, body); },
    });
  }
  const fakeReq = {
    protocol: 'https',
    headers: req.headers || {},
    query: Object.fromEntries(url.searchParams.entries()),
    body: {},
    get(name) { return req.headers[String(name).toLowerCase()]; },
  };
  const fakeRes = {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; send(res, this.statusCode, body); },
  };
  const app = { routes: [] };
  const register = (method, routePath, handler) => app.routes.push({ method, routePath, handler });
  billing.mount({ get: register.bind(null, 'GET'), post: register.bind(null, 'POST') }, { getStripe });
  try {
    if (req.method === 'POST') fakeReq.body = readBody(req);
  } catch (_) {
    return send(res, 400, { error: 'Requête invalide' });
  }
  const target = action
    ? `/arcade/api/abonnement/${action}`
    : (req.method === 'GET' && url.searchParams.get('session_id')
      ? '/arcade/api/abonnement/session'
      : '/arcade/api/abonnement');
  const route = app.routes.find((item) => item.method === req.method && item.routePath === target);
  if (!route) {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'method' });
  }
  return route.handler(fakeReq, fakeRes);
};
