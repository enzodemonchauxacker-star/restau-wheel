const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { solutions, byId, detailPaths, list } = require('../public/js/solutions');

describe('famille Fidelize', () => {
  it('ne montre que Restau Wheel, vers restauwheel.com', () => {
    assert.equal(solutions.length, 1);
    const wheel = byId('restauwheel');
    assert.equal(wheel.name, 'Restau Wheel');
    assert.equal(wheel.status, 'live');
    assert.equal(wheel.href, 'https://restauwheel.com');
    assert.equal(byId('codesass'), null);
    assert.deepEqual(detailPaths(), []);
    assert.equal(list()[0].id, 'restauwheel');
    const names = JSON.stringify(solutions);
    assert.equal(names.toLowerCase().includes('codesass'), false);
    assert.equal(names.toLowerCase().includes('bowling'), false);
    assert.equal(names.toLowerCase().includes('laser'), false);
    assert.equal(names.toLowerCase().includes('karting'), false);
  });

  it('affiche Fidelize sans super-admin et retire la page vidéo', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const home = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const hub = fs.readFileSync(path.join(__dirname, '../views/fidelize/index.html'), 'utf8');

    assert.match(server, /p === '\/video' \|\| p\.startsWith\('\/video\/'\)/);
    assert.doesNotMatch(server, /public', 'video', 'index\.html'/);
    assert.match(server, /VERCEL_ENV === 'preview' && p === '\/'/);
    assert.match(server, /p === '\/fidelize'/);
    assert.doesNotMatch(server, /fidelize[\s\S]{0,180}isSuperAdmin/);
    assert.equal(fs.existsSync(path.join(__dirname, '../public/video/index.html')), false);
    assert.equal(fs.existsSync(path.join(__dirname, '../public/fidelize/index.html')), false);

    assert.doesNotMatch(home, /href="\/video"/);
    assert.doesNotMatch(home, /href="\/fidelize"/);
    assert.doesNotMatch(hub, /CodeSass|bowling|laser|karting|Bientôt|Coming soon|fid\.more|fid\.status\.soon/i);
    assert.match(hub, /\/css\/fidelize\.css/);
    assert.doesNotMatch(hub, /theme\.css/);
    assert.match(hub, /ScrollTrigger\.min\.js/);

    const motion = fs.readFileSync(path.join(__dirname, '../public/js/fidelize.js'), 'utf8');
    const skin = fs.readFileSync(path.join(__dirname, '../public/css/fidelize.css'), 'utf8');
    assert.match(motion, /gsap\.registerPlugin\(ScrollTrigger\)/);
    assert.match(motion, /prefers-reduced-motion/);
    assert.match(motion, /scrub:\s*0\.5/);
    assert.match(motion, /lerp:\s*0\.1/);
    assert.match(hub, /Ouvrir Restau Wheel/);
    assert.match(hub, /lenis\.min\.js/);
    assert.match(skin, /#e8ff95/i);
    assert.match(skin, /#fff8f1/i);
    assert.equal(fs.existsSync(path.join(__dirname, '../public/vendor/lenis/lenis.min.js')), true);
    assert.doesNotMatch(hub + motion + skin, /CodeSass|bowling|laser game|karting|Bientôt|Coming soon|fid\.status\.soon/i);
    assert.equal(fs.existsSync(path.join(__dirname, '../public/vendor/gsap/gsap.min.js')), true);
    assert.equal(fs.existsSync(path.join(__dirname, '../public/vendor/gsap/ScrollTrigger.min.js')), true);
  });
});
