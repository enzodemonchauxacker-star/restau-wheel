const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { restaurantHasOwnSmtp } = require('../lib/smtp');

describe('Admin SMTP — mailer restaurant', () => {
  it('détecte une config SMTP restaurant complète et activée', () => {
    assert.equal(restaurantHasOwnSmtp({
      smtp_enabled: 1,
      smtp_host: 'smtp.example.com',
      smtp_user: 'a@b.com',
      smtp_pass: 'secret',
    }), true);
    assert.equal(restaurantHasOwnSmtp({
      smtp_enabled: 0,
      smtp_host: 'smtp.example.com',
      smtp_user: 'a@b.com',
      smtp_pass: 'secret',
    }), false);
    assert.equal(restaurantHasOwnSmtp({
      smtp_enabled: 1,
      smtp_host: 'smtp.example.com',
      smtp_user: 'a@b.com',
      smtp_pass: '',
    }), false);
  });

  it('passe le restaurant au transporter pour spin et relance', () => {
    const mailer = fs.readFileSync(path.join(__dirname, '../mailer.js'), 'utf8');
    assert.match(mailer, /getTransporter\(restaurant\)/);
    assert.match(mailer, /restaurantHasOwnSmtp/);
    assert.match(mailer, /sendTestEmail\(to, restaurant\)/);
  });
});

describe('Admin SMTP — API & UI', () => {
  it('ajoute les colonnes SMTP restaurant', () => {
    const db = fs.readFileSync(path.join(__dirname, '../database.js'), 'utf8');
    assert.match(db, /smtp_host/);
    assert.match(db, /smtp_secure/);
    assert.match(db, /smtp_from_name/);
    assert.match(db, /smtp_enabled/);
  });

  it('expose GET/PUT/test SMTP admin', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(server, /\/api\/admin\/smtp/);
    assert.match(server, /\/api\/admin\/smtp\/test/);
    assert.match(server, /sendTestEmail\(to, restaurant\)/);
  });

  it('ajoute le formulaire SMTP dans le profil admin', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/admin/index.html'), 'utf8');
    assert.match(html, /id="smtp-host"/);
    assert.match(html, /id="smtp-secure"/);
    assert.match(html, /id="smtp-from"/);
    assert.match(html, /id="smtp-from-name"/);
    assert.match(html, /id="toggle-smtp"/);
    assert.match(html, /data-act="smtp-save"/);
    assert.match(html, /data-act="smtp-test"/);
    assert.match(html, /Relances email/);
  });

  it('câble load/save/test SMTP côté admin JS', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/admin/app.js'), 'utf8');
    assert.match(js, /loadSmtp/);
    assert.match(js, /saveSmtp/);
    assert.match(js, /testSmtp/);
    assert.match(js, /\/api\/admin\/smtp/);
  });
});
