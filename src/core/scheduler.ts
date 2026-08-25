/**
 * TypeScript Coroutines Scheduler Implementation
 *
 * This code represents the central Scheduler implementation,
 * which manages the lifecycle of coroutines: spawning,
 * scheduling, executing, pausing, resuming, canceling,
 * and collecting statistics.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import {Arena} from "./arena";
import {WasmArena} from "./wasm.arena";
import {Pool} from "./pool.js";
import {Coroutine, CoroutineState, createHandle, type CoroutineHandle, type AnyGenerator} from "./coroutine";
import {BinaryHeap} from "../utils/heap";
import {AtomicHeap} from "../utils/atomic.heap";
import {
    DecayPriorityStrategy,
    FixedPriorityStrategy,
    DEFAULT_DECAY_OPTIONS,
    DEFAULT_PRIORITY_CONFIG,
    clampPriority,
    type DecayOptions,
    type PriorityConfig,
    type IPriorityStrategy
} from "./priority";
import {isEffect, type Effect} from "./effects";
import {DefaultEventLoopAdapter, type EventLoopAdapter} from "../runtime/event-loop";
import {hrtimeMs} from "../utils/time";
import {FrameStack, StackFrame, FrameState} from "./frame";
import {Tracer} from "../utils/tracing";

/**
 * Scheduler Options
 */
export interface SchedulerOptions {
    priorityConfig?: PriorityConfig;
    decayOptions?: DecayOptions;
    strategy?: "decay" | "fixed";
    quantumMs?: number;
    maxCoroutines?: number;
    arenaSize?: number;
    yieldEveryMs?: number;
    eventLoop?: EventLoopAdapter;
    enableStats?: boolean;
    enableTracing?: boolean;
    useWasmArena?: boolean;
    useAtomics?: boolean;
}

/**
 * Scheduler Stats
 */
export interface SchedulerStats {
    totalSpawned: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
    switches: number;
    avgSwitchNs: number;
}

/**
 * Queue entry
 */
type QueueEntry = {
    coro: Coroutine<unknown>;
    effective: number;
    enqueuedAt: number;
};

/**
 * Scheduler Implementation
 */
export class Scheduler {
    private nextId = 1;
    private heap: BinaryHeap<QueueEntry>;
    private sleeping: Map<number, Coroutine<unknown>> = new Map();
    private sleepHeap: BinaryHeap<{ coro: Coroutine<unknown>; wakeAt: number }> | AtomicHeap<{
        coro: Coroutine<unknown>;
        wakeAt: number
    }>;
    private activeMap: Map<number, Coroutine<unknown>> = new Map();
    private paused: Set<number> = new Set();
    private pool: Pool<Coroutine<unknown>>;
    private arena: Arena | WasmArena;
    private arenaMark = 0;
    private strategy: IPriorityStrategy;
    private opts: Required<Omit<SchedulerOptions, "eventLoop">> & { eventLoop: EventLoopAdapter };
    private running = false;
    private scheduled = false;
    private stats: SchedulerStats = {
        totalSpawned: 0,
        active: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        switches: 0,
        avgSwitchNs: 0
    };
    private totalSwitchNs = 0;
    private lastAgingAt = 0;
    private children: Set<number> = new Set();
    private frames: FrameStack = new FrameStack();
    private framePool: Pool<StackFrame> = new Pool<StackFrame>({
        create: () => new StackFrame(),
        reset: (f) => f.reset()
    }, 1024);
    private tracer: Tracer;

    /**
     * Create new scheduler
     * @param options {SchedulerOptions} Scheduler Options
     */
    constructor(options: SchedulerOptions = {}) {
        const priorityConfig = options.priorityConfig ?? DEFAULT_PRIORITY_CONFIG;
        const decayOptions = options.decayOptions ?? DEFAULT_DECAY_OPTIONS;
        this.opts = {
            priorityConfig,
            decayOptions,
            strategy: options.strategy ?? "decay",
            quantumMs: options.quantumMs ?? 5,
            maxCoroutines: options.maxCoroutines ?? 100_000,
            arenaSize: options.arenaSize ?? 4 * 1024 * 1024,
            yieldEveryMs: options.yieldEveryMs ?? 5,
            eventLoop: options.eventLoop ?? new DefaultEventLoopAdapter(),
            enableStats: options.enableStats ?? true,
            enableTracing: options.enableTracing ?? false,
            useWasmArena: options.useWasmArena ?? (options.maxCoroutines !== undefined && options.maxCoroutines > 50000),
            useAtomics: options.useAtomics ?? (typeof SharedArrayBuffer !== "undefined"),
        };
        this.strategy = this.opts.strategy === "fixed" ? new FixedPriorityStrategy() : new DecayPriorityStrategy(this.opts.decayOptions, this.opts.priorityConfig);
        this.arena = this.opts.useWasmArena ? new WasmArena(this.opts.arenaSize, this.opts.useAtomics) as unknown as Arena : new Arena(this.opts.arenaSize);
        this.tracer = new Tracer(this.opts.enableTracing);
        this.pool = new Pool<Coroutine<unknown>>(
            {
                create: () => new Coroutine<unknown>(0, {priority: priorityConfig.default}, () => (function* () {
                })() as unknown as AnyGenerator<unknown>, 0),
                reset: (c) => c.reset(0, {priority: priorityConfig.default}, () => (function* () {
                })() as unknown as AnyGenerator<unknown>, 0),
            },
            this.opts.maxCoroutines,
            false,
        );
        this.heap = new BinaryHeap<QueueEntry>((a, b) => {
            if (a.effective !== b.effective) return b.effective - a.effective;
            return a.enqueuedAt - b.enqueuedAt;
        });
        this.sleepHeap = this.opts.useAtomics
            ? new AtomicHeap<{
                coro: Coroutine<unknown>;
                wakeAt: number
            }>((a, b) => a.wakeAt - b.wakeAt, true) as unknown as BinaryHeap<{
                coro: Coroutine<unknown>;
                wakeAt: number
            }>
            : new BinaryHeap<{ coro: Coroutine<unknown>; wakeAt: number }>((a, b) => a.wakeAt - b.wakeAt);
        this.lastAgingAt = this.opts.eventLoop.now();
    }

    /**
     * Check if scheduler is running
     */
    public get isRunning(): boolean {
        return this.running;
    }

    /**
     * Get total size of scheduler
     */
    public get size(): number {
        return this.heap.size + this.sleeping.size + this.sleepHeap.size;
    }

    /**
     * Spawn coroutine
     * @param factory
     * @param options
     */
    public spawn<T>(factory: () => AnyGenerator<T>, options?: {
        priority?: number | undefined;
        name?: string | undefined
    }): CoroutineHandle<T> {
        if (this.activeMap.size >= this.opts.maxCoroutines) throw new Error(`Max coroutines ${this.opts.maxCoroutines} reached`);
        const priority = clampPriority(options?.priority ?? this.opts.priorityConfig.default, this.opts.priorityConfig);
        const now = this.opts.eventLoop.now();
        const coro = this.pool.acquire() as Coroutine<T> & Coroutine<unknown>;
        coro.reset(this.nextId++, {priority, name: options?.name}, factory as () => AnyGenerator<unknown>, now);
        this.tracer.recordEnqueue(coro.id, priority, now);
        const handle = createHandle(coro as Coroutine<T>);
        this.enqueue(coro as unknown as Coroutine<unknown>, now);
        this.activeMap.set(coro.id, coro as unknown as Coroutine<unknown>);
        this.stats.totalSpawned++;
        this.stats.active = this.activeMap.size;
        this.ensureRunning();
        return handle;
    }

    /**
     * Get active ids
     */
    public getActiveIds(): number[] {
        return [...this.activeMap.keys()];
    }

    /**
     * Run coroutine
     * @param factory
     * @param options
     */
    public async run<T>(factory: () => AnyGenerator<T>, options?: {
        priority?: number | undefined;
        name?: string | undefined
    }): Promise<T> {
        const handle = this.spawn(factory, options);
        return handle.promise;
    }

    /**
     * Cancel coroutine by id
     * @param id {number} ID
     */
    public cancel(id: number): boolean {
        const coro = this.activeMap.get(id);
        if (!coro) return false;
        coro.doCancel();
        this.heap.remove((e) => e.coro.id === id);
        this.sleepHeap.remove((e) => e.coro.id === id);
        this.sleeping.delete(id);
        this.activeMap.delete(id);
        this.stats.cancelled++;
        this.stats.active = this.activeMap.size;
        return true;
    }

    /**
     * Set coroutine priority by id
     * @param id {number} Coroutine id
     * @param priority {number} Priority
     */
    public setPriority(id: number, priority: number): boolean {
        const coro = this.activeMap.get(id);
        if (!coro) return false;
        const p = clampPriority(priority, this.opts.priorityConfig);
        coro.setPriority(p);
        const entry = this.heap.remove((e) => e.coro.id === id);
        if (entry) {
            entry.coro.priority = p;
            entry.effective = p;
            this.heap.push(entry);
        }
        return true;
    }

    /**
     * Pause coroutine by id
     * @param id {number} Coroutine id
     */
    public pause(id: number): boolean {
        const coro = this.activeMap.get(id);
        if (!coro) return false;
        this.paused.add(id);
        this.heap.remove((e) => e.coro.id === id);
        return true;
    }

    /**
     * Resume coroutine by id
     * @param id {number} Coroutine id
     */
    public resume(id: number): boolean {
        const coro = this.activeMap.get(id);
        if (!coro || !this.paused.has(id)) return false;
        this.paused.delete(id);
        this.requeue(coro);
        this.ensureRunning();
        return true;
    }

    /**
     * Get statistics
     */
    public getStats(): SchedulerStats {
        return {...this.stats, avgSwitchNs: this.stats.switches > 0 ? this.totalSwitchNs / this.stats.switches : 0};
    }

    /**
     * Get tracing statistics
     */
    public getTracingStats(): ReturnType<Tracer["getStats"]> {
        return this.tracer.getStats();
    }

    /**
     * Get tracer data in OTEL
     */
    public getOTEL(): ReturnType<Tracer["toOTEL"]> {
        return this.tracer.toOTEL();
    }

    /**
     * Enable tracing
     */
    public enableTracing(): void {
        this.tracer.enable();
    }

    /**
     * Disable tracing
     */
    public disableTracing(): void {
        this.tracer.disable();
    }

    /**
     * Tick
     */
    public async tick(): Promise<void> {
        this.processSleeping();
        this.applyAging();
        const entry = this.heap.pop();
        if (!entry) return;
        const coro = entry.coro;
        if (coro.state === CoroutineState.Cancelled || coro.cancelled) {
            this.activeMap.delete(coro.id);
            return;
        }
        await this.execute(coro);
    }

    /**
     * Destroy
     */
    public destroy(): void {
        this.running = false;
        for (const c of this.activeMap.values()) {
            try {
                c.doCancel();
            } catch {
            }
            this.pool.release(c as unknown as Coroutine<unknown>);
        }
        this.activeMap.clear();
        this.heap.clear();
        this.sleepHeap.clear();
        this.sleeping.clear();
        this.frames.clear();
        this.arena.free();
    }

    private enqueue(coro: Coroutine<unknown>, now: number): void {
        const effective = this.strategy.effectivePriority(coro.priority, 0, now);
        this.heap.push({coro, effective, enqueuedAt: now});
    }

    private requeue(coro: Coroutine<unknown>): void {
        const now = this.opts.eventLoop.now();
        const waitMs = now - coro.enqueuedAt;
        const effective = this.strategy.effectivePriority(coro.priority, waitMs, now);
        this.heap.push({coro, effective, enqueuedAt: coro.enqueuedAt});
    }

    private processSleeping(): void {
        if (this.sleeping.size === 0 && this.sleepHeap.isEmpty) return;
        const now = this.opts.eventLoop.now();
        while (!this.sleepHeap.isEmpty) {
            const peek = this.sleepHeap.peek();
            if (!peek || peek.wakeAt > now) break;
            const entry = this.sleepHeap.pop()!;
            const id = entry.coro.id;
            if (!this.sleeping.has(id)) continue;
            this.sleeping.delete(id);
            entry.coro.waitUntilMs = undefined;
            entry.coro.state = CoroutineState.Pending;
            this.requeue(entry.coro);
        }
        if (this.sleeping.size > 0 && this.sleepHeap.isEmpty) {
            for (const [id, coro] of [...this.sleeping.entries()]) {
                if (coro.waitUntilMs !== undefined && now >= coro.waitUntilMs) {
                    this.sleeping.delete(id);
                    coro.waitUntilMs = undefined;
                    coro.state = CoroutineState.Pending;
                    this.requeue(coro);
                }
            }
        }
    }

    private applyAging(): void {
        if (this.opts.strategy !== "decay") return;
        const now = this.opts.eventLoop.now();
        if (now - this.lastAgingAt < this.opts.decayOptions.agingIntervalMs) return;
        this.lastAgingAt = now;
        this.heap.updateAll((e) => {
            e.effective = this.strategy.effectivePriority(e.coro.priority, now - e.enqueuedAt, now);
        });
    }

    private ensureRunning(): void {
        if (this.running || this.scheduled) return;
        this.scheduled = true;
        this.opts.eventLoop.scheduleMicrotask(() => {
            this.scheduled = false;
            void this.runLoop();
        });
    }

    private async runLoop(): Promise<void> {
        if (this.running) return;
        this.running = true;
        this.arenaMark = this.arena.mark();
        const quantumStart = hrtimeMs();
        let iterations = 0;
        while (this.heap.size > 0 || this.sleeping.size > 0 || !this.sleepHeap.isEmpty) {
            const now = hrtimeMs();
            if (now - quantumStart > this.opts.quantumMs && iterations > 0) {
                await this.opts.eventLoop.yieldToMain();
                this.arenaMark = this.arena.mark();
                iterations = 0;
            }
            await this.tick();
            iterations++;
            if (this.heap.size === 0 && (this.sleeping.size > 0 || !this.sleepHeap.isEmpty)) {
                const peek = this.sleepHeap.peek();
                const nextWake = peek ? peek.wakeAt : Math.min(...[...this.sleeping.values()].map((c) => c.waitUntilMs ?? Infinity));
                const delay = Math.max(0, nextWake - this.opts.eventLoop.now());
                if (delay > 0) await new Promise<void>((r) => setTimeout(r, Math.min(delay, 10)));
            }
        }
        this.arena.reset(this.arenaMark);
        this.running = false;
        if (this.heap.size > 0 || this.sleeping.size > 0 || !this.sleepHeap.isEmpty) this.ensureRunning();
    }

    private resumeWithValue(coro: Coroutine<unknown>, value: unknown): void {
        if (coro.state === CoroutineState.Cancelled || coro.cancelled) return;
        const gen = coro.generator as Generator<unknown, unknown, unknown>;
        let res: IteratorResult<unknown, unknown> | Promise<IteratorResult<unknown, unknown>>;
        try {
            res = gen.next(value) as IteratorResult<unknown, unknown> | Promise<IteratorResult<unknown, unknown>>;
        } catch (err) {
            coro.fail(err);
            this.activeMap.delete(coro.id);
            this.pool.release(coro);
            this.stats.failed++;
            this.stats.active = this.activeMap.size;
            return;
        }
        if (res instanceof Promise) {
            (res as Promise<IteratorResult<unknown, unknown>>).then(
                (r) => this.processNext(coro, r),
                (e) => this.resumeWithError(coro, e),
            );
        } else {
            this.processNext(coro, res);
        }
    }

    private resumeWithError(coro: Coroutine<unknown>, err: unknown): void {
        if (coro.state === CoroutineState.Cancelled || coro.cancelled) return;
        const gen = coro.generator as Generator<unknown, unknown, unknown>;
        let res: IteratorResult<unknown, unknown> | Promise<IteratorResult<unknown, unknown>>;
        try {
            res = gen.throw(err) as IteratorResult<unknown, unknown> | Promise<IteratorResult<unknown, unknown>>;
        } catch (e2) {
            coro.fail(e2);
            this.activeMap.delete(coro.id);
            this.pool.release(coro);
            this.stats.failed++;
            this.stats.active = this.activeMap.size;
            return;
        }
        if (res instanceof Promise) {
            (res as Promise<IteratorResult<unknown, unknown>>).then(
                (r) => this.processNext(coro, r),
                (e) => {
                    coro.fail(e);
                    this.activeMap.delete(coro.id);
                    this.pool.release(coro);
                    this.stats.failed++;
                    this.stats.active = this.activeMap.size;
                },
            );
        } else {
            this.processNext(coro, res);
        }
    }

    private processNext(coro: Coroutine<unknown>, result: IteratorResult<unknown, unknown>): void {
        if (result.done) {
            coro.complete(result.value as unknown as never);
            this.tracer.recordComplete(coro.id, this.opts.eventLoop.now(), "completed");
            this.activeMap.delete(coro.id);
            this.pool.release(coro);
            this.stats.completed++;
            this.stats.active = this.activeMap.size;
            return;
        }
        const yielded = result.value;
        if (isEffect(yielded)) {
            this.handleEffect(coro, yielded as Effect);
            this.stats.active = this.activeMap.size;
            return;
        }
        if (yielded instanceof Promise) {
            coro.state = CoroutineState.Suspended;
            (yielded as Promise<unknown>).then(
                (v) => this.resumeWithValue(coro, v),
                (e) => this.resumeWithError(coro, e),
            );
            return;
        }
        coro.state = CoroutineState.Suspended;
        this.requeue(coro);
    }

    private async execute(coro: Coroutine<unknown>): Promise<void> {
        const start = this.opts.enableStats ? hrtimeMs() : 0;
        const frame = this.framePool.acquire();
        frame.state = FrameState.Active;
        frame.depth = this.frames.depth;
        frame.arenaOffset = this.arena.allocAligned(8, 8);
        frame.arenaSize = 8;
        this.frames.push(frame);
        try {
            coro.init();
            coro.state = CoroutineState.Running;
            this.tracer.recordStart(coro.id, this.opts.eventLoop.now());
            const gen = coro.generator as Generator<unknown, unknown, unknown> & AsyncGenerator<unknown, unknown, unknown>;
            if (!gen) {
                coro.fail(new Error("No generator"));
                this.tracer.recordComplete(coro.id, this.opts.eventLoop.now(), "failed");
                this.activeMap.delete(coro.id);
                this.pool.release(coro);
                this.stats.failed++;
                return;
            }
            let result: IteratorResult<unknown, unknown> | Promise<IteratorResult<unknown, unknown>>;
            try {
                result = gen.next(undefined) as IteratorResult<unknown, unknown> | Promise<IteratorResult<unknown, unknown>>;
            } catch (err) {
                coro.fail(err);
                this.tracer.recordComplete(coro.id, this.opts.eventLoop.now(), "failed");
                this.activeMap.delete(coro.id);
                this.pool.release(coro);
                this.stats.failed++;
                this.stats.active = this.activeMap.size;
                return;
            }
            if (result instanceof Promise) {
                const awaited = await result;
                if (this.opts.enableStats) {
                    const elapsed = hrtimeMs() - start;
                    this.totalSwitchNs += elapsed * 1e6;
                }
                this.stats.switches++;
                this.processNext(coro, awaited as IteratorResult<unknown, unknown>);
                return;
            }
            if (this.opts.enableStats) {
                const elapsed = hrtimeMs() - start;
                this.totalSwitchNs += elapsed * 1e6;
            }
            this.stats.switches++;

            if ((result as IteratorResult<unknown, unknown>).done) {
                coro.complete((result as IteratorResult<unknown, unknown>).value as unknown as never);
                this.activeMap.delete(coro.id);
                this.pool.release(coro);
                this.stats.completed++;
                this.stats.active = this.activeMap.size;
                return;
            }

            const yielded = (result as IteratorResult<unknown, unknown>).value;
            if (!isEffect(yielded)) {
                if (yielded instanceof Promise) {
                    coro.state = CoroutineState.Suspended;
                    (yielded as Promise<unknown>).then(
                        (v) => this.resumeWithValue(coro, v),
                        (e) => this.resumeWithError(coro, e),
                    );
                    return;
                }
                coro.state = CoroutineState.Suspended;
                this.requeue(coro);
                return;
            }

            coro.state = CoroutineState.Suspended;
            this.handleEffect(coro, yielded as Effect);
            this.stats.active = this.activeMap.size;
        } catch (err) {
            coro.fail(err);
            this.activeMap.delete(coro.id);
            this.pool.release(coro);
            this.stats.failed++;
            this.stats.active = this.activeMap.size;
        } finally {
            const popped = this.frames.pop();
            if (popped) this.framePool.release(popped);
        }
    }

    private handleEffect(coro: Coroutine<unknown>, effect: Effect): void {
        switch (effect._effect) {
            case "yield": {
                this.requeue(coro);
                break;
            }
            case "sleep": {
                const wakeAt = this.opts.eventLoop.now() + effect.ms;
                coro.waitUntilMs = wakeAt;
                coro.state = CoroutineState.Suspended;
                this.sleeping.set(coro.id, coro);
                this.sleepHeap.push({coro, wakeAt});
                break;
            }
            case "fork": {
                const childPriority = effect.priority !== undefined ? Math.max(coro.priority, effect.priority) : coro.priority;
                const child = this.spawn(effect.factory as () => AnyGenerator<unknown>, {priority: childPriority});
                this.children.add(child.id);
                void child.promise.then(
                    () => this.children.delete(child.id),
                    () => this.children.delete(child.id),
                );
                this.resumeWithValue(coro, child);
                break;
            }
            case "cancel": {
                if (effect.handleId !== undefined) this.cancel(effect.handleId);
                else coro.doCancel();
                if (coro.state !== CoroutineState.Cancelled) this.requeue(coro);
                else {
                    this.activeMap.delete(coro.id);
                }
                break;
            }
            case "all": {
                const handles = effect.factories.map((f) => this.spawn(f as () => AnyGenerator<unknown>, {priority: coro.priority}));
                const promises = handles.map((h) => h.promise);
                coro.state = CoroutineState.Suspended;
                Promise.all(promises).then(
                    (results) => {
                        if (coro.state === CoroutineState.Cancelled || coro.cancelled) return;
                        this.ensureRunning();
                        this.resumeWithValue(coro, results);
                    },
                    (err) => {
                        for (const h of handles) {
                            if (h.getState() !== CoroutineState.Completed && h.getState() !== CoroutineState.Failed && h.getState() !== CoroutineState.Cancelled) h.cancel();
                        }
                        if (coro.state === CoroutineState.Cancelled || coro.cancelled) return;
                        this.ensureRunning();
                        this.resumeWithError(coro, err);
                    },
                );
                break;
            }
            case "race": {
                const handles = effect.factories.map((f) => this.spawn(f as () => AnyGenerator<unknown>, {priority: coro.priority}));
                const promises = handles.map((h) => h.promise);
                coro.state = CoroutineState.Suspended;
                Promise.race(promises).then(
                    (result) => {
                        for (const h of handles) {
                            if (h.getState() !== CoroutineState.Completed) h.cancel();
                        }
                        if (coro.state === CoroutineState.Cancelled || coro.cancelled) return;
                        this.ensureRunning();
                        this.resumeWithValue(coro, result);
                    },
                    (err) => {
                        for (const h of handles) {
                            if (h.getState() !== CoroutineState.Completed && h.getState() !== CoroutineState.Failed && h.getState() !== CoroutineState.Cancelled) h.cancel();
                        }
                        if (coro.state === CoroutineState.Cancelled || coro.cancelled) return;
                        this.ensureRunning();
                        this.resumeWithError(coro, err);
                    },
                );
                break;
            }
            case "call": {
                coro.state = CoroutineState.Suspended;
                Promise.resolve()
                    .then(() => effect.fn())
                    .then(
                        (v) => {
                            if (coro.state === CoroutineState.Cancelled || coro.cancelled) return;
                            this.ensureRunning();
                            this.resumeWithValue(coro, v);
                        },
                        (err) => {
                            if (coro.state === CoroutineState.Cancelled || coro.cancelled) return;
                            this.ensureRunning();
                            this.resumeWithError(coro, err);
                        },
                    );
                break;
            }
            case "await": {
                coro.state = CoroutineState.Suspended;
                (effect.promise as Promise<unknown>).then(
                    (v) => {
                        if (coro.state === CoroutineState.Cancelled || coro.cancelled) return;
                        this.ensureRunning();
                        this.resumeWithValue(coro, v);
                    },
                    (err) => {
                        if (coro.state === CoroutineState.Cancelled || coro.cancelled) return;
                        this.ensureRunning();
                        this.resumeWithError(coro, err);
                    },
                );
                break;
            }
            case "yieldEvery": {
                effect.counter.count++;
                if (effect.counter.count % effect.every === 0) this.requeue(coro);
                else this.resumeWithValue(coro, undefined);
                break;
            }
            case "setPriority": {
                coro.setPriority(clampPriority(effect.priority, this.opts.priorityConfig));
                this.resumeWithValue(coro, undefined);
                break;
            }
            default:
                this.requeue(coro);
        }
    }
}

/**
 * Create scheduler
 * @param options {SchedulerOptions} Scheduler options
 */
export function createScheduler(options?: SchedulerOptions): Scheduler {
    return new Scheduler(options);
}