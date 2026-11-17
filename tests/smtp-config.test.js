const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeSmtpSecure, isSmtpEnabledValue } = require('../lib/smtp');

describe('SMTP — sécurité', () => {
  it('mappe TLS / SSL / none / auto', () => {
    assert.deepEqual(normalizeSmtpSecure('ssl', 587), { secure: true, requireTLS: false });
    assert.deepEqual(normalizeSmtpSecure('tls', 587), { secure: false, requireTLS: true });
    assert.deepEqual(normalizeSmtpSecure('none', 25), { secure: false, requireTLS: false });
    assert.deepEqual(normalizeSmtpSecure('auto', 465), { secure: true, requireTLS: false });
    assert.deepEqual(normalizeSmtpSecure('auto', 587), { secure: false, requireTLS: false });
  });

  it('interprète l’activation', () => {
    assert.equal(isSmtpEnabledValue('1'), true);
    assert.equal(isSmtpEnabledValue(''), true);
    assert.equal(isSmtpEnabledValue('0'), false);
    assert.equal(isSmtpEnabledValue('false'), false);
  });
});

describe('SMTP — câblage', () => {
  it('persiste les nouvelles clés settings', () => {
    const db = fs.readFileSync(path.join(__dirname, '../database.js'), 'utf8');
    assert.match(db, /smtp_secure/);
    assert.match(db, /smtp_from/);
    assert.match(db, /smtp_from_name/);
    assert.match(db, /smtp_enabled/);
  });

  it('expose GET/PUT smtp complets et le test d’envoi', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(server, /\/api\/superadmin\/smtp/);
    assert.match(server, /\/api\/superadmin\/smtp\/test/);
    assert.match(server, /smtp_secure/);
    assert.match(server, /smtp_from_name/);
    assert.match(server, /smtp_enabled/);
  });

  it('ajoute les champs dans le Super Admin', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/superadmin/index.html'), 'utf8');
    assert.match(html, /id="smtp-enabled"/);
    assert.match(html, /id="smtp-secure"/);
    assert.match(html, /id="smtp-from"/);
    assert.match(html, /id="smtp-from-name"/);
    assert.match(html, /onclick="testSMTP\(\)"/);
  });

  it('respecte smtp_enabled dans le mailer', () => {
    const mailer = fs.readFileSync(path.join(__dirname, '../mailer.js'), 'utf8');
    assert.match(mailer, /isSmtpEnabled/);
    assert.match(mailer, /smtp_from_name/);
    assert.match(mailer, /normalizeSmtpSecure/);
  });
});
