const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@127.0.0.1:5432/restau';
process.env.VERCEL = '1';

const app = require('../server');

function get(host, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method: 'GET', headers: { host } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

let server;

describe('hôte rekone.si', () => {
  before(() => new Promise((resolve) => { server = app.listen(0, resolve); }));
  after(() => new Promise((resolve) => server.close(resolve)));

  it('sert Rekone sur rekone.si et www.rekone.si', async () => {
    for (const host of ['rekone.si', 'www.rekone.si', 'www.rekone.si:443']) {
      const res = await get(host, '/');
      assert.equal(res.status, 200);
      assert.match(res.body, /Rekone — La solution des salles de jeux/);
    }
  });

  it('sert Rekone quand seul x-forwarded-host porte le domaine', async () => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: server.address().port,
        path: '/',
        method: 'GET',
        headers: { host: 'restau-wheel-main.vercel.app', 'x-forwarded-host': 'www.rekone.si' },
      }, (incoming) => {
        const chunks = [];
        incoming.on('data', (c) => chunks.push(c));
        incoming.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('error', reject);
      req.end();
    });
    assert.match(res, /Rekone — La solution des salles de jeux/);
  });

  it('laisse Restau Wheel sur restauwheel.com', async () => {
    const res = await get('restauwheel.com', '/');
    assert.equal(res.status, 200);
    assert.match(res.body, /Restau Wheel — Fidélisation par la chance/);
    assert.doesNotMatch(res.body, /Rekone — La solution des salles de jeux/);
  });
});
