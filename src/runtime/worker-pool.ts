/**
 * TypeScript Coroutines Worker Pool Implementation
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import {createScheduler, Scheduler, type SchedulerOptions} from "../core/scheduler";
import type {AnyGenerator, CoroutineHandle} from "../core/coroutine";
import {CoroutineState} from "../core/coroutine";
import {Arena} from "../core/arena";
import {WorkStealingPool} from "../core/work-stealing";
import {Channel} from "../core/channel";
import type {Worker as NodeWorker} from "node:worker_threads";

/**
 * Worker pool options
 */
export interface WorkerPoolOptions extends SchedulerOptions {
    size?: number;
    workerFactory?: () => Worker | NodeWorker;
    useWorkers?: boolean;
    workerUrl?: string;
}

/**
 * Task Descriptor
 */
export type TaskDescriptor<T> = {
    id: number;
    source: string;
    priority?: number;
};

/**
 * Worker Handler
 */
class WorkerHandle<T> implements CoroutineHandle<T> {
    readonly id: number;
    readonly promise: Promise<T>;
    readonly coroutine: never = null as unknown as never;
    private _state: CoroutineState = CoroutineState.Pending;
    private _cancel: () => void;

    /**
     * Create worker handle
     * @param id {number} Id
     * @param promise {Promise} Promise
     * @param cancel {function} Cancel
     */
    constructor(id: number, promise: Promise<T>, cancel: () => void) {
        this.id = id;
        this.promise = promise.then(
            (v) => {
                this._state = CoroutineState.Completed;
                return v;
            },
            (e) => {
                this._state = e?.name === "CancelError" ? CoroutineState.Cancelled : CoroutineState.Failed;
                throw e;
            }
        );
        this._cancel = cancel;
    }

    /**
     * Cancel
     */
    public cancel(): void {
        this._cancel();
        this._state = CoroutineState.Cancelled;
    }

    /**
     * Set priority
     * @param _p {number} Priority
     */
    public setPriority(_p: number): void {
    }

    /**
     * Get state
     */
    public getState(): CoroutineState {
        return this._state;
    }
}

/**
 * Distributed scheduler
 */
export class DistributedScheduler {
    private schedulers: Scheduler[] = [];
    private workers: (Worker | NodeWorker)[] = [];
    private nextWorker = 0;
    private nextId = 1;
    private workerPending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
    private useWorkers = false;
    private workStealing: WorkStealingPool;
    private backpressureChannel: Channel<number>;

    /**
     * Create distributed scheduler
     * @param opts {WorkerPoolOptions} Worker pool options
     */
    constructor(private readonly opts: WorkerPoolOptions = {}) {
        const size = opts.size ?? (typeof navigator !== "undefined" ? (navigator as unknown as {
            hardwareConcurrency?: number
        }).hardwareConcurrency ?? 4 : 4);
        this.useWorkers = opts.useWorkers ?? false;
        this.workStealing = new WorkStealingPool(size);
        this.backpressureChannel = new Channel<number>({
            push: () => true,
            shift: () => undefined,
            size: 0,
            capacity: 1000
        } as unknown as import("../core/channel.js").ChannelBuffer<number>);
        if (this.useWorkers) this.initWorkers(size);
        if (this.workers.length === 0) {
            for (let i = 0; i < size; i++) this.schedulers.push(createScheduler(opts));
        } else {
            for (let i = 0; i < size; i++) this.schedulers.push(createScheduler({...opts, enableStats: false}));
        }
        void opts.workerFactory;
    }

    /**
     * Get size of distributed scheduler
     */
    public get size(): number {
        return this.workers.length > 0 ? this.workers.length : this.schedulers.length;
    }

    /**
     * Spawn coroutine at worker
     * @param factory Coroutine
     * @param options Options
     */
    public spawn<T>(factory: () => AnyGenerator<T>, options?: {
        priority?: number | undefined;
        name?: string | undefined
    }): CoroutineHandle<T> {
        if (this.workers.length > 0 && this.shouldUseWorker(factory)) {
            return this.spawnOnWorker(factory, options);
        }
        const target = this.pickScheduler(options?.priority);
        return target.spawn(factory, options);
    }

    /**
     * Run coroutine
     * @param factory Coroutine
     * @param options Options
     */
    public async run<T>(factory: () => AnyGenerator<T>, options?: {
        priority?: number | undefined;
        name?: string | undefined
    }): Promise<T> {
        const handle = this.spawn(factory, options);
        return handle.promise;
    }

    /**
     * Spawn coroutine at worker index
     * @param workerIndex {number} Worker index
     * @param factory Coroutine
     * @param options Options
     */
    public spawnOn<T>(workerIndex: number, factory: () => AnyGenerator<T>, options?: {
        priority?: number | undefined;
        name?: string | undefined
    }): CoroutineHandle<T> {
        if (this.workers.length > 0) return this.spawnOnWorker(factory, options);
        const idx = ((workerIndex % this.schedulers.length) + this.schedulers.length) % this.schedulers.length;
        return this.schedulers[idx]!.spawn(factory, options);
    }

    /**
     * Broadcast coroutine
     * @param factory Coroutine
     * @param options Options
     */
    public broadcast<T>(factory: () => AnyGenerator<T>, options?: { priority?: number | undefined }): CoroutineHandle<T>[] {
        if (this.workers.length > 0) {
            return this.workers.map(() => this.spawnOnWorker(factory, options));
        }
        return this.schedulers.map((s) => s.spawn(factory, options));
    }

    /**
     * Get stats of distributed scheduler
     */
    public getStats(): Array<ReturnType<Scheduler["getStats"]>> {
        return this.schedulers.map((s) => s.getStats());
    }

    /**
     * Destroy distributed scheduler
     */
    public destroy(): void {
        for (const s of this.schedulers) s.destroy();
        this.schedulers.length = 0;
        for (const w of this.workers) {
            try {
                const anyW = w as unknown as { terminate: () => void; close: () => void };
                if (typeof anyW.terminate === "function") anyW.terminate();
                else if (typeof anyW.close === "function") anyW.close();
            } catch {
            }
        }
        this.workers.length = 0;
        this.workerPending.clear();
    }

    private pickScheduler(priority?: number): Scheduler {
        if (this.schedulers.length === 1) return this.schedulers[0]!;
        if (priority !== undefined && priority >= 8) return this.schedulers[0]!;
        let best = this.schedulers[0]!;
        let minLoad = best.size;
        for (const s of this.schedulers) {
            const load = s.size;
            if (load < minLoad) {
                minLoad = load;
                best = s;
            }
        }
        if (this.backpressureChannel && minLoad > 1000) {
            this.workStealing.setBackpressure(this.nextWorker, minLoad);
        }
        const stolen = this.workStealing.steal(this.nextWorker);
        if (stolen) {
            const target = this.schedulers[this.nextWorker % this.schedulers.length]!;
            target.spawn(function* () {
                return stolen.coro;
            } as unknown as () => AnyGenerator<unknown>);
        }
        const s = this.schedulers[this.nextWorker % this.schedulers.length]!;
        this.nextWorker = (this.nextWorker + 1) % this.schedulers.length;
        return s;
    }

    private shouldUseWorker<T>(factory: () => AnyGenerator<T>): boolean {
        const code = factory.toString();
        return code.length < 10000 && !code.includes("[native code]");
    }

    private initWorkers(size: number): void {
        for (let i = 0; i < size; i++) {
            try {
                let w: Worker | NodeWorker | undefined;
                if (this.opts.workerFactory) w = this.opts.workerFactory();
                else if (typeof Worker !== "undefined") {
                    const url = this.opts.workerUrl ?? new URL("./worker-executor.js", import.meta.url).toString();
                    w = new Worker(url, {type: "module"} as unknown as WorkerOptions);
                }
                if (w) {
                    const handler = (e: unknown) => {
                        const data = (e as { data?: unknown }).data ?? e;
                        const msg = data as { id?: number; result?: unknown; error?: string };
                        if (msg && typeof msg.id === "number") {
                            const pending = this.workerPending.get(msg.id);
                            if (pending) {
                                this.workerPending.delete(msg.id);
                                if (msg.error) pending.reject(new Error(msg.error));
                                else pending.resolve(msg.result);
                            }
                        }
                    };
                    const anyW = w as unknown as Record<string, unknown>;
                    if (typeof anyW["addEventListener"] === "function") (anyW["addEventListener"] as (t: string, h: (e: unknown) => void) => void)("message", handler);
                    else if (typeof anyW["on"] === "function") (anyW["on"] as (t: string, h: (e: unknown) => void) => void)("message", handler);
                    else (w as unknown as { onmessage: (e: unknown) => void }).onmessage = handler;
                    this.workers.push(w);
                }
            } catch {
            }
        }
    }

    private spawnOnWorker<T>(factory: () => AnyGenerator<T>, options?: {
        priority?: number | undefined
    }): CoroutineHandle<T> {
        const id = this.nextId++;
        const code = factory.toString();
        const priority = options?.priority;
        let worker: Worker | NodeWorker | undefined;
        if (this.workers.length === 1) worker = this.workers[0];
        else {
            worker = this.workers[this.nextWorker];
            this.nextWorker = (this.nextWorker + 1) % this.workers.length;
        }
        if (!worker) {
            const target = this.pickScheduler(priority);
            return target.spawn(factory, options);
        }
        const promise = new Promise<T>((resolve, reject) => {
            this.workerPending.set(id, {resolve: resolve as (v: unknown) => void, reject});
            try {
                const anyW = worker as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void };
                anyW.postMessage({id, code, priority});
            } catch (e) {
                this.workerPending.delete(id);
                reject(e);
            }
        });
        const cancel = () => {
            const pending = this.workerPending.get(id);
            if (pending) {
                this.workerPending.delete(id);
                pending.reject(new Error("Cancelled"));
                try {
                    const anyW = worker as unknown as { postMessage: (m: unknown) => void };
                    anyW.postMessage({id, cancel: true});
                } catch {
                }
            }
        };
        return new WorkerHandle(id, promise, cancel) as unknown as CoroutineHandle<T>;
    }
}

/**
 * Create distributed scheduler
 * @param options {WorkerPoolOptions} Worker pool optiions
 */
export function createDistributedScheduler(options?: WorkerPoolOptions): DistributedScheduler {
    return new DistributedScheduler(options);
}

/**
 * Worker channel
 */
export class WorkerChannel {
    /**
     * Run coroutine in worker
     * @param factory Coroutine
     * @param buffer Array Buffer
     */
    public static async runInWorker<T>(factory: () => AnyGenerator<T>, buffer?: ArrayBuffer): Promise<T> {
        void buffer;
        const sched = createScheduler();
        try {
            return await sched.run(factory);
        } finally {
            sched.destroy();
        }
    }

    /**
     * Transfer arena
     * @param buffer {ArrayBuffer} Buffer
     * @param target {Worker | NodeWorker} Target worker
     */
    public static transferArena(buffer: ArrayBuffer, target: Worker | NodeWorker): void {
        try {
            const anyTarget = target as unknown as { postMessage: (msg: unknown, transfer: Transferable[]) => void };
            anyTarget.postMessage({type: "arena", buffer}, [buffer]);
        } catch {
        }
    }

    /**
     * Create shared arena
     * @param size {number} Size of arena
     */
    public static createSharedArena(size: number): { buffer: SharedArrayBuffer; arena: Arena } {
        const sab = new SharedArrayBuffer(size);
        const arena = new Arena(size);
        (arena as unknown as { _buffer: ArrayBuffer })._buffer = sab as unknown as ArrayBuffer;
        (arena as unknown as { _view: DataView })._view = new DataView(sab);
        (arena as unknown as { _u8: Uint8Array })._u8 = new Uint8Array(sab);
        return {buffer: sab, arena};
    }
}
