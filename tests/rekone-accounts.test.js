const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const accounts = require('../lib/rekone-accounts');

function store() {
  const file = path.join(os.tmpdir(), 'rekone-accounts-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.json');
  return accounts.fileStore(file);
}

test('un compte se crée avec email, salle et mot de passe, puis se connecte', async () => {
  const saved = store();
  const created = await accounts.register(saved, {
    email: 'Salle@Rekone.si',
    password: 'motdepasse',
    name: 'Camille Dupont',
    venue: 'Salle Nord',
    stripeSessionId: 'cs_test_123',
  });
  assert.equal(created.account.email, 'salle@rekone.si');
  assert.equal(created.account.venue, 'Salle Nord');
  assert.equal(created.account.password_hash, undefined);
  const login = await accounts.authenticate(saved, { email: 'salle@rekone.si', password: 'motdepasse' });
  assert.equal(login.account.name, 'Camille Dupont');
  const wrong = await accounts.authenticate(saved, { email: 'salle@rekone.si', password: 'mauvais' });
  assert.equal(wrong.status, 401);
});

test('le mot de passe court et le doublon sont refusés', async () => {
  const saved = store();
  const short = await accounts.register(saved, { email: 'a@b.fr', password: 'court', name: 'A', venue: 'Salle' });
  assert.equal(short.status, 400);
  await accounts.register(saved, { email: 'a@b.fr', password: 'motdepasse', name: 'A', venue: 'Salle' });
  const again = await accounts.register(saved, { email: 'a@b.fr', password: 'autremotdepasse', name: 'B', venue: 'Autre' });
  assert.equal(again.status, 409);
});

test('la redirection après connexion reste dans Rekone', () => {
  assert.equal(accounts.safeNext('/arcade/dashboard/'), '/arcade/dashboard/');
  assert.equal(accounts.safeNext('https://example.com'), '/arcade/dashboard/');
});

test('les pages de compte existent', () => {
  const compte = fs.readFileSync(path.join(__dirname, '../public/arcade/compte/index.html'), 'utf8');
  const login = fs.readFileSync(path.join(__dirname, '../public/arcade/connexion/index.html'), 'utf8');
  assert.match(compte, /Créer le compte/);
  assert.match(compte, /Mot de passe/);
  assert.match(login, /Se connecter/);
  assert.match(login, /type="password"/);
});
