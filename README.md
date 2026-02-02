# conn-racing

High-performance connection testing and racing: test multiple URLs in parallel to find the fastest and most reliable connection.

**[Edenware](https://edenware.app)** · **GitHub:** [EdenwareApps/conn-racing](https://github.com/EdenwareApps/conn-racing) · **npm:** [@edenware/conn-racing](https://www.npmjs.com/package/@edenware/conn-racing)

## Install

```bash
npm install @edenware/conn-racing
```

## Features

- **Parallel testing** – Multiple URLs tested concurrently (HEAD requests)
- **Connection racing** – Results ordered by response time (fastest first)
- **Automatic retry** – Configurable retries per URL
- **Performance metrics** – Response times and status per URL
- **Streaming results** – Consume results as they arrive via `next()` or events
- **Cancellation** – Abort in-flight requests with `destroy()`

## Usage

### ESM

```javascript
import ConnRacing from '@edenware/conn-racing';

const racing = new ConnRacing(
  [
    'https://server1.com/stream',
    'https://server2.com/stream',
    'https://server3.com/stream',
  ],
  { retries: 3, timeout: 5000 }
);

// Consume results (fastest first)
let result;
while ((result = await racing.next()) !== false) {
  console.log(result.url, result.time, result.valid, result.status);
}

// Or wait for all to finish and use events
racing.on('end', () => {
  console.log('Racing finished');
});
```

### CommonJS

```javascript
const ConnRacing = require('@edenware/conn-racing');

const racing = new ConnRacing(
  ['https://server1.com/stream', 'https://server2.com/stream'],
  { retries: 3, timeout: 5000 }
);

let result;
while ((result = await racing.next()) !== false) {
  console.log(result.url, result.time, result.valid, result.status);
}
```

The package supports both ESM and CommonJS via conditional exports.

### Options

| Option             | Default | Description                          |
| ------------------ | ------- | ------------------------------------ |
| `retries`          | `3`     | Number of attempts per URL           |
| `timeout`          | `5000`  | Timeout per attempt (ms)             |
| `triggerInterval`  | `0`     | Delay before each URL (ms)           |

### Result shape

- `url` – Requested URL  
- `time` – Response time in seconds  
- `valid` – `true` if status 2xx  
- `status` – HTTP status code  
- `headers` – Response headers (when valid)  
- `error` – Error message (when invalid)

## Testing

```bash
npm test
```

Uses Node.js built-in test runner (`node --test`). Tests use a local HTTP server to simulate fast/slow/failing URLs and cover: empty URLs, single/multiple URLs, `next()` API, `end` event, `destroy()`, options (timeout, retries), invalid URLs, and result shape.

## License

MIT · [Edenware](https://edenware.app)
