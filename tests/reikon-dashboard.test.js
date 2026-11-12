const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('dashboard Reikon', () => {
  it('reprend les mêmes onglets que l’admin', () => {
    const page = fs.readFileSync(path.join(__dirname, '../public/reikon/index.html'), 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(server, /app\.get\('\/reikon'/);
    assert.match(page, /Bonjour,/);
    assert.match(page, />PRO</);
    assert.match(page, /data-tab="home"/);
    assert.match(page, />Accueil</);
    assert.match(page, />Clients</);
    assert.match(page, />Roue</);
    assert.match(page, />QR</);
    assert.match(page, />Profil</);
    assert.match(page, /Reikon Pro/);
    assert.match(page, /\/admin\/app\.css/);
  });
});
