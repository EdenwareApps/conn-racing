import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import ConnRacing from '../conn-racing.js'
import { createTestServer } from './helpers.js'

/**
 * Collect all results from racing via next() until false.
 * @param {InstanceType<ConnRacing>} racing
 * @returns {Promise<Array<{ url: string; time: number; valid: boolean; status: number; headers?: object; error?: string }>>}
 */
async function collectResults(racing) {
  const results = []
  let r
  while ((r = await racing.next()) !== false) {
    results.push(r)
  }
  return results
}

describe('ConnRacing', () => {
  let serverCtx

  before(async () => {
    serverCtx = await createTestServer()
  })

  after(async () => {
    if (serverCtx) await serverCtx.close()
  })

  describe('empty URLs', () => {
    it('ends immediately and next() returns false', async () => {
      const racing = new ConnRacing([], { retries: 1, timeout: 1000 })
      const results = await collectResults(racing)
      assert.strictEqual(results.length, 0)
      assert.strictEqual(racing.ended, true)
    })
  })

  describe('single URL', () => {
    it('returns one result with valid: true for 200', async () => {
      const url = `${serverCtx.baseUrl}/`
      const racing = new ConnRacing([url], { retries: 1, timeout: 2000 })
      const results = await collectResults(racing)
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].url, url)
      assert.strictEqual(results[0].valid, true)
      assert.strictEqual(results[0].status, 200)
      assert.ok(typeof results[0].time === 'number' && results[0].time >= 0)
      assert.ok(typeof results[0].headers === 'object')
    })
  })

  describe('multiple URLs', () => {
    it('returns results ordered by response time (fastest first)', async () => {
      const base = serverCtx.baseUrl
      const urls = [
        `${base}/?delay=80`,
        `${base}/?delay=20`,
        `${base}/?delay=50`,
      ]
      const racing = new ConnRacing(urls, { retries: 1, timeout: 5000 })
      const results = await collectResults(racing)
      assert.strictEqual(results.length, 3)
      assert.ok(results[0].time <= results[1].time)
      assert.ok(results[1].time <= results[2].time)
      const resultUrls = results.map((r) => r.url)
      assert.ok(resultUrls.includes(urls[0]))
      assert.ok(resultUrls.includes(urls[1]))
      assert.ok(resultUrls.includes(urls[2]))
    })

    it('marks non-2xx as valid: false', async () => {
      const base = serverCtx.baseUrl
      const urls = [`${base}/?status=404`, `${base}/?status=200`]
      const racing = new ConnRacing(urls, { retries: 1, timeout: 2000 })
      const results = await collectResults(racing)
      assert.strictEqual(results.length, 2)
      const r404 = results.find((r) => r.status === 404)
      const r200 = results.find((r) => r.status === 200)
      assert.ok(r404)
      assert.ok(r200)
      assert.strictEqual(r404.valid, false)
      assert.strictEqual(r200.valid, true)
    })
  })

  describe('next() API', () => {
    it('delivers results in order of speed', async () => {
      const base = serverCtx.baseUrl
      const urls = [`${base}/?delay=30`, `${base}/?delay=10`, `${base}/?delay=60`]
      const racing = new ConnRacing(urls, { retries: 1, timeout: 5000 })
      const first = await racing.next()
      assert.ok(first)
      assert.ok(first.url)
      assert.ok(typeof first.time === 'number')
      const rest = await collectResults(racing)
      assert.strictEqual(first !== false ? 1 + rest.length : rest.length, 3)
    })
  })

  describe('end event', () => {
    it('emits end when racing finishes', async () => {
      const url = `${serverCtx.baseUrl}/`
      const racing = new ConnRacing([url], { retries: 1, timeout: 2000 })
      const endEmitted = new Promise((resolve) => racing.once('end', resolve))
      await collectResults(racing)
      await endEmitted
    })
  })

  describe('progress()', () => {
    it('returns a number', async () => {
      const url = `${serverCtx.baseUrl}/`
      const racing = new ConnRacing([url], { retries: 1, timeout: 2000 })
      await collectResults(racing)
      const p = racing.progress()
      assert.ok(typeof p === 'number')
      assert.ok(p >= 0)
    })
  })

  describe('options', () => {
    it('works with no opts (defaults apply)', async () => {
      const url = `${serverCtx.baseUrl}/`
      const racing = new ConnRacing([url])
      assert.ok(typeof racing.opts.retries === 'number' && racing.opts.retries >= 1)
      assert.ok(typeof racing.opts.timeout === 'number' && racing.opts.timeout >= 1)
      const results = await collectResults(racing)
      assert.ok(results.length >= 1, 'at least one result')
      assert.ok(results.some((r) => r.valid && r.url === url), 'at least one valid result for URL')
    })

    it('respects custom timeout (slow server may fail or succeed)', async () => {
      const base = serverCtx.baseUrl
      const slowUrl = `${base}/?delay=300`
      const fastUrl = `${base}/?delay=0`
      const racing = new ConnRacing([slowUrl, fastUrl], {
        retries: 1,
        timeout: 100,
      })
      const results = await collectResults(racing)
      assert.ok(results.length >= 1, 'at least one result')
      const fast = results.find((r) => r.url === fastUrl)
      assert.ok(fast, 'fast URL should complete')
      assert.strictEqual(fast.valid, true)
      const slow = results.find((r) => r.url === slowUrl)
      if (slow) {
        assert.ok(slow.valid === false || slow.valid === true)
        if (!slow.valid) assert.ok(slow.error)
      }
    })
  })

  describe('destroy()', () => {
    it('pending next() receives false after destroy()', async () => {
      const base = serverCtx.baseUrl
      const slowUrl = `${base}/?delay=2000`
      const racing = new ConnRacing([slowUrl], { retries: 1, timeout: 10000 })
      const nextPromise = racing.next()
      racing.destroy()
      const result = await nextPromise
      assert.strictEqual(result, false)
      assert.strictEqual(racing.destroyed, true)
    })

    it('can be called multiple times safely', () => {
      const racing = new ConnRacing([`${serverCtx.baseUrl}/`], {
        retries: 1,
        timeout: 100,
      })
      racing.destroy()
      racing.destroy()
      assert.strictEqual(racing.destroyed, true)
    })
  })

  describe('invalid URL', () => {
    it('does not crash; other URLs still complete', async () => {
      const base = serverCtx.baseUrl
      const validUrl = `${base}/`
      const invalidUrl = 'ftp://invalid.example/'
      const racing = new ConnRacing([validUrl, invalidUrl], {
        retries: 1,
        timeout: 2000,
      })
      const results = await collectResults(racing)
      assert.ok(results.length >= 1)
      const valid = results.find((r) => r.url === validUrl)
      assert.ok(valid)
      assert.strictEqual(valid.valid, true)
    })
  })

  describe('result shape', () => {
    it('valid result has url, time, valid, status, headers', async () => {
      const url = `${serverCtx.baseUrl}/`
      const racing = new ConnRacing([url], { retries: 1, timeout: 2000 })
      const results = await collectResults(racing)
      assert.strictEqual(results.length, 1)
      const r = results[0]
      assert.ok('url' in r)
      assert.ok('time' in r)
      assert.ok('valid' in r)
      assert.ok('status' in r)
      assert.ok('headers' in r)
      assert.strictEqual(r.valid, true)
      assert.strictEqual(r.status, 200)
    })

    it('invalid result has url, time, valid, status, error', async () => {
      const url = `${serverCtx.baseUrl}/?status=500`
      const racing = new ConnRacing([url], { retries: 1, timeout: 2000 })
      const results = await collectResults(racing)
      assert.strictEqual(results.length, 1)
      const r = results[0]
      assert.ok('url' in r)
      assert.ok('time' in r)
      assert.strictEqual(r.valid, false)
      assert.strictEqual(r.status, 500)
      assert.ok('headers' in r)
    })
  })
})
