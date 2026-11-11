const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const billing = require('../lib/rekone-billing');

function tempEnv() {
  const file = path.join(os.tmpdir(), 'rekone-bill-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.json');
  return { REKONE_BILLING_FILE: file, STRIPE_PRICE_ID: 'price_rekone', STRIPE_REKONE_WEBHOOK_SECRET: 'whsec_test' };
}

test('checkout sends the Stripe price without collecting a card', async () => {
  const env = tempEnv();
  let params;
  const stripe = { checkout: { sessions: { async create(body) { params = body; return { url: 'https://checkout.stripe.test/c' }; } } } };
  const result = await billing.createCheckout(stripe, { email: 'Salle@Rekone.si', name: 'Camille Dupont', venue: 'Salle Nord' }, 'https://rekone.si', env);
  assert.equal(result.checkoutUrl, 'https://checkout.stripe.test/c');
  assert.equal(params.mode, 'subscription');
  assert.equal(params.customer_email, 'salle@rekone.si');
  assert.equal(params.line_items[0].price, 'price_rekone');
  assert.equal(params.metadata.product, 'rekone');
  assert.equal(params.subscription_data.metadata.venue, 'Salle Nord');
  assert.equal(params.integration_identifier, billing.INTEGRATION_ID);
  assert.equal(params.success_url, 'https://rekone.si/arcade/compte/?session_id={CHECKOUT_SESSION_ID}');
  assert.equal(params.payment_method_types, undefined);
  assert.equal(Object.hasOwn(params, 'payment_method_types'), false);
});

test('checkout rejects an incomplete salle and a missing Stripe price', async () => {
  const env = tempEnv();
  const stripe = { checkout: { sessions: { async create() { throw new Error('should not'); } } } };
  const missing = await billing.createCheckout(stripe, { email: 'a@b.fr', name: 'A', venue: '' }, 'https://rekone.si', env);
  assert.equal(missing.status, 400);
  delete env.STRIPE_PRICE_ID;
  const offline = await billing.createCheckout(stripe, { email: 'a@b.fr', name: 'A', venue: 'Salle' }, 'https://rekone.si', env);
  assert.equal(offline.status, 503);
});

test('offer and merchant identity come from the Stripe price', async () => {
  const env = tempEnv();
  const stripe = { prices: { async retrieve(id) {
    assert.equal(id, 'price_rekone');
    return { unit_amount: 2000, currency: 'eur', recurring: { interval: 'month' }, product: { name: 'Restau Wheel Pro' } };
  } } };
  const offer = await billing.loadOffer(stripe, env);
  assert.equal(offer.amount, 2000);
  assert.equal(offer.productName, 'Restau Wheel Pro');
  assert.equal(offer.legal.siret, '106 921 182 00015');
  assert.equal(offer.legal.email, 'contact@restauwheel.com');
  assert.equal(offer.legal.payments, 'Stripe');
});

test('cancellation stops only the Rekone subscription', async () => {
  const updated = [];
  const stripe = {
    customers: { async list() { return { data: [{ id: 'cus_1' }] }; } },
    subscriptions: {
      async list() { return { data: [
        { id: 'sub_rw', status: 'active', metadata: {}, cancel_at_period_end: false },
        { id: 'sub_rekone', status: 'active', metadata: { product: 'rekone' }, cancel_at_period_end: false, current_period_end: 1800000000 },
      ] }; },
      async update(id, body) { updated.push({ id, body }); return { id, status: 'active', current_period_end: 1800000000, metadata: body.metadata }; },
    },
  };
  const env = tempEnv();
  process.env.REKONE_BILLING_FILE = env.REKONE_BILLING_FILE;
  const result = await billing.cancelRekone(stripe, 'Salle@Rekone.si');
  delete process.env.REKONE_BILLING_FILE;
  assert.equal(result.cancelled, 1);
  assert.deepEqual(updated.map((item) => item.id), ['sub_rekone']);
  assert.equal(updated[0].body.cancel_at_period_end, true);
  fs.rmSync(env.REKONE_BILLING_FILE, { force: true });
});

test('webhook records a paid Rekone checkout and ignores other products', async () => {
  const env = tempEnv();
  const paid = {
    type: 'checkout.session.completed',
    data: { object: {
      id: 'cs_123', mode: 'subscription', payment_status: 'paid', subscription: 'sub_123',
      customer_email: 'Salle@Rekone.si', metadata: { product: 'rekone', venue: 'Salle Nord', customer_name: 'Camille' },
    } },
  };
  await billing.applyWebhookEvent(paid, { file: env.REKONE_BILLING_FILE });
  const other = structuredClone(paid);
  other.data.object.metadata.product = 'restau';
  other.data.object.subscription = 'sub_other';
  const ignored = await billing.applyWebhookEvent(other, { file: env.REKONE_BILLING_FILE });
  assert.equal(ignored.updated, false);
  const unpaid = structuredClone(paid);
  unpaid.data.object.payment_status = 'unpaid';
  unpaid.data.object.subscription = 'sub_unpaid';
  await billing.applyWebhookEvent(unpaid, { file: env.REKONE_BILLING_FILE });
  const stored = billing.readStore(env.REKONE_BILLING_FILE);
  assert.equal(stored.subscriptions.sub_123.email, 'salle@rekone.si');
  assert.equal(stored.subscriptions.sub_123.status, 'active');
  assert.equal(stored.subscriptions.sub_other, undefined);
  assert.equal(stored.subscriptions.sub_unpaid, undefined);
  fs.rmSync(env.REKONE_BILLING_FILE, { force: true });
});

test('webhook follows a dispute back to the Rekone subscription', async () => {
  const env = tempEnv();
  billing.upsert({ id: 'sub_123', email: 'salle@rekone.si', status: 'active' }, env.REKONE_BILLING_FILE);
  const stripe = { invoices: { async retrieve() { return { subscription: 'sub_123' }; } } };
  const event = { type: 'charge.dispute.created', data: { object: { id: 'ch_1', invoice: 'in_1' } } };
  const result = await billing.applyWebhookEvent(event, { stripe, file: env.REKONE_BILLING_FILE });
  assert.equal(result.updated, true);
  assert.equal(billing.readStore(env.REKONE_BILLING_FILE).subscriptions.sub_123.dispute, true);
  fs.rmSync(env.REKONE_BILLING_FILE, { force: true });
});

test('signed webhook rejects a bad signature before writing', async () => {
  const env = tempEnv();
  const stripe = require('stripe')('sk_test_local_only');
  const payload = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', data: { object: {} } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });
  const handler = billing.createWebhookHandler({ getStripe: () => stripe, env });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ body: Buffer.from(payload + ' '), get() { return signature; } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(fs.existsSync(env.REKONE_BILLING_FILE), false);
});

test('Rekone pages show the merchant identity and no card field', () => {
  const subscribe = fs.readFileSync(path.join(__dirname, '../public/arcade/abonnement/index.html'), 'utf8');
  const cancel = fs.readFileSync(path.join(__dirname, '../public/arcade/resiliation/index.html'), 'utf8');
  const landing = fs.readFileSync(path.join(__dirname, '../public/arcade/index.html'), 'utf8');
  for (const marker of ['106 921 182 00015', 'QuoteSaas', 'contact@restauwheel.com', '33 C Avenue des Messeguières', 'name="venue"', 'Continuer vers Stripe']) {
    assert.equal(subscribe.includes(marker), true, marker);
  }
  assert.equal(subscribe.includes('cc-number'), false);
  assert.equal(subscribe.includes('autocomplete="cc-'), false);
  assert.equal(cancel.includes('/arcade/api/abonnement/resilier'), true);
  assert.equal(landing.includes('id="abonnement"'), true);
  assert.equal(landing.includes('/arcade/abonnement/'), true);
});
