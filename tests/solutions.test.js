const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { solutions, byId, byHref, detailPaths, list } = require('../public/js/solutions');

describe('famille Fidelize', () => {
  it('propose Restau Wheel et CodeSass, et reste extensible', () => {
    assert.equal(byId('restauwheel').name, 'Restau Wheel');
    assert.equal(byId('restauwheel').status, 'live');
    assert.equal(byId('restauwheel').href, '/');
    assert.equal(byId('restauwheel').page, undefined);

    const codesass = byId('codesass');
    assert.equal(codesass.name, 'CodeSass');
    assert.equal(codesass.href, '/codesass');
    assert.equal(codesass.page, 'detail');
    assert.notEqual(codesass.name.toLowerCase(), 'restau wheel');

    const ids = solutions.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of solutions) {
      assert.ok(s.fr.tagline && s.en.tagline);
      assert.ok(s.fr.summary && s.en.summary);
      assert.ok(s.fr.points.length >= 2 && s.en.points.length >= 2);
      assert.match(s.status, /^(live|soon)$/);
    }
    assert.ok(detailPaths().includes('/codesass'));
    assert.equal(detailPaths().includes('/'), false);
    assert.equal(byHref('/codesass').id, 'codesass');
    assert.equal(list().length, solutions.length);
  });

  it('publie la page Fidelize et les routes', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const hub = fs.readFileSync(path.join(__dirname, '../public/fidelize/index.html'), 'utf8');
    const home = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    assert.match(server, /\/fidelize/);
    assert.match(server, /\/api\/solutions/);
    assert.match(server, /detailPaths\(\)/);
    assert.match(hub, /FIDELIZE/);
    assert.match(hub, /Fidelize\.list\(\)/);
    assert.match(home, /href="\/fidelize"/);
  });
});
