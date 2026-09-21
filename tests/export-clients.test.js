const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('export clients CSV', () => {
  it('expose la route et le bouton admin', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.match(server, /\/api\/admin\/customers\/export/);
    assert.match(server, /clients-restauwheel-/);
    assert.match(server, /\\\\uFEFF|\\uFEFF/);

    const admin = fs.readFileSync(path.join(__dirname, '../public/admin/index.html'), 'utf8');
    assert.match(admin, /exportClientsCsv/);
    assert.match(admin, /admin\.clients\.export/);
  });
});
