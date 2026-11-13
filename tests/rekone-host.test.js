'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('server.js détecte rekone.si / www.rekone.si', () => {
  assert.match(serverSrc, /function isRekoneHost/);
  assert.match(serverSrc, /rekone\.si/);
  assert.match(serverSrc, /www\.rekone\.si/);
});

test('la racine Rekone sert arcade/index.html, pas Restau Wheel', () => {
  assert.match(serverSrc, /public',\s*'arcade',\s*'index\.html'/);
  const rootHandler = serverSrc.slice(serverSrc.indexOf("app.get('/',"), serverSrc.indexOf('runReminderJob'));
  assert.match(rootHandler, /isRekoneHost/);
  assert.match(rootHandler, /arcade/);
  assert.ok(rootHandler.indexOf('isRekoneHost') < rootHandler.indexOf('isPhoneUserAgent'));
});
