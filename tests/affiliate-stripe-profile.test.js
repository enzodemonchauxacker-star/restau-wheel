const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  escapeStripeSearchValue,
  stripeSignupName,
  buildAffiliateStripeQueries,
  listStripeSignupsForAffiliate,
} = require('../lib/affiliate-stripe');

describe('profil affilié — helpers Stripe', () => {
  it('échappe les valeurs de recherche Stripe', () => {
    assert.equal(escapeStripeSearchValue("a'b\\c"), "a\\'b\\\\c");
  });

  it('choisit le meilleur nom affiché', () => {
    assert.equal(stripeSignupName({ customer_name: 'Ada', email: 'a@b.c' }), 'Ada');
    assert.equal(stripeSignupName({ email: 'a@b.c' }), 'a@b.c');
    assert.equal(stripeSignupName({}), '');
  });

  it('construit les requêtes metadata', () => {
    assert.deepEqual(
      buildAffiliateStripeQueries({ id: 3, code: 'abc12' }),
      ["metadata['affiliate_code']:'abc12'", "metadata['affiliate_id']:'3'"]
    );
  });

  it('mode démo sans client Stripe', async () => {
    const r = await listStripeSignupsForAffiliate(null, { id: 1, code: 'x' });
    assert.equal(r.demo, true);
    assert.deepEqual(r.signups, []);
  });

  it('agrège search subscription + checkout', async () => {
    const stripe = {
      subscriptions: {
        search: async () => ({
          data: [{
            id: 'sub_1',
            status: 'active',
            created: 1700000000,
            metadata: { customer_name: 'Camille Resto', affiliate_code: 'aa' },
            customer: { email: 'camille@resto.fr', name: 'Camille Resto' },
          }],
          has_more: false,
        }),
        list: async () => ({ data: [] }),
      },
      checkout: {
        sessions: {
          search: async () => ({
            data: [{
              id: 'cs_1',
              status: 'complete',
              created: 1700000100,
              customer_details: { name: 'Hugo Bistrot', email: 'hugo@bistrot.fr' },
              metadata: { affiliate_code: 'aa' },
              subscription: 'sub_2',
            }],
            has_more: false,
          }),
        },
      },
    };
    const r = await listStripeSignupsForAffiliate(stripe, { id: 1, code: 'aa' });
    assert.equal(r.demo, false);
    assert.equal(r.signups.length, 2);
    assert.ok(r.signups.some((s) => s.name === 'Camille Resto'));
    assert.ok(r.signups.some((s) => s.name === 'Hugo Bistrot'));
    assert.ok(r.contracts >= 1);
  });
});

describe('profil affilié — câblage', () => {
  it('expose GET /api/superadmin/affiliates/:id', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(server, /\/api\/superadmin\/affiliates\/:id/);
    assert.match(server, /listStripeSignupsForAffiliate/);
    assert.match(server, /contracts_count/);
  });

  it('ajoute le panneau profil dans le Super Admin affiliés', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/superadmin/index.html'), 'utf8');
    assert.match(html, /id="aff-profile"/);
    assert.match(html, /openAffiliateProfile/);
    assert.match(html, /aff-profile-contracts/);
    assert.match(html, /aff-profile-stripe-tbody/);
  });
});
