'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'public/arcade/index.html'), 'utf8');
const gamesCss = fs.readFileSync(path.join(root, 'public/arcade/fid/css/games-reikon.css'), 'utf8');
const jouerHtml = fs.readFileSync(path.join(root, 'public/arcade/jouer/index.html'), 'utf8');
const previewHtml = fs.readFileSync(path.join(root, 'public/arcade/preview-jeux.html'), 'utf8');

test('la piste bowling n’utilise plus le rose/violet arcade', () => {
  const alley = indexHtml.slice(
    indexHtml.indexOf('<svg class="alley-art"'),
    indexHtml.indexOf('</svg>', indexHtml.indexOf('<svg class="alley-art"'))
  );
  assert.match(alley, /#fff8f1/);
  assert.match(alley, /ball-play/);
  assert.equal((alley.match(/class="bowl-pin"/g) || []).length, 10);
  for (const forbidden of ['#e45cb8', '#ff3b98', '#6c28c8', 'ball-pink', '#d060ff']) {
    assert.equal(alley.includes(forbidden), false, forbidden);
  }
});

test('la pince est encre + articulation lime, sans rouge cartoon', () => {
  const claw = indexHtml.slice(
    indexHtml.indexOf('class="claw-mech"'),
    indexHtml.indexOf('</svg>', indexHtml.indexOf('class="claw-mech"'))
  );
  assert.match(claw, /#e8ff95/);
  assert.match(claw, /#3b3b3b/);
  assert.equal(claw.includes('#e23d3d'), false);
  assert.equal(claw.includes('#e23d3d'), false);
  const gift = indexHtml.slice(
    indexHtml.indexOf('id="claw-gift"'),
    indexHtml.indexOf('</span>', indexHtml.indexOf('id="claw-gift"'))
  );
  assert.equal(gift.includes('sack-dollar'), false);
});

test('feuille de style Reikon et page jouer branchées', () => {
  assert.match(indexHtml, /games-reikon\.css/);
  assert.match(jouerHtml, /games-reikon\.css/);
  assert.match(jouerHtml, />R<\/a>/);
  assert.match(gamesCss, /#fff8f1/);
  assert.match(gamesCss, /#e8ff95/);
  assert.match(previewHtml, /game-bowl/);
  assert.match(previewHtml, /game-claw/);
});
