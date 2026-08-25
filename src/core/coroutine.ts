/**
 * TypeScript Coroutine Implementation
 *
 * This code implements the library's coroutine core concept.
 * A coroutine encapsulates execution state, a generator
 * (or asynchronous generator), a Promise for externally
 * awaiting completion, and cancellation and prioritization
 * mechanisms.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import type {Effect} from "./effects";

/**
 * Coroutine state
 */
export const enum CoroutineState {
    Pending = "pending",
    Running = "running",
    Suspended = "suspended",
    Completed = "completed",
    Cancelled = "cancelled",
    Failed = "failed",
}

/**
 * Coroutine options
 */
export interface CoroutineOptions {
    priority: number;                   // Coroutine priority
    name?: string | undefined;          // Coroutine name
}

/**
 * Generator for coroutines
 */
export type AnyGenerator<T = unknown> =
    | Generator<unknown, T, unknown>
    | AsyncGenerator<unknown, T, unknown>;

/**
 * Check if is async generator
 * @param obj {unknown}
 */
export function isAsyncGenerator(obj: unknown): obj is AsyncGenerator<unknown, unknown, unknown> {
    if (typeof obj !== "object" || obj === null) return false;
    const rec = obj as Record<string, unknown>;
    return typeof rec["next"] === "function" && typeof (obj as unknown as {
        [Symbol.asyncIterator]?: unknown
    })[Symbol.asyncIterator] === "function";
}

/**
 * Base coroutine implementation
 */
export class Coroutine<T = unknown> {
    // Coroutine parameters
    readonly id: number;
    state: CoroutineState = CoroutineState.Pending;
    priority: number;
    name?: string | undefined;
    enqueuedAt: number;
    result: T | undefined = undefined;
    error: unknown = undefined;
    generator: AnyGenerator<T> | undefined;
    factory: (() => AnyGenerator<T>) | undefined;
    waitUntilMs: number | undefined = undefined;
    promise: Promise<T>;
    cancelled = false;
    yieldedCount = 0;

    private _resolve!: (v: T) => void;
    private _reject!: (e: unknown) => void;

    /**
     * Create new coroutine
     * @param id {number} Id of coroutine
     * @param opts {CoroutineOptions} Coroutine options
     * @param factory {Function} Coroutine factory
     * @param now {number} Now coefficient
     */
    constructor(id: number, opts: CoroutineOptions, factory: () => AnyGenerator<T>, now: number) {
        this.id = id;
        this.priority = opts.priority;
        this.name = opts.name ?? undefined;
        this.factory = factory;
        this.enqueuedAt = now;
        this.promise = new Promise<T>((res, rej) => {
            this._resolve = res;
            this._reject = rej;
        });
        this.promise.catch(() => {
        });
    }

    /**
     * Initialize coroutine
     */
    public init(): void {
        if (this.generator) return;
        this.generator = this.factory?.call(null) as AnyGenerator<T>;
        this.factory = undefined;
    }

    /**
     * Complete coroutine
     * @param value {any} Result value
     */
    public complete(value: T): void {
        if (this.state === CoroutineState.Completed || this.state === CoroutineState.Cancelled) return;
        this.state = CoroutineState.Completed;
        this.result = value;
        this._resolve(value);
    }

    /**
     * Fail coroutine
     * @param err {unknown} Error
     */
    public fail(err: unknown): void {
        if (this.state === CoroutineState.Completed || this.state === CoroutineState.Cancelled) return;
        this.state = CoroutineState.Failed;
        this.error = err;
        this._reject(err);
    }

    /**
     * Cancel coroutine
     */
    public doCancel(): void {
        if (this.state === CoroutineState.Completed || this.state === CoroutineState.Cancelled || this.state === CoroutineState.Failed) return;
        this.state = CoroutineState.Cancelled;
        this.cancelled = true;
        const gen = this.generator as Generator<unknown, T, unknown> | AsyncGenerator<unknown, T, unknown> | undefined;
        if (gen) {
            try {
                const result = gen.return?.(undefined as unknown as T);
                if (result instanceof Promise) {
                    result.catch(() => {
                    });
                }
            } catch {
            }
        }
        this._reject(new CancelError(`Coroutine ${this.id} cancelled`));
    }

    /**
     * Set coroutine priority
     * @param p {number} Priority
     */
    public setPriority(p: number): void {
        this.priority = p;
    }

    /**
     * Reset coroutine
     * @param id {number} Id of coroutine
     * @param opts {CoroutineOptions} Coroutine options
     * @param factory {Function} Coroutine factory
     * @param now {number} Now coefficient
     */
    public reset(id: number, opts: CoroutineOptions, factory: () => AnyGenerator<T>, now: number): void {
        this.state = CoroutineState.Pending;
        (this as { id: number }).id = id;
        this.priority = opts.priority;
        this.name = opts.name ?? undefined;
        this.enqueuedAt = now;
        this.result = undefined;
        this.error = undefined;
        this.generator = undefined;
        this.factory = factory as unknown as () => AnyGenerator<T>;
        this.waitUntilMs = undefined;
        this.cancelled = false;
        this.yieldedCount = 0;
        this.promise = new Promise<T>((res, rej) => {
            this._resolve = res;
            this._reject = rej;
        });
        this.promise.catch(() => {
        });
    }
}

/**
 * Cancel error
 */
export class CancelError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CancelError";
    }
}

/**
 * Coroutine handle
 */
export type CoroutineHandle<T> = {
    readonly id: number;
    readonly promise: Promise<T>;
    readonly coroutine: Coroutine<T>;
    cancel(): void;
    setPriority(p: number): void;
    getState(): CoroutineState;
};

/**
 * Create coroutine handle
 * @param coroutine {Coroutine} Coroutine
 */
export function createHandle<T>(coroutine: Coroutine<T>): CoroutineHandle<T> {
    const capturedId = coroutine.id;
    const capturedPromise = coroutine.promise;
    let handleState: CoroutineState = coroutine.state;
    const anyCoro = coroutine as unknown as { _resolve: (v: T) => void; _reject: (e: unknown) => void };
    const origResolve = anyCoro._resolve;
    const origReject = anyCoro._reject;
    anyCoro._resolve = (v: T) => {
        handleState = CoroutineState.Completed;
        return origResolve(v);
    };
    anyCoro._reject = (e: unknown) => {
        handleState = e instanceof CancelError ? CoroutineState.Cancelled : CoroutineState.Failed;
        return origReject(e);
    };
    return {
        get id() {
            return capturedId;
        },
        get promise() {
            return capturedPromise;
        },
        get coroutine() {
            return coroutine;
        },
        cancel() {
            if ((coroutine as unknown as { id: number }).id !== capturedId) return;
            coroutine.doCancel();
        },
        setPriority(p: number) {
            if ((coroutine as unknown as { id: number }).id !== capturedId) return;
            coroutine.setPriority(p);
        },
        getState() {
            if ((coroutine as unknown as { id: number }).id === capturedId) return coroutine.state;
            return handleState;
        },
    };
}

/**
 * Check if is effect yield
 * @param value {unknown}
 */
export function isEffectYield(value: unknown): boolean {
    if (value === null || typeof value !== "object") return false;
    return "_effect" in (value as Record<string, unknown>);
}

/* Export effects */
export type {Effect};
