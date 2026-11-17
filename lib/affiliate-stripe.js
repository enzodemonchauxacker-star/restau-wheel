'use strict';

function escapeStripeSearchValue(raw) {
  return String(raw || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function stripeSignupName(parts) {
  const candidates = [
    parts?.customer_name,
    parts?.name,
    parts?.metadata_name,
    parts?.email,
  ].map((v) => String(v || '').trim()).filter(Boolean);
  return candidates[0] || '';
}

function buildAffiliateStripeQueries(affiliate) {
  const code = escapeStripeSearchValue(affiliate?.code);
  const id = String(affiliate?.id || '').trim();
  const queries = [];
  if (code) {
    queries.push(`metadata['affiliate_code']:'${code}'`);
  }
  if (id && /^\d+$/.test(id)) {
    queries.push(`metadata['affiliate_id']:'${id}'`);
  }
  return queries;
}

/**
 * Récupère les inscriptions Stripe liées à un affilié (metadata checkout / subscription).
 * @param {import('stripe').Stripe | null} stripe
 * @param {{ id: number|string, code: string }} affiliate
 */
async function listStripeSignupsForAffiliate(stripe, affiliate) {
  if (!stripe) {
    return { demo: true, configured: false, signups: [], contracts: 0 };
  }

  const queries = buildAffiliateStripeQueries(affiliate);
  if (!queries.length) {
    return { demo: false, configured: true, signups: [], contracts: 0 };
  }

  const byKey = new Map();

  const upsert = (row) => {
    const email = String(row.email || '').trim().toLowerCase();
    const key = email || row.subscription_id || row.session_id || row.name;
    if (!key) return;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      return;
    }
    // Prefer live subscription over session-only
    const rank = (r) => (r.subscription_id ? 2 : 0) + (r.status === 'active' || r.status === 'trialing' ? 1 : 0);
    if (rank(row) >= rank(prev)) byKey.set(key, { ...prev, ...row });
  };

  for (const q of queries) {
    try {
      let startingAfter;
      for (let page = 0; page < 5; page++) {
        const res = await stripe.subscriptions.search({
          query: q,
          limit: 100,
          expand: ['data.customer'],
          ...(startingAfter ? { page: startingAfter } : {}),
        });
        for (const sub of res.data || []) {
          const customer = typeof sub.customer === 'object' && sub.customer ? sub.customer : null;
          const email = customer?.email || sub.metadata?.customer_email || '';
          const name = stripeSignupName({
            customer_name: customer?.name,
            metadata_name: sub.metadata?.customer_name || sub.metadata?.affiliate_customer_name,
            email,
          });
          upsert({
            name,
            email,
            status: sub.status,
            subscription_id: sub.id,
            created_at: sub.created ? new Date(sub.created * 1000).toISOString() : null,
            source: 'subscription',
          });
        }
        if (!res.has_more || !res.next_page) break;
        startingAfter = res.next_page;
      }
    } catch (e) {
      // Search API indisponible → fallback list limité
      console.warn('[affiliate-stripe] subscriptions.search', e.message);
    }

    try {
      let startingAfter;
      for (let page = 0; page < 5; page++) {
        const res = await stripe.checkout.sessions.search({
          query: `${q} AND status:'complete'`,
          limit: 100,
          ...(startingAfter ? { page: startingAfter } : {}),
        });
        for (const session of res.data || []) {
          const email = session.customer_details?.email || session.customer_email || '';
          const name = stripeSignupName({
            customer_name: session.customer_details?.name,
            metadata_name: session.metadata?.customer_name,
            email,
          });
          upsert({
            name,
            email,
            status: session.status,
            session_id: session.id,
            subscription_id: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null,
            created_at: session.created ? new Date(session.created * 1000).toISOString() : null,
            source: 'checkout',
          });
        }
        if (!res.has_more || !res.next_page) break;
        startingAfter = res.next_page;
      }
    } catch (e) {
      console.warn('[affiliate-stripe] sessions.search', e.message);
    }
  }

  // Fallback si search n’a rien donné : scan des abonnements récents (limité)
  if (!byKey.size) {
    try {
      const subs = await stripe.subscriptions.list({
        status: 'all',
        limit: 100,
        expand: ['data.customer'],
      });
      const code = String(affiliate.code || '').toLowerCase();
      const id = String(affiliate.id || '');
      for (const sub of subs.data || []) {
        const meta = sub.metadata || {};
        if (String(meta.affiliate_code || '').toLowerCase() !== code && String(meta.affiliate_id || '') !== id) {
          continue;
        }
        const customer = typeof sub.customer === 'object' && sub.customer ? sub.customer : null;
        const email = customer?.email || '';
        upsert({
          name: stripeSignupName({
            customer_name: customer?.name,
            metadata_name: meta.customer_name,
            email,
          }),
          email,
          status: sub.status,
          subscription_id: sub.id,
          created_at: sub.created ? new Date(sub.created * 1000).toISOString() : null,
          source: 'subscription',
        });
      }
    } catch (e) {
      console.warn('[affiliate-stripe] subscriptions.list', e.message);
    }
  }

  const signups = [...byKey.values()]
    .map((s) => ({
      ...s,
      name: s.name || s.email || '—',
    }))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  const live = signups.filter((s) => ['active', 'trialing', 'past_due', 'complete'].includes(s.status));
  return {
    demo: false,
    configured: true,
    signups,
    contracts: live.length || signups.length,
  };
}

module.exports = {
  escapeStripeSearchValue,
  stripeSignupName,
  buildAffiliateStripeQueries,
  listStripeSignupsForAffiliate,
};
