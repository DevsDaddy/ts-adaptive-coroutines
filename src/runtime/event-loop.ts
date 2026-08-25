/**
 * TypeScript Coroutines Event Loop Implementation
 *
 * This code provides an abstraction over the
 * JavaScript event loop, allowing the coroutine library:
 * 1) Yield to main: give control to the main thread to
 * avoid blocking it for a long time.
 * 2) Schedule tasks into microtasks and macrotasks.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import { nowMs } from "../utils/time";

/* Event loop types */
export type YieldFn = () => Promise<void>;
export type ScheduleFn = (cb: () => void) => void;
export type CancelScheduleFn = (id: unknown) => void;

/**
 * Event loop adapter
 */
export interface EventLoopAdapter {
    yieldToMain(): Promise<void>;

    scheduleMicrotask(cb: () => void): void;

    scheduleMacrotask(cb: () => void): unknown;

    cancelMacrotask(id: unknown): void;

    now(): number;
}

/**
 * Detect Yield Function
 */
function detectYieldFn(): YieldFn {
    try {
        const g = globalThis as unknown as Record<string, unknown>;
        const sched = g["scheduler"] as Record<string, unknown> | undefined;
        if (sched && typeof sched["yield"] === "function") {
            return () => (sched["yield"] as () => Promise<void>).call(sched);
        }
        if (sched && typeof sched["postTask"] === "function") {
            return () =>
                (sched["postTask"] as (cb: () => void, opts: unknown) => Promise<void>)(() => {
                }, {priority: "user-blocking"});
        }
    } catch {
    }
    if (typeof MessageChannel !== "undefined") {
        try {
            const ch = new MessageChannel();
            const queue: Array<() => void> = [];
            ch.port1.onmessage = () => {
                const cb = queue.shift();
                if (cb) cb();
            };
            if (typeof ch.port1.start === "function") ch.port1.start();
            return () =>
                new Promise<void>((resolve) => {
                    queue.push(resolve);
                    ch.port2.postMessage(null as unknown as undefined);
                });
        } catch {
        }
    }
    if (typeof setImmediate !== "undefined") {
        return () => new Promise<void>((resolve) => (setImmediate as (cb: () => void) => unknown)(resolve));
    }
    return () => new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// Cached yield
let cachedYield: YieldFn | undefined;

/**
 * Get yield function
 */
export function getYieldFn(): YieldFn {
    if (!cachedYield) cachedYield = detectYieldFn();
    return cachedYield;
}

/**
 * Reset yield cache
 */
export function resetYieldCache(): void {
    cachedYield = undefined;
}

/**
 * Default Event Loop Adapter
 */
export class DefaultEventLoopAdapter implements EventLoopAdapter {
    private yieldFn: YieldFn;

    /**
     * Create default event loop adapter
     */
    constructor() {
        this.yieldFn = getYieldFn();
    }

    /**
     * Yield to main thread
     */
    public yieldToMain(): Promise<void> {
        return this.yieldFn();
    }

    /**
     * Schedule microtask
     * @param cb
     */
    public scheduleMicrotask(cb: () => void): void {
        if (typeof queueMicrotask === "function") queueMicrotask(cb);
        else Promise.resolve().then(cb);
    }

    /**
     * Schedule macrotask
     * @param cb
     */
    public scheduleMacrotask(cb: () => void): unknown {
        return setTimeout(cb, 0);
    }

    /**
     * Cancel macrotask
     * @param id
     */
    public cancelMacrotask(id: unknown): void {
        clearTimeout(id as ReturnType<typeof setTimeout>);
    }

    /**
     * Get time in ms
     */
    public now(): number {
        return nowMs();
    }
}

/**
 * Manual Event Loop Adapter
 */
export class ManualEventLoopAdapter implements EventLoopAdapter {
    private macrotasks: Array<() => void> = [];
    private _now = 0;

    /**
     * Yield to main thread
     */
    public yieldToMain(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Schedule microtask
     * @param cb
     */
    public scheduleMicrotask(cb: () => void): void {
        if (typeof queueMicrotask === "function") queueMicrotask(cb);
        else Promise.resolve().then(cb);
    }

    /**
     * Schedule macrotask
     * @param cb
     */
    public scheduleMacrotask(cb: () => void): unknown {
        const id = this.macrotasks.length;
        this.macrotasks.push(cb);
        return id;
    }

    /**
     * Cancel macrotask
     * @param id
     */
    public cancelMacrotask(id: unknown): void {
        const idx = id as number;
        if (idx >= 0 && idx < this.macrotasks.length) this.macrotasks[idx] = () => {
        };
    }

    /**
     * Get time in ms
     */
    public now(): number {
        return this._now;
    }

    /**
     * Advance ms
     * @param ms {number} Number of ms
     */
    public advance(ms: number): void {
        this._now += ms;
    }

    /**
     * Flush macrotask
     */
    public flushMacrotasks(): void {
        while (this.macrotasks.length > 0) {
            const tasks = this.macrotasks.splice(0);
            for (const t of tasks) t();
        }
    }
}
