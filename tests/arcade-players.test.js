const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const storeFile = path.join(os.tmpdir(), 'arcade-players-' + process.pid + '.json');
process.env.ARCADE_PLAYERS_FILE = storeFile;

const players = require('../lib/arcade-players');

const valid = {
  first: 'Léa',
  last: 'Martin',
  email: 'lea.martin@email.fr',
  phone: '06 12 44 18 03',
  game: 'bowling',
  consent: true,
};

describe('joueurs Arcade', () => {
  beforeEach(() => {
    fs.rmSync(storeFile, { force: true });
  });
  afterEach(() => {
    fs.rmSync(storeFile, { force: true });
  });

  it('refuse une fiche sans consentement', () => {
    assert.equal(players.acceptsConsent(false), false);
    assert.equal(players.acceptsConsent(undefined), false);
    assert.deepEqual(players.create({ ...valid, consent: false }).error, 'consent_required');
    assert.equal(players.list().length, 0);
  });

  it('enregistre le joueur et le lot de la partie', () => {
    const created = players.create(valid);
    assert.equal(created.player.consent, true);
    assert.equal(created.player.prize, 'Partie en cours');
    assert.equal(created.player.game, 'bowling');
    const done = players.finish(created.player.id, { prize: 'Partie offerte', win: true });
    assert.equal(done.player.prize, 'Partie offerte');
    assert.equal(done.player.win, true);
    assert.equal(done.player.status, 'pending');
  });

  it('refuse un e-mail ou un jeu invalide', () => {
    assert.equal(players.create({ ...valid, email: 'lea' }).error, 'invalid_player');
    assert.equal(players.create({ ...valid, game: 'roulette' }).error, 'invalid_player');
    assert.equal(players.create({ ...valid, phone: '12' }).error, 'invalid_player');
  });

  it('demande la case RGPD sur la page de jeu', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/arcade/jouer/index.html'), 'utf8');
    assert.match(html, /id="privacy_consent"/);
    assert.match(html, /id="gate-form"/);
    assert.match(html, /RGPD/);
    assert.doesNotMatch(html, /id="privacy_consent"[^>]*checked/);
    assert.match(html, /name="first"/);
    assert.match(html, /name="last"/);
    assert.match(html, /type="email"/);
    assert.match(html, /type="tel"/);
    assert.match(html, /id="result-again"/);
    assert.match(html, /@keyframes game-leave/);
    assert.match(html, /Gagné/);
    assert.match(html, /Perdu/);
  });
});
