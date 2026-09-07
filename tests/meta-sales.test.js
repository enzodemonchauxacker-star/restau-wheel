const { test } = require('node:test');
const assert = require('node:assert/strict');
const { purchase, checkoutMetadata, createHandler } = require('../lib/meta-sales');
function event() { return { type: 'checkout.session.completed', created: 1800000000, livemode: true, data: { object: { id: 'cs_test', subscription: 'sub_test', mode: 'subscription', payment_status: 'paid', currency: 'eur', amount_total: 2000, customer_email: ' TEST@example.com ', metadata: { rw_ads_consent: 'granted' } } } }; }
function harness(e = event()) {
  const delivered = new Set(); let calls = 0; let fail = false; let busy = false; let rejectSignature = false; let payload;
  const env = { STRIPE_META_WEBHOOK_SECRET: 'test', META_CAPI_ACCESS_TOKEN: 'test', META_GRAPH_API_VERSION: 'v24.0' };
  const handler = createHandler({ env,
    getStripe: () => ({ webhooks: { constructEvent(body, signature, secret) { assert.ok(Buffer.isBuffer(body)); assert.equal(secret, 'test'); if (rejectSignature) throw Error(); return e; } } }),
    store: { async claim(id) { return delivered.has(id) ? 'sent' : busy ? 'busy' : 'claimed'; }, async finish(id) { delivered.add(id); }, async release() {} },
    fetchImpl: async (url, options) => { calls++; payload = JSON.parse(options.body); if (fail) throw Error(); return { ok: true, json: async () => ({ events_received: 1 }) }; }
  });
  return { env, set fail(v) { fail = v; }, set busy(v) { busy = v; }, set rejectSignature(v) { rejectSignature = v; }, get calls() { return calls; }, get payload() { return payload; },
    async run() { const res = { code: 200, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } }; await handler({ body: Buffer.from('{}'), get() { return 'signature'; } }, res); return res; }
  };
}
test('confirmed first payment uses actual amount and hashed email', () => { const p = purchase(event()); assert.equal(p.custom_data.value, 20); assert.equal(p.user_data.em[0].length, 64); assert.ok(!JSON.stringify(p).includes('example.com')); });
test('renewals, refused, unpaid, zero, no consent and other currencies ignored', () => {
  const renewal = event(); renewal.type = 'invoice.paid'; assert.equal(purchase(renewal), null);
  for (const changes of [{ payment_status: 'unpaid' }, { amount_total: 0 }, { metadata: {} }, { currency: 'usd' }, { mode: 'payment' }]) { const e = event(); Object.assign(e.data.object, changes); assert.equal(purchase(e), null); }
});
test('delayed successful payment uses same stable ID', () => { const e = event(); const first = purchase(e); e.type = 'checkout.session.async_payment_succeeded'; assert.equal(purchase(e).event_id, first.event_id); });
test('consent must be explicit and identifiers are bounded', () => { assert.deepEqual(checkoutMetadata({ consent: 'true' }), {}); assert.deepEqual(checkoutMetadata({}), {}); const m = checkoutMetadata({ consent: true, fbc: 'bad', fbp: 'fb.1.1800000000000.123' }); assert.equal(m.rw_fbc, undefined); assert.equal(m.rw_fbp, 'fb.1.1800000000000.123'); });
test('duplicate notifications send once', async () => { const h = harness(); assert.equal((await h.run()).code, 200); await h.run(); assert.equal(h.calls, 1); });
test('invalid signature rejects before delivery', async () => { const h = harness(); h.rejectSignature = true; assert.equal((await h.run()).code, 400); assert.equal(h.calls, 0); });
test('Meta failure retries with stable event ID', async () => { const h = harness(); h.fail = true; assert.equal((await h.run()).code, 503); const id = h.payload.data[0].event_id; h.fail = false; assert.equal((await h.run()).code, 200); assert.equal(h.payload.data[0].event_id, id); });
test('concurrent delivery requests retry', async () => { const h = harness(); h.busy = true; assert.equal((await h.run()).code, 503); assert.equal(h.calls, 0); });
test('missing configuration fails for paid events without acknowledging delivery', async () => { const h = harness(); delete h.env.META_CAPI_ACCESS_TOKEN; assert.equal((await h.run()).code, 503); assert.equal(h.calls, 0); });
test('test Stripe payments do not contaminate live reporting', async () => { const e = event(); e.livemode = false; const h = harness(e); await h.run(); assert.equal(h.calls, 0); h.env.META_TEST_EVENT_CODE = 'TEST'; await h.run(); assert.equal(h.payload.test_event_code, 'TEST'); });
test('official Stripe SDK verifies raw signed bodies and rejects tampering', async () => {
  const stripe = require('stripe')('sk_test_local_only');
  const payload = JSON.stringify(event());
  const secret = 'whsec_local_test_only';
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  let sends = 0;
  const handler = createHandler({ getStripe: () => stripe,
    env: { STRIPE_META_WEBHOOK_SECRET: secret, META_CAPI_ACCESS_TOKEN: 'local', META_GRAPH_API_VERSION: 'v24.0' },
    store: { async claim() { return 'claimed'; }, async finish() {}, async release() {} },
    fetchImpl: async () => { sends++; return { ok: true, json: async () => ({ events_received: 1 }) }; }
  });
  async function send(body) { const res = { code: 200, status(c) { this.code = c; return this; }, json() { return this; } }; await handler({ body: Buffer.from(body), get() { return signature; } }, res); return res.code; }
  assert.equal(await send(payload), 200);
  assert.equal(await send(payload.replace('2000', '9000')), 400);
  assert.equal(sends, 1);
});
