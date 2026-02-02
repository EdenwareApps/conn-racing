'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const ConnRacing = require('../conn-racing.cjs');
const { createTestServer } = require('./helpers.cjs');

async function collectResults(racing) {
  const results = [];
  let r;
  while ((r = await racing.next()) !== false) {
    results.push(r);
  }
  return results;
}

describe('ConnRacing (CommonJS)', () => {
  let serverCtx;

  before(async () => {
    serverCtx = await createTestServer();
  });

  after(async () => {
    if (serverCtx) await serverCtx.close();
  });

  it('loads via require() and ConnRacing is a constructor', () => {
    assert.strictEqual(typeof ConnRacing, 'function');
    assert.ok(ConnRacing.prototype);
  });

  it('returns one result for single URL', async () => {
    const url = `${serverCtx.baseUrl}/`;
    const racing = new ConnRacing([url], { retries: 1, timeout: 2000 });
    const results = await collectResults(racing);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].url, url);
    assert.strictEqual(results[0].valid, true);
    assert.strictEqual(results[0].status, 200);
  });
});
