const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  newAffiliateCode,
  normalizeAffiliateCode,
  buildAffiliateRegisterUrl,
} = require('../lib/affiliates');

describe('affiliés — helpers', () => {
  it('normalise le code affilié', () => {
    assert.equal(normalizeAffiliateCode('  AbC-12_x  '), 'abc-12_x');
    assert.equal(normalizeAffiliateCode('foo@bar!'), 'foobar');
    assert.equal(normalizeAffiliateCode(''), '');
  });

  it('génère un code hex court', () => {
    const a = newAffiliateCode();
    const b = newAffiliateCode();
    assert.match(a, /^[0-9a-f]{8}$/);
    assert.match(b, /^[0-9a-f]{8}$/);
    assert.notEqual(a, b);
  });

  it('construit le lien d’inscription affilié', () => {
    assert.equal(
      buildAffiliateRegisterUrl('https://restauwheel.com/', 'Camille01'),
      'https://restauwheel.com/register?ref=camille01'
    );
    assert.equal(buildAffiliateRegisterUrl('', 'x'), '');
    assert.equal(buildAffiliateRegisterUrl('https://restauwheel.com', ''), '');
  });
});

describe('affiliés — câblage serveur / UI', () => {
  it('expose les routes super-admin et l’attribution à l’inscription', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(server, /\/api\/superadmin\/affiliates/);
    assert.match(server, /\/api\/superadmin\/affiliates\/conversions/);
    assert.match(server, /\/api\/affiliate\/:code/);
    assert.match(server, /affiliate_id/);
    assert.match(server, /INSERT INTO restaurants \(name, email, password, public_code, affiliate_id\)/);
  });

  it('persist la table affiliates et la colonne restaurant', () => {
    const db = fs.readFileSync(path.join(__dirname, '../database.js'), 'utf8');
    assert.match(db, /CREATE TABLE IF NOT EXISTS affiliates/);
    assert.match(db, /ADD COLUMN IF NOT EXISTS affiliate_id/);
  });

  it('ajoute la page Affiliés dans le super-admin', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/superadmin/index.html'), 'utf8');
    assert.match(html, /data-page="affiliates"/);
    assert.match(html, /id="page-affiliates"/);
    assert.match(html, /loadAffiliatesPage/);
    assert.match(html, /copyAffiliateLink/);
  });

  it('passe le ref affilié depuis l’inscription vers le checkout', () => {
    const reg = fs.readFileSync(path.join(__dirname, '../public/register/index.html'), 'utf8');
    const chk = fs.readFileSync(path.join(__dirname, '../public/checkout/index.html'), 'utf8');
    assert.match(reg, /affiliateRef/);
    assert.match(reg, /payload\.ref/);
    assert.match(reg, /checkout\?email=/);
    assert.match(chk, /payload\.ref = ref/);
  });
});
