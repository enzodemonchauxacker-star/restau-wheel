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
    assert.match(page, /\/reikon\/theme\.css/);
    const theme = fs.readFileSync(path.join(__dirname, '../public/reikon/theme.css'), 'utf8');
    assert.match(theme, /#fff8f1/);
    assert.match(theme, /#e8ff95/);
    assert.match(theme, /#3b3b3b/);
    assert.match(theme, /#1f8a5b/);
    assert.match(theme, /#c43648/);
    const script = fs.readFileSync(path.join(__dirname, '../public/reikon/app.js'), 'utf8');
    assert.doesNotMatch(script, /#ffd60a|#ff2d6a|#00e5c8/);
  });
});
