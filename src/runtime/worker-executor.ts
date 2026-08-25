/**
 * TypeScript Coroutines Worker Executor Implementation
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import {createScheduler} from "../core/scheduler";
import type {AnyGenerator} from "../core/coroutine";

/**
 * Worker Request
 */
type WorkerRequest = {
    id: number;
    code: string;
    priority?: number;
    arenaBuffer?: ArrayBuffer | SharedArrayBuffer;
};

/**
 * Worker Response
 */
type WorkerResponse = {
    id: number;
    result?: unknown;
    error?: string;
};

/* Create scheduler */
const sched = createScheduler({enableStats: false});

/**
 * Handle message
 * @param data {WorkerRequest} Worker request
 */
function handleMessage(data: WorkerRequest): void {
    const {id, code, priority} = data;
    let factory: () => AnyGenerator<unknown>;
    try {
        factory = eval(`(${code})`) as () => AnyGenerator<unknown>;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        postResult({id, error: `factory eval failed: ${msg}`});
        return;
    }
    sched
        .run(factory, priority !== undefined ? {priority} : undefined)
        .then((result) => postResult({id, result}))
        .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            postResult({id, error: msg});
        });
}

/**
 * Post result
 * @param res {WorkerResponse} Worker response
 */
function postResult(res: WorkerResponse): void {
    try {
        const g = globalThis as unknown as {
            postMessage?: (m: unknown) => void;
            parentPort?: { postMessage: (m: unknown) => void }
        };
        if (typeof g.postMessage === "function") {
            g.postMessage(res);
            return;
        }
        if (g.parentPort && typeof g.parentPort.postMessage === "function") {
            g.parentPort.postMessage(res);
            return;
        }
        const selfAny = typeof self !== "undefined" ? (self as unknown as {
            postMessage?: (m: unknown) => void
        }) : undefined;
        if (selfAny && typeof selfAny.postMessage === "function") {
            selfAny.postMessage(res);
            return;
        }
    } catch {
    }
}

/**
 * Initialize worker executor
 */
function init(): void {
    const onMessage = (e: { data: WorkerRequest } | WorkerRequest) => {
        const data = (e as { data: WorkerRequest }).data ?? (e as WorkerRequest);
        if (data && typeof data.id === "number" && typeof data.code === "string") handleMessage(data);
        else if (data && typeof (data as unknown as { cancel: unknown }).cancel !== "undefined") {
            const c = data as unknown as { id: number; cancel: boolean };
            if (c.cancel) sched.cancel(c.id);
        }
    };
    try {
        const g = globalThis as unknown as {
            addEventListener?: (t: string, h: (e: unknown) => void) => void;
            onmessage?: unknown;
            parentPort?: { on: (e: string, h: (m: unknown) => void) => void }
        };
        if (typeof g.addEventListener === "function") g.addEventListener("message", onMessage as (e: unknown) => void);
        else if (typeof g.onmessage !== "undefined") g.onmessage = onMessage as unknown as never;
        if (g.parentPort && typeof g.parentPort.on === "function") g.parentPort.on("message", onMessage as (m: unknown) => void);
        const selfAny = typeof self !== "undefined" ? (self as unknown as {
            addEventListener?: (t: string, h: (e: unknown) => void) => void;
            onmessage?: unknown
        }) : undefined;
        if (selfAny) {
            if (typeof selfAny.addEventListener === "function") selfAny.addEventListener("message", onMessage as (e: unknown) => void);
            else if (typeof selfAny.onmessage !== "undefined") selfAny.onmessage = onMessage as unknown as never;
        }
    } catch {
    }
}

init();

export {};
