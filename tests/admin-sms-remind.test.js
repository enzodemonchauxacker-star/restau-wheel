const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { telHref } = require('../public/admin/app.js');

describe('Admin relances téléphone', () => {
  it('construit un lien tel: depuis un numéro FR ou E.164', () => {
    assert.equal(telHref('06 12 34 56 78'), 'tel:+33612345678');
    assert.equal(telHref('+33612345678'), 'tel:+33612345678');
    assert.equal(telHref('0033612345678'), 'tel:+33612345678');
    assert.equal(telHref(''), '');
    assert.equal(telHref('abc'), '');
  });

  it('ajoute la colonne sms_reminders', () => {
    const db = fs.readFileSync(path.join(__dirname, '../database.js'), 'utf8');
    assert.match(db, /sms_reminders/);
  });

  it('expose l’API de relance SMS manuelle et le toggle', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(server, /\/api\/admin\/spins\/:id\/remind-sms/);
    assert.match(server, /sms_reminders/);
    assert.match(server, /sms_available/);
    assert.match(server, /!Number\(restaurant\.sms_reminders\)/);
  });

  it('ajoute le toggle SMS et les actions fiche client', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/admin/index.html'), 'utf8');
    assert.match(html, /data-act="sms-remind"/);
    assert.match(html, /id="toggle-sms-remind"/);

    const js = fs.readFileSync(path.join(__dirname, '../public/admin/app.js'), 'utf8');
    assert.match(js, /remindSms/);
    assert.match(js, /telHref/);
    assert.match(js, /Relancer par SMS/);
    assert.match(js, /Appeler/);
    assert.match(js, /sms_reminders/);
  });
});
