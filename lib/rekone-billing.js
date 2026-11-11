'use strict';

const fs = require('fs');
const path = require('path');

const INTEGRATION_ID = 'rekone-abonnement-kptmzwxq';
const PRODUCT = 'rekone';

const MERCHANT = {
  name: 'Enzo Demonchaux-Acker',
  form: 'Entrepreneur individuel',
  trade: 'QuoteSaas',
  siren: '106 921 182',
  siret: '106 921 182 00015',
  ape: '58.29C',
  rne: '03/07/2026',
  address: ['33 C Avenue des Messeguières', '84360 Lauris', 'France'],
  email: 'contact@restauwheel.com',
  site: 'https://rekone.si',
  host: 'Vercel Inc.',
  payments: 'Stripe',
};

function priceId(env = process.env) {
  return env.STRIPE_REKONE_PRICE_ID || env.STRIPE_PRICE_ID || '';
}

function webhookSecret(env = process.env) {
  return env.STRIPE_REKONE_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET || '';
}

function storePath(env = process.env) {
  if (env.REKONE_BILLING_FILE) return env.REKONE_BILLING_FILE;
  if (env.VERCEL) return '/tmp/rekone-subscriptions.json';
  return path.join(__dirname, '..', 'data', 'rekone-subscriptions.json');
}

function cleanName(value, max = 80) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (text.length < 1 || text.length > max) return '';
  return text;
}

function cleanEmail(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) || text.length > 120) return '';
  return text;
}

function isRekoneSub(sub) {
  return sub?.metadata?.product === PRODUCT;
}

function readStore(file = storePath()) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && typeof data === 'object' && data.subscriptions ? data : { subscriptions: {} };
  } catch (_) {
    return { subscriptions: {} };
  }
}

function writeStore(data, file = storePath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  const ids = Object.keys(data.subscriptions);
  if (ids.length > 500) {
    ids.sort((a, b) => String(data.subscriptions[a].updated_at || '').localeCompare(String(data.subscriptions[b].updated_at || '')));
    for (const id of ids.slice(0, ids.length - 500)) delete data.subscriptions[id];
  }
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function upsert(record, file = storePath()) {
  const data = readStore(file);
  const prev = data.subscriptions[record.id] || {};
  const next = { ...prev, ...record, id: record.id, updated_at: new Date().toISOString() };
  for (const key of ['email', 'venue', 'name']) {
    if (!next[key]) next[key] = prev[key] || '';
  }
  data.subscriptions[record.id] = next;
  writeStore(data, file);
  return next;
}

function periodEnd(sub) {
  return sub?.current_period_end || sub?.items?.data?.[0]?.current_period_end || null;
}

function invoiceSubscriptionId(invoice) {
  if (!invoice || typeof invoice !== 'object') return '';
  if (typeof invoice.subscription === 'string') return invoice.subscription;
  if (invoice.subscription?.id) return invoice.subscription.id;
  const parent = invoice.parent?.subscription_details?.subscription;
  if (typeof parent === 'string') return parent;
  if (parent?.id) return parent.id;
  return '';
}

async function subscriptionFromId(stripe, id, file) {
  if (!id) return null;
  const known = readStore(file).subscriptions[id];
  if (!stripe || typeof stripe.subscriptions?.retrieve !== 'function') {
    return known ? { id, metadata: { product: PRODUCT } } : null;
  }
  const sub = await stripe.subscriptions.retrieve(id);
  if (isRekoneSub(sub) || known) return sub;
  return null;
}

async function chargeSubscriptionId(stripe, charge) {
  if (!charge) return '';
  if (charge.invoice && typeof charge.invoice === 'object') {
    const id = invoiceSubscriptionId(charge.invoice);
    if (id) return id;
  }
  if (typeof charge.invoice === 'string' && stripe?.invoices?.retrieve) {
    const id = invoiceSubscriptionId(await stripe.invoices.retrieve(charge.invoice));
    if (id) return id;
  }
  const intent = charge.payment_intent;
  if (!intent || !stripe?.paymentIntents?.retrieve) return '';
  const paymentIntent = typeof intent === 'string'
    ? await stripe.paymentIntents.retrieve(intent, { expand: ['invoice'] })
    : intent;
  return invoiceSubscriptionId(paymentIntent.invoice);
}

async function loadOffer(stripe, env = process.env) {
  const id = priceId(env);
  const base = {
    ready: Boolean(stripe && id),
    amount: 2000,
    currency: 'eur',
    interval: 'month',
    productName: 'Rekone',
    priceId: id || null,
    legal: MERCHANT,
  };
  if (!stripe || !id || typeof stripe.prices?.retrieve !== 'function') return base;
  try {
    const price = await stripe.prices.retrieve(id, { expand: ['product'] });
    const product = price.product && typeof price.product === 'object' ? price.product : null;
    return {
      ...base,
      ready: true,
      amount: Number.isInteger(price.unit_amount) ? price.unit_amount : base.amount,
      currency: price.currency || 'eur',
      interval: price.recurring?.interval || 'month',
      productName: product?.name || 'Rekone',
    };
  } catch (_) {
    return { ...base, ready: false };
  }
}

async function createCheckout(stripe, body, origin, env = process.env) {
  const email = cleanEmail(body?.email);
  const name = cleanName(body?.name);
  const venue = cleanName(body?.venue);
  if (!email || !name || !venue) return { error: 'Email, nom et salle requis', status: 400 };
  const id = priceId(env);
  if (!stripe || !id) return { error: 'Paiement non configuré', status: 503 };
  const metadata = { product: PRODUCT, venue, customer_name: name };
  const params = {
    mode: 'subscription',
    customer_email: email,
    client_reference_id: venue.slice(0, 80),
    line_items: [{ price: id, quantity: 1 }],
    success_url: `${origin}/arcade/compte/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/arcade/abonnement/?canceled=1`,
    metadata,
    subscription_data: {
      description: 'Abonnement Rekone',
      metadata,
    },
    integration_identifier: INTEGRATION_ID,
    locale: 'fr',
  };
  let session;
  try {
    session = await stripe.checkout.sessions.create(params);
  } catch (error) {
    const message = String(error?.message || '');
    if (!/integration_identifier|unknown parameter/i.test(message)) throw error;
    delete params.integration_identifier;
    session = await stripe.checkout.sessions.create(params);
  }
  if (!session?.url) return { error: 'Erreur Stripe', status: 500 };
  return { checkoutUrl: session.url };
}

async function createPortal(stripe, email, origin) {
  const clean = cleanEmail(email);
  if (!clean) return { error: 'Email invalide', status: 400 };
  if (!stripe) return { error: 'Paiement non configuré', status: 503 };
  const customers = await stripe.customers.list({ email: clean, limit: 10 });
  for (const customer of customers.data || []) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 20 });
    const live = (subs.data || []).find((sub) => isRekoneSub(sub) && ['active', 'trialing', 'past_due'].includes(sub.status));
    if (!live) continue;
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${origin}/arcade/abonnement/`,
    });
    return { url: session.url };
  }
  return { error: 'Aucun abonnement Rekone', status: 404, code: 'none' };
}

async function cancelRekone(stripe, email) {
  const clean = cleanEmail(email);
  if (!clean) return { error: 'Email invalide', status: 400 };
  if (!stripe) return { error: 'Paiement non configuré', status: 503 };
  const customers = await stripe.customers.list({ email: clean, limit: 10 });
  let cancelled = 0;
  let already = 0;
  let periodEndAt = null;
  for (const customer of customers.data || []) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 20 });
    for (const sub of subs.data || []) {
      if (!isRekoneSub(sub) || !['active', 'trialing', 'past_due'].includes(sub.status)) continue;
      if (sub.cancel_at_period_end) {
        already++;
        periodEndAt = periodEnd(sub);
        continue;
      }
      const updated = await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
        metadata: {
          ...(sub.metadata || {}),
          cancelled_via: 'rekone',
          cancelled_at: new Date().toISOString(),
        },
      });
      cancelled++;
      periodEndAt = periodEnd(updated);
      upsert({
        id: updated.id,
        email: clean,
        status: updated.status,
        cancel_at_period_end: true,
        current_period_end: periodEndAt,
      });
    }
  }
  if (!cancelled && !already) return { error: 'Aucun abonnement Rekone', status: 404, code: 'none' };
  return {
    success: true,
    cancelled,
    already: cancelled === 0 && already > 0,
    period_end: periodEndAt ? new Date(periodEndAt * 1000).toISOString() : null,
  };
}

async function flagSubscription(stripe, id, patch, file) {
  const sub = await subscriptionFromId(stripe, id, file);
  if (!sub) return false;
  upsert({ id: sub.id || id, email: '', ...patch }, file);
  return true;
}

async function applyWebhookEvent(event, { stripe, file = storePath() } = {}) {
  const type = event?.type;
  const object = event?.data?.object || {};
  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    if (object.mode !== 'subscription' || object.metadata?.product !== PRODUCT || object.payment_status !== 'paid') {
      return { updated: false };
    }
    const id = typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
    if (!id) return { updated: false };
    upsert({
      id,
      email: cleanEmail(object.customer_details?.email || object.customer_email),
      venue: object.metadata.venue || '',
      name: object.metadata.customer_name || '',
      status: 'active',
      payment_status: 'paid',
    }, file);
    return { updated: true };
  }
  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    if (!isRekoneSub(object) && !readStore(file).subscriptions[object.id]) return { updated: false };
    upsert({
      id: object.id,
      status: type === 'customer.subscription.deleted' ? 'canceled' : object.status,
      cancel_at_period_end: Boolean(object.cancel_at_period_end),
      current_period_end: periodEnd(object),
    }, file);
    return { updated: true };
  }
  if (type === 'invoice.paid' || type === 'invoice.payment_failed') {
    const id = invoiceSubscriptionId(object);
    const updated = await flagSubscription(stripe, id, {
      status: type === 'invoice.paid' ? 'active' : 'past_due',
      payment_status: type === 'invoice.paid' ? 'paid' : 'failed',
    }, file);
    return { updated };
  }
  if (type === 'charge.dispute.created' || type === 'charge.refunded' || type === 'radar.early_fraud_warning.created') {
    let charge = object;
    if (type === 'radar.early_fraud_warning.created') {
      const chargeId = typeof object.charge === 'string' ? object.charge : object.charge?.id;
      if (!chargeId || !stripe?.charges?.retrieve) return { updated: false };
      charge = await stripe.charges.retrieve(chargeId, { expand: ['invoice'] });
    }
    const id = await chargeSubscriptionId(stripe, charge);
    const patch = type === 'charge.dispute.created'
      ? { dispute: true }
      : type === 'charge.refunded'
        ? { refund: true }
        : { fraud_warning: true };
    return { updated: await flagSubscription(stripe, id, patch, file) };
  }
  return { updated: false };
}

function createWebhookHandler({ getStripe, env = process.env } = {}) {
  return async (req, res) => {
    const secret = webhookSecret(env);
    const stripe = getStripe ? getStripe() : null;
    if (!stripe || !secret) return res.status(503).json({ error: 'Paiement non configuré' });
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), secret);
    } catch (_) {
      return res.status(400).json({ error: 'Signature invalide' });
    }
    try {
      await applyWebhookEvent(event, { stripe, file: storePath(env) });
      return res.json({ received: true });
    } catch (error) {
      console.error('[rekone-billing]', error.message);
      return res.status(500).json({ error: 'Erreur abonnement' });
    }
  };
}

function originFrom(req) {
  const proto = req.headers?.['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers?.['x-forwarded-host'] || req.get?.('host') || req.headers?.host;
  return `${String(proto).split(',')[0]}://${host}`;
}

function mount(app, { getStripe, env = process.env } = {}) {
  const stripeOf = () => (getStripe ? getStripe() : null);

  app.get('/arcade/api/abonnement', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json(await loadOffer(stripeOf(), env));
    } catch (error) {
      console.error('[rekone-billing]', error.message);
      res.status(500).json({ error: 'Erreur abonnement' });
    }
  });

  app.get('/arcade/api/abonnement/session', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const id = String(req.query.session_id || '');
    if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'Session invalide' });
    const stripe = stripeOf();
    if (!stripe) return res.status(503).json({ error: 'Paiement non configuré' });
    try {
      const session = await stripe.checkout.sessions.retrieve(id);
      if (session.metadata?.product !== PRODUCT) return res.status(404).json({ error: 'Session inconnue' });
      res.json({
        paid: session.payment_status === 'paid',
        status: session.status,
        email: session.customer_details?.email || session.customer_email || '',
        amount: session.amount_total,
        currency: session.currency,
      });
    } catch (error) {
      console.error('[rekone-billing]', error.message);
      res.status(404).json({ error: 'Session inconnue' });
    }
  });

  app.post('/arcade/api/abonnement', async (req, res) => {
    try {
      const result = await createCheckout(stripeOf(), req.body || {}, originFrom(req), env);
      if (result.error) return res.status(result.status || 400).json({ error: result.error });
      res.json(result);
    } catch (error) {
      console.error('[rekone-billing]', error.message);
      res.status(500).json({ error: 'Erreur Stripe' });
    }
  });

  app.post('/arcade/api/abonnement/portail', async (req, res) => {
    try {
      const result = await createPortal(stripeOf(), req.body?.email, originFrom(req));
      if (result.error) return res.status(result.status || 400).json({ error: result.error, code: result.code });
      res.json(result);
    } catch (error) {
      console.error('[rekone-billing]', error.message);
      res.status(503).json({ error: 'Le portail Stripe n’est pas disponible. La résiliation reste ouverte.' });
    }
  });

  app.post('/arcade/api/abonnement/resilier', async (req, res) => {
    if (!req.body?.confirm) return res.status(400).json({ error: 'Confirmation requise' });
    try {
      const result = await cancelRekone(stripeOf(), req.body?.email);
      if (result.error) return res.status(result.status || 400).json({ error: result.error, code: result.code });
      res.json(result);
    } catch (error) {
      console.error('[rekone-billing]', error.message);
      res.status(500).json({ error: 'Erreur résiliation' });
    }
  });
}

module.exports = {
  INTEGRATION_ID,
  MERCHANT,
  PRODUCT,
  applyWebhookEvent,
  cancelRekone,
  createCheckout,
  createPortal,
  createWebhookHandler,
  invoiceSubscriptionId,
  isRekoneSub,
  loadOffer,
  mount,
  readStore,
  upsert,
};
