import { EventEmitter } from 'node:events'
import needle from 'needle'
import pLimit from 'p-limit'

const defaultOpts = { retries: 3, timeout: 5000 }

class ConnRacing extends EventEmitter {
    constructor(urls, opts = {}) {
        super()
        this.urls = [...urls]
        this.opts = { ...defaultOpts, ...opts }
        this.results = []
        this.callbacks = []
        this.activeDownloads = new Set()
        this.ended = false
        this.racingEnded = false
        this.processedCount = 0
        this.triggerInterval = opts.triggerInterval || 0
        this.exitListener = () => this.destroy()
        this.pendingDestroy = false
        process.on('exit', this.exitListener)
        this.start().catch(err => console.error(err))
        if (this.exitListener) {
            process.removeListener('exit', this.exitListener)
        }
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    async start() {
        if (this.urls.length === 0) {
            return this.end()
        }

        const limit = pLimit(20)
        const succeeded = new Set()
        const tasks = this.createDownloadTasks(limit, succeeded)

        await Promise.allSettled(tasks)
        this.racingEnded = true
        this.end()
    }

    createDownloadTasks(limit, succeeded) {
        const tasks = []
        for (let attempt = 1; attempt <= this.opts.retries; attempt++) {
            tasks.push(
                ...this.urls.map((url, index) => limit(async () => this.validateUrl(url, index, attempt, succeeded)))
            )
        }
        return tasks
    }

    async validateUrl(url, index, attempt, succeeded) {
        if (this.ended || succeeded.has(url)) return this.markAsProcessed(url, 200)
        if (!/^https?:\/\//.test(url)) throw new Error('URL not testable')
        if (this.triggerInterval && index > 0) await this.wait(index * this.triggerInterval)

        const start = Date.now() / 1000
        const timeoutMs = attempt * this.opts.timeout
        const controller = new AbortController()
        const request = needle('head', url, {
            timeout: timeoutMs,
            follow_max: 10,
            signal: controller.signal,
        })
        this.activeDownloads.add(controller)

        let response
        let error
        try {
            response = await request
        } catch (err) {
            error = err
        }

        this.processedCount++
        if (response && response.statusCode !== undefined) {
            this.activeDownloads.delete(controller)
            return this.handleDownloadResponse(url, response, start, succeeded)
        }

        const result = {
            time: Date.now() / 1000 - start,
            url,
            valid: false,
            status: error?.statusCode || error?.status || error?.response?.status || null,
            error: error?.message || 'REQUEST_FAILED'
        }

        this.results.push(result)
        this.results.sort((a, b) => a.time - b.time)
        this.activeDownloads.delete(controller)
        this.pump()
        return result.status
    }

    handleDownloadResponse(url, response, start, succeeded) {
        const statusCode = response.statusCode
        const isValid = statusCode >= 200 && statusCode < 300
        const result = {
            time: Date.now() / 1000 - start,
            url,
            valid: isValid,
            status: statusCode,
            headers: response.headers || {},
        }

        this.results.push(result)
        this.results.sort((a, b) => a.time - b.time)
        if (isValid) succeeded.add(url)

        this.pump()
        return statusCode
    }

    markAsProcessed(url, statusCode) {
        this.processedCount++
        this.pump()
        return statusCode
    }

    pump() {
        if (this.destroyed) return

        while (this.results.length && this.callbacks.length) {
            const callback = this.callbacks.shift()
            const result = this.results.shift()
            callback(result)
        }

        if (this.pendingDestroy && this.results.length === 0 && this.callbacks.length === 0) {
            this.finalize()
        }

        if (this.ended || (this.racingEnded && this.results.length === 0)) {
            this.ended = true
            this.callbacks.forEach(callback => callback(false))
            this.callbacks = []
        }
    }

    next() {
        return new Promise(resolve => {
            if (this.results.length > 0) {
                return resolve(this.results.shift())
            }

            this.callbacks.push(resolve)
            this.pump()

            if (this.ended) resolve(false)
        })
    }

    end() {
        if (!this.ended) {
            this.ended = true
            this.pump()
            this.emit('end')
            if (this.results.length === 0 && this.callbacks.length === 0) {
                this.finalize()
            } else {
                this.pendingDestroy = true
            }
        }
    }

    progress() {
        return (this.processedCount / this.urls.length) * 100
    }

    cancelActiveDownloads() {
        if (!this.activeDownloads?.size) return
        for (const controller of this.activeDownloads) {
            try {
                controller?.abort?.()
            } catch (err) {
                console.warn('Failed to cancel request:', err?.message || err)
            }
        }
        this.activeDownloads.clear()
    }

    finalize() {
        if (this.destroyed) return
        this.pendingDestroy = false
        this.cancelActiveDownloads()
        this.callbacks = []
        this.results = []
        this.destroyed = true
        if (this.exitListener) {
            process.removeListener('exit', this.exitListener)
            this.exitListener = null
        }
        this.removeAllListeners()
    }

    destroy() {
        if (this.destroyed) return
        this.pendingDestroy = false
        this.ended = true
        this.cancelActiveDownloads()
        this.callbacks.forEach(callback => callback(false))
        this.callbacks = []
        this.results = []
        this.destroyed = true
        if (this.exitListener) {
            process.removeListener('exit', this.exitListener)
            this.exitListener = null
        }
        this.removeAllListeners()
    }
}

export default ConnRacing