const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rewardForThrow, cleanGift, hashArcadeCode } = require('../lib/arcade');

describe('Piste', () => {
  it('donne toujours le cadeau configuré, sans regarder les quilles', () => {
    const gift = { label: 'Soda géant', detail: 'Au bar de la salle.' };
    assert.deepEqual(rewardForThrow(gift), { label: 'Soda géant', detail: 'Au bar de la salle.' });
    assert.deepEqual(rewardForThrow(gift), rewardForThrow(gift));
    assert.equal(cleanGift({ label: '   ', detail: 'x' }), null);
    assert.equal(hashArcadeCode('piste'), hashArcadeCode('piste'));
    assert.notEqual(hashArcadeCode('piste'), hashArcadeCode('autre'));
  });

  it('reste un site à part, sans lien vers Fidelize ni Restau Wheel', () => {
    const root = path.join(__dirname, '..');
    const play = fs.readFileSync(path.join(root, 'views/arcade/play.html'), 'utf8');
    const desk = fs.readFileSync(path.join(root, 'views/arcade/reglage.html'), 'utf8');
    const game = fs.readFileSync(path.join(root, 'public/js/arcade-game.js'), 'utf8');
    const skin = fs.readFileSync(path.join(root, 'public/css/arcade.css'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    const home = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    const hub = fs.readFileSync(path.join(root, 'views/fidelize/index.html'), 'utf8');
    const bundle = play + desk + game + skin;

    assert.match(server, /app\.get\('\/arcade'/);
    assert.match(server, /app\.get\('\/arcade\/reglage'/);
    assert.match(game, /gift\.label/);
    assert.match(game, /showReward\(count\)/);
    assert.doesNotMatch(game, /if\s*\([^)]*pins/);
    assert.doesNotMatch(bundle, /fidelize|restau wheel|restauwheel|theme\.css|fidelize\.css/i);
    assert.doesNotMatch(home, /href="\/arcade"/);
    assert.doesNotMatch(hub, /href="\/arcade"|Piste/);
    assert.match(play, /\/css\/arcade\.css/);
  });
});
