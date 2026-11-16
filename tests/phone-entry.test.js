const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const { isPhoneUserAgent } = require('../lib/phone');

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const googlebot = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

describe('ouverture téléphone', () => {
  it('détecte les téléphones sans bloquer tablettes ni robots', () => {
    assert.equal(isPhoneUserAgent(iphone), true);
    assert.equal(isPhoneUserAgent(android), true);
    assert.equal(isPhoneUserAgent(desktop), false);
    assert.equal(isPhoneUserAgent(ipad), false);
    assert.equal(isPhoneUserAgent(googlebot), false);
    assert.equal(isPhoneUserAgent(''), false);
  });

  it('garde la landing (vidéo) sur / pour tout le monde', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const home = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, '../public/admin/app.js'), 'utf8');
    assert.doesNotMatch(server, /isPhoneUserAgent\(req\.headers\['user-agent'\]\)/);
    assert.doesNotMatch(server, /redirect\(302, '\/admin\?intro=1'\)/);
    assert.doesNotMatch(home, /phone-gate/);
    assert.doesNotMatch(home, /location\.replace\('\/admin\?intro=1'\)/);
    assert.match(home, /restau_wheel_explainer\.mp4/);
    assert.match(app, /get\('intro'\) === '1'/);
    assert.match(app, /if \(intro \|\| !done\) showOnboarding\(\)/);
  });
});
