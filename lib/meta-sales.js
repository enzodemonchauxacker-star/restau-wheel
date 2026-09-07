'use strict';
const crypto = require('node:crypto');
const PIXEL = '1674081597383551';
function checkoutMetadata(ads) {
  if (ads?.consent !== true) return {};
  const result = { rw_ads_consent: 'granted', rw_ads_consent_at: String(Date.now()) };
  for (const key of ['fbp', 'fbc']) {
    if (typeof ads[key] === 'string' && /^fb\.\d\.\d{13}\.[A-Za-z0-9_.-]{1,300}$/.test(ads[key])) result['rw_' + key] = ads[key];
  }
  return result;
}
function purchase(event) {
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return null;
  const s = event.data.object;
  if (s.mode !== 'subscription' || s.payment_status !== 'paid' || !s.subscription ||
      s.metadata?.rw_ads_consent !== 'granted' || s.currency !== 'eur' ||
      !Number.isSafeInteger(s.amount_total) || s.amount_total <= 0) return null;
  const email = (s.customer_details?.email || s.customer_email || '').trim().toLowerCase();
  if (!email) return null;
  const user_data = { em: [crypto.createHash('sha256').update(email).digest('hex')] };
  for (const key of ['fbp', 'fbc']) if (s.metadata['rw_' + key]) user_data[key] = s.metadata['rw_' + key];
  return { event_name: 'Purchase', event_id: 'rw_checkout_' + s.id, event_time: event.created,
    action_source: 'website', event_source_url: 'https://restauwheel.com/checkout', user_data,
    custom_data: { currency: 'EUR', value: s.amount_total / 100 } };
}
function sqlStore(db) {
  return {
    async claim(id) {
      await db.prepare(`CREATE TABLE IF NOT EXISTS meta_sales_delivery (
        id TEXT PRIMARY KEY, sent BOOLEAN NOT NULL DEFAULT FALSE, locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`).run();
      const claimed = await db.prepare(`INSERT INTO meta_sales_delivery (id) VALUES (?)
        ON CONFLICT (id) DO UPDATE SET locked_at = NOW()
        WHERE meta_sales_delivery.sent = FALSE AND meta_sales_delivery.locked_at < NOW() - INTERVAL '2 minutes'
        RETURNING id`).get(id);
      if (claimed) return 'claimed';
      const row = await db.prepare('SELECT sent FROM meta_sales_delivery WHERE id = ?').get(id);
      return row?.sent ? 'sent' : 'busy';
    },
    async finish(id) { await db.prepare('UPDATE meta_sales_delivery SET sent = TRUE WHERE id = ?').run(id); },
    async release(id) { await db.prepare("UPDATE meta_sales_delivery SET locked_at = NOW() - INTERVAL '3 minutes' WHERE id = ? AND sent = FALSE").run(id); }
  };
}
function createHandler({ getStripe, store, env = process.env, fetchImpl = fetch }) {
  return async (req, res) => {
    if (!getStripe() || !env.STRIPE_META_WEBHOOK_SECRET) return res.status(503).json({ error: 'Tracking not configured' });
    let event;
    try { event = getStripe().webhooks.constructEvent(req.body, req.get('stripe-signature'), env.STRIPE_META_WEBHOOK_SECRET); }
    catch (_) { return res.status(400).json({ error: 'Invalid signature' }); }
    const data = purchase(event);
    if (!data) return res.json({ received: true });
    // Test Stripe events must never reach the production advertising dataset.
    if (!event.livemode && !env.META_TEST_EVENT_CODE) return res.json({ received: true });
    if (!env.META_CAPI_ACCESS_TOKEN || !/^v\d+\.0$/.test(env.META_GRAPH_API_VERSION || ''))
      return res.status(503).json({ error: 'Tracking not configured' });
    let claimed = false;
    try {
      const state = await store.claim(data.event_id);
      if (state === 'sent') return res.json({ received: true });
      if (state !== 'claimed') return res.status(503).json({ error: 'Retry later' });
      claimed = true;
      const body = { data: [data], access_token: env.META_CAPI_ACCESS_TOKEN };
      if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;
      const response = await fetchImpl(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${PIXEL}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
      });
      const result = await response.json();
      if (!response.ok || result.events_received !== 1) throw new Error('Meta delivery failed');
      await store.finish(data.event_id);
      return res.json({ received: true });
    } catch (_) {
      if (claimed) { try { await store.release(data.event_id); } catch (_) {} }
      return res.status(503).json({ error: 'Retry later' });
    }
  };
}
module.exports = { checkoutMetadata, purchase, sqlStore, createHandler };
