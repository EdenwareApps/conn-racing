var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// conn-racing.js
var conn_racing_exports = {};
__export(conn_racing_exports, {
  default: () => conn_racing_default
});
var import_node_events = require("node:events");
var import_node_http = __toESM(require("node:http"), 1);
var import_node_https = __toESM(require("node:https"), 1);

// node_modules/yocto-queue/index.js
var Node = class {
  value;
  next;
  constructor(value) {
    this.value = value;
  }
};
var Queue = class {
  #head;
  #tail;
  #size;
  constructor() {
    this.clear();
  }
  enqueue(value) {
    const node = new Node(value);
    if (this.#head) {
      this.#tail.next = node;
      this.#tail = node;
    } else {
      this.#head = node;
      this.#tail = node;
    }
    this.#size++;
  }
  dequeue() {
    const current = this.#head;
    if (!current) {
      return;
    }
    this.#head = this.#head.next;
    this.#size--;
    if (!this.#head) {
      this.#tail = void 0;
    }
    return current.value;
  }
  peek() {
    if (!this.#head) {
      return;
    }
    return this.#head.value;
  }
  clear() {
    this.#head = void 0;
    this.#tail = void 0;
    this.#size = 0;
  }
  get size() {
    return this.#size;
  }
  *[Symbol.iterator]() {
    let current = this.#head;
    while (current) {
      yield current.value;
      current = current.next;
    }
  }
  *drain() {
    while (this.#head) {
      yield this.dequeue();
    }
  }
};

// node_modules/p-limit/index.js
function pLimit(concurrency) {
  validateConcurrency(concurrency);
  const queue = new Queue();
  let activeCount = 0;
  const resumeNext = () => {
    if (activeCount < concurrency && queue.size > 0) {
      queue.dequeue()();
      activeCount++;
    }
  };
  const next = () => {
    activeCount--;
    resumeNext();
  };
  const run = async (function_, resolve, arguments_) => {
    const result = (async () => function_(...arguments_))();
    resolve(result);
    try {
      await result;
    } catch {
    }
    next();
  };
  const enqueue = (function_, resolve, arguments_) => {
    new Promise((internalResolve) => {
      queue.enqueue(internalResolve);
    }).then(
      run.bind(void 0, function_, resolve, arguments_)
    );
    (async () => {
      await Promise.resolve();
      if (activeCount < concurrency) {
        resumeNext();
      }
    })();
  };
  const generator = (function_, ...arguments_) => new Promise((resolve) => {
    enqueue(function_, resolve, arguments_);
  });
  Object.defineProperties(generator, {
    activeCount: {
      get: () => activeCount
    },
    pendingCount: {
      get: () => queue.size
    },
    clearQueue: {
      value() {
        queue.clear();
      }
    },
    concurrency: {
      get: () => concurrency,
      set(newConcurrency) {
        validateConcurrency(newConcurrency);
        concurrency = newConcurrency;
        queueMicrotask(() => {
          while (activeCount < concurrency && queue.size > 0) {
            resumeNext();
          }
        });
      }
    }
  });
  return generator;
}
function validateConcurrency(concurrency) {
  if (!((Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY) && concurrency > 0)) {
    throw new TypeError("Expected `concurrency` to be a number from 1 and up");
  }
}

// conn-racing.js
var DEFAULT_USER_AGENT = "ConnRacing/1.0 (Node.js)";
var defaultOpts = { retries: 3, timeout: 5e3 };
var REDIRECT_CODES = [301, 302, 303, 307, 308];
function normalizeTimeout(ms) {
  return typeof ms === "number" && ms < 100 ? ms * 1e3 : ms;
}
var ConnRacing = class extends import_node_events.EventEmitter {
  constructor(urls, opts = {}) {
    super();
    this.urls = [...urls];
    const merged = { ...defaultOpts, ...opts };
    merged.timeout = normalizeTimeout(merged.timeout);
    this.opts = merged;
    this.results = [];
    this.callbacks = [];
    this.activeDownloads = /* @__PURE__ */ new Set();
    this.ended = false;
    this.racingEnded = false;
    this.processedCount = 0;
    this.triggerInterval = opts.triggerInterval || 0;
    this.exitListener = () => this.destroy();
    this.pendingDestroy = false;
    process.on("exit", this.exitListener);
    this.start().catch((err) => console.error(err));
    if (this.exitListener) {
      process.removeListener("exit", this.exitListener);
    }
  }
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async start() {
    if (this.urls.length === 0) {
      return this.end();
    }
    const limit = pLimit(20);
    const succeeded = /* @__PURE__ */ new Set();
    const tasks = this.createDownloadTasks(limit, succeeded);
    await Promise.allSettled(tasks);
    this.racingEnded = true;
    this.end();
  }
  createDownloadTasks(limit, succeeded) {
    const tasks = [];
    for (let attempt = 1; attempt <= this.opts.retries; attempt++) {
      tasks.push(
        ...this.urls.map((url, index) => limit(async () => this.validateUrl(url, index, attempt, succeeded)))
      );
    }
    return tasks;
  }
  async validateUrl(url, index, attempt, succeeded) {
    if (this.ended || succeeded.has(url)) return this.markAsProcessed(url, 200);
    if (!/^https?:\/\//.test(url)) throw new Error("URL not testable");
    if (this.triggerInterval && index > 0) await this.wait(index * this.triggerInterval);
    const start = Date.now() / 1e3;
    const timeoutMs = attempt * this.opts.timeout;
    const controller = new AbortController();
    this.activeDownloads.add(controller);
    let response;
    let error;
    try {
      response = await this.fetchHeadersOnly(url, timeoutMs, controller);
    } catch (err) {
      error = err;
    }
    this.processedCount++;
    this.activeDownloads.delete(controller);
    if (response) {
      return this.handleDownloadResponse(url, response, start, succeeded);
    }
    const result = {
      time: Date.now() / 1e3 - start,
      url,
      valid: false,
      status: error?.statusCode ?? error?.response?.statusCode ?? null,
      error: error?.message || "REQUEST_FAILED"
    };
    this.results.push(result);
    this.results.sort((a, b) => a.time - b.time);
    this.pump();
    return result.status;
  }
  fetchHeadersOnly(url, timeoutMs, controller, redirectCount = 0) {
    const maxRedirects = 10;
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? import_node_https.default : import_node_http.default;
    const userAgent = this.opts.userAgent ?? DEFAULT_USER_AGENT;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          controller.abort();
        } catch (_) {
        }
        reject(Object.assign(new Error("Request timeout"), { code: "ETIMEDOUT" }));
      }, timeoutMs);
      const req = mod.request(url, {
        method: "GET",
        headers: {
          "Range": "bytes=0-0",
          "Connection": "close",
          "User-Agent": userAgent
        },
        signal: controller.signal
      }, (res) => {
        clearTimeout(timeout);
        res.destroy();
        const status = res.statusCode;
        if (REDIRECT_CODES.includes(status) && redirectCount < maxRedirects) {
          const rawLoc = res.headers?.location ?? res.headers?.["location"];
          const loc = typeof rawLoc === "string" ? rawLoc.trim() : Array.isArray(rawLoc) ? rawLoc[0]?.trim() : "";
          if (loc) {
            try {
              const nextUrl = /^https?:\/\//i.test(loc) ? loc : new URL(loc, url).href;
              return this.fetchHeadersOnly(nextUrl, timeoutMs, controller, redirectCount + 1).then(resolve).catch(reject);
            } catch (_) {
            }
          }
        }
        resolve({ statusCode: status, headers: res.headers || {} });
      });
      req.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      req.end();
    });
  }
  handleDownloadResponse(url, response, start, succeeded) {
    const statusCode = response.statusCode;
    const isValid = statusCode >= 200 && statusCode < 300 || statusCode === 416;
    const result = {
      time: Date.now() / 1e3 - start,
      url,
      valid: isValid,
      status: statusCode,
      headers: response.headers || {}
    };
    this.results.push(result);
    this.results.sort((a, b) => a.time - b.time);
    if (isValid) succeeded.add(url);
    this.pump();
    return statusCode;
  }
  markAsProcessed(url, statusCode) {
    this.processedCount++;
    this.pump();
    return statusCode;
  }
  pump() {
    if (this.destroyed) return;
    while (this.results.length && this.callbacks.length) {
      const callback = this.callbacks.shift();
      const result = this.results.shift();
      callback(result);
    }
    if (this.pendingDestroy && this.results.length === 0 && this.callbacks.length === 0) {
      this.finalize();
    }
    if (this.ended || this.racingEnded && this.results.length === 0) {
      this.ended = true;
      this.callbacks.forEach((callback) => callback(false));
      this.callbacks = [];
    }
  }
  next() {
    return new Promise((resolve) => {
      if (this.results.length > 0) {
        return resolve(this.results.shift());
      }
      this.callbacks.push(resolve);
      this.pump();
      if (this.ended) resolve(false);
    });
  }
  end() {
    if (!this.ended) {
      this.ended = true;
      this.pump();
      this.emit("end");
      if (this.results.length === 0 && this.callbacks.length === 0) {
        this.finalize();
      } else {
        this.pendingDestroy = true;
      }
    }
  }
  progress() {
    return this.processedCount / this.urls.length * 100;
  }
  cancelActiveDownloads() {
    if (!this.activeDownloads?.size) return;
    for (const controller of this.activeDownloads) {
      try {
        controller?.abort?.();
      } catch (err) {
        console.warn("Failed to cancel request:", err?.message || err);
      }
    }
    this.activeDownloads.clear();
  }
  finalize() {
    if (this.destroyed) return;
    this.pendingDestroy = false;
    this.cancelActiveDownloads();
    this.callbacks = [];
    this.results = [];
    this.destroyed = true;
    if (this.exitListener) {
      process.removeListener("exit", this.exitListener);
      this.exitListener = null;
    }
    this.removeAllListeners();
  }
  destroy() {
    if (this.destroyed) return;
    this.pendingDestroy = false;
    this.ended = true;
    this.cancelActiveDownloads();
    this.callbacks.forEach((callback) => callback(false));
    this.callbacks = [];
    this.results = [];
    this.destroyed = true;
    if (this.exitListener) {
      process.removeListener("exit", this.exitListener);
      this.exitListener = null;
    }
    this.removeAllListeners();
  }
};
var conn_racing_default = ConnRacing;
module.exports = conn_racing_default;
module.exports.default = conn_racing_default;
