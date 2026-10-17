const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  cleanBaseUrl,
  chunk,
  companyPayload,
  personPayload,
  phonePayload,
  dedupeCustomers,
  createdRecords,
} = require('../lib/twenty');

describe('URLs Twenty', () => {
  it('garde l’origine http(s) et refuse le reste', () => {
    assert.equal(cleanBaseUrl('http://localhost:3020/rest/people'), 'http://localhost:3020');
    assert.equal(cleanBaseUrl('https://api.twenty.com'), 'https://api.twenty.com');
    assert.equal(cleanBaseUrl(''), '');
    assert.equal(cleanBaseUrl('ftp://twenty.local'), null);
    assert.equal(cleanBaseUrl('pas une url'), null);
  });
});

describe('payloads Twenty', () => {
  it('découpe par paquets de 60', () => {
    assert.equal(chunk([1, 2, 3], 2).length, 2);
    assert.deepEqual(chunk([1, 2, 3], 2)[1], [3]);
  });

  it('prépare une société et une personne rattachée', () => {
    assert.deepEqual(companyPayload({ name: 'Le Zinc' }), { name: 'Le Zinc' });
    const person = personPayload({
      first_name: 'Camille',
      last_name: 'Martin',
      email: 'Camille@Ex.fr',
      phone: '06 11 11 11 11',
    }, 'company-1');
    assert.equal(person.emails.primaryEmail, 'camille@ex.fr');
    assert.equal(person.phones.primaryPhoneCallingCode, '+33');
    assert.equal(person.phones.primaryPhoneNumber, '0611111111');
    assert.equal(person.companyId, 'company-1');
    assert.equal(phonePayload('+1 202 555 0100'), null);
  });

  it('ignore un e-mail déjà vu', () => {
    const { unique, skipped } = dedupeCustomers([
      { email: 'a@ex.fr' },
      { email: 'A@ex.fr' },
      { email: '' },
    ]);
    assert.equal(unique.length, 1);
    assert.equal(skipped, 2);
  });

  it('lit les ids renvoyés par le batch', () => {
    const rows = createdRecords({ data: { createPeople: [{ id: 'p1' }] } }, 'people');
    assert.equal(rows[0].id, 'p1');
    assert.deepEqual(createdRecords({}, 'companies'), []);
  });
});

describe('intégration super-admin', () => {
  it('branche Twenty dans le super-admin, pas dans le dashboard restaurant', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const sa = fs.readFileSync(path.join(__dirname, '../public/superadmin/index.html'), 'utf8');
    const admin = fs.readFileSync(path.join(__dirname, '../public/admin/index.html'), 'utf8');
    assert.match(server, /\/api\/superadmin\/twenty\/sync/);
    assert.match(sa, /id="twenty-frame"/);
    assert.doesNotMatch(admin, /twenty-frame|\/api\/admin\/twenty/);
  });
});
