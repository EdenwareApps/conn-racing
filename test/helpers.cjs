'use strict';

const http = require('node:http');
const { once } = require('node:events');

/**
 * Create a local HTTP server for testing ConnRacing.
 * Handles HEAD requests with optional query params: ?delay=ms&status=code
 * @param {Object} [opts]
 * @param {number} [opts.defaultDelay=0] - Default delay in ms before responding
 * @param {number} [opts.defaultStatus=200] - Default status code
 * @returns {Promise<{ server: import('http').Server; baseUrl: string; close: () => Promise<void> }>}
 */
async function createTestServer(opts = {}) {
  const { defaultDelay = 0, defaultStatus = 200 } = opts;
  const server = http.createServer((req, res) => {
    if (req.method !== 'HEAD' && req.method !== 'GET') {
      res.writeHead(405);
      res.end();
      return;
    }
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const delay = Number(url.searchParams.get('delay')) || defaultDelay;
    const status = Number(url.searchParams.get('status')) || defaultStatus;
    res.writeHead(status, { 'Content-Type': 'text/plain' });
    if (delay > 0) {
      setTimeout(() => res.end(), delay);
    } else {
      res.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { address, port } = server.address();
  const baseUrl = `http://${address}:${port}`;
  return {
    server,
    baseUrl,
    async close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { createTestServer };
