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
const bowl3d = fs.readFileSync(path.join(root, 'public/arcade/fid/js/bowl-3d.js'), 'utf8');

test('bowling est en perspective canvas, plus de piste SVG rose', () => {
  assert.match(indexHtml, /id="bowl-canvas"/);
  assert.match(indexHtml, /bowl-3d\.js/);
  assert.match(bowl3d, /project\(/);
  assert.match(bowl3d, /#fff8f1/);
  assert.match(bowl3d, /#e8ff95/);
  const bowlChunk = indexHtml.slice(indexHtml.indexOf('id="game-bowl"'), indexHtml.indexOf('id="game-laser"'));
  assert.equal(bowlChunk.includes('alley-art'), false);
  assert.equal(bowlChunk.includes('#e45cb8'), false);
});

test('quille Three.js branchée (GLB + pin-stage)', () => {
  assert.match(indexHtml, /pin-stage\.js/);
  assert.match(indexHtml, /data-pin/);
  assert.match(indexHtml, /three\.module\.js/);
  assert.ok(fs.existsSync(path.join(root, 'public/arcade/strike-pin.glb')));
  assert.ok(fs.existsSync(path.join(root, 'public/arcade/pin-stage.js')));
  assert.match(previewHtml, /pin-stage\.js/);
  assert.match(previewHtml, /version 3D/);
});

test('pince encre + lime et feuille Reikon', () => {
  const claw = indexHtml.slice(
    indexHtml.indexOf('class="claw-mech"'),
    indexHtml.indexOf('</svg>', indexHtml.indexOf('class="claw-mech"'))
  );
  assert.match(claw, /#e8ff95/);
  assert.equal(claw.includes('#e23d3d'), false);
  assert.match(gamesCss, /lane-3d/);
  assert.match(jouerHtml, /bowl-3d\.js/);
});
