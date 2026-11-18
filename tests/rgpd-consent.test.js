const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function acceptsConsent(value) {
  return value === true || value === 1 || value === 'true' || value === '1' || value === 'on';
}

describe('RGPD wheel consent', () => {
  it('accepte uniquement un consentement explicite', () => {
    assert.equal(acceptsConsent(true), true);
    assert.equal(acceptsConsent('true'), true);
    assert.equal(acceptsConsent(1), true);
    assert.equal(acceptsConsent(false), false);
    assert.equal(acceptsConsent(undefined), false);
    assert.equal(acceptsConsent(''), false);
    assert.equal(acceptsConsent('yes'), false);
  });

  it('expose la case à cocher et le lien privacy côté client', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/client/index.html'), 'utf8');
    assert.match(html, /id="privacy_consent"/);
    assert.match(html, /client\.consent/);
    assert.match(html, /\/mentions#privacy/);
    assert.match(html, /base clients|guest database/i);
  });

  it('rejette le spin sans consentement côté serveur', () => {
    const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(src, /privacy_consent_required/);
    assert.match(src, /privacy_consent_at/);
  });
});
