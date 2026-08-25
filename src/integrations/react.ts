/**
 * TypeScript Coroutines React Integration
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createScheduler, Scheduler, type SchedulerOptions } from "../core/scheduler";
import { CoroutineState } from "../core/coroutine";
import type { AnyGenerator } from "../core/coroutine";

/* Coroutine status */
export type CoroutineStatus = "idle" | "running" | "suspended" | "completed" | "cancelled" | "failed";

/**
 * Map state
 * @param s {CoroutineState} Coroutine state
 */
function mapState(s: CoroutineState): CoroutineStatus {
    switch (s) {
        case CoroutineState.Pending:
            return "idle";
        case CoroutineState.Running:
            return "running";
        case CoroutineState.Suspended:
            return "suspended";
        case CoroutineState.Completed:
            return "completed";
        case CoroutineState.Cancelled:
            return "cancelled";
        case CoroutineState.Failed:
            return "failed";
        default:
            return "idle";
    }
}

/**
 * Use coroutine options
 */
export interface UseCoroutineOptions<T> extends SchedulerOptions {
    priority?: number;
    autoStart?: boolean;
}

/**
 * Use coroutine return
 */
export interface UseCoroutineReturn<T> {
    status: CoroutineStatus;
    result: T | undefined;
    error: unknown;
    start: () => void;
    cancel: () => void;
    pause: () => void;
    resume: () => void;
    setPriority: (p: number) => void;
    isRunning: boolean;
}

/**
 * Use Coroutine
 * @param factory Coroutine
 * @param options Coroutine Options
 */
export function useCoroutine<T>(factory: () => AnyGenerator<T>, options: UseCoroutineOptions<T> = {}): UseCoroutineReturn<T> {
    const { priority, autoStart = true, ...schedulerOpts } = options;
    const [scheduler] = useState(() => createScheduler(schedulerOpts));
    const schedulerRef = useRef<Scheduler | undefined>(scheduler);
    const handleRef = useRef<ReturnType<Scheduler["spawn"]> | undefined>(undefined);
    const factoryRef = useRef(factory);
    factoryRef.current = factory;

    const [status, setStatus] = useState<CoroutineStatus>("idle");
    const [result, setResult] = useState<T | undefined>(undefined);
    const [error, setError] = useState<unknown>(undefined);
    const [paused, setPaused] = useState(false);

    const start = useCallback(() => {
        const sched = schedulerRef.current as Scheduler;
        if (handleRef.current) {
            const s = handleRef.current.getState();
            if (s === CoroutineState.Running || s === CoroutineState.Suspended || s === CoroutineState.Pending) return;
        }
        setError(undefined);
        setResult(undefined);
        setStatus("running");
        const handle = sched.spawn(factoryRef.current as () => AnyGenerator<unknown>, priority === undefined ? {} : { priority });
        handleRef.current = handle as unknown as ReturnType<Scheduler["spawn"]>;
        handle.promise
            .then((v) => {
                setResult(v as T);
                setStatus("completed");
            })
            .catch((e) => {
                setError(e);
                const state = (handle as unknown as { getState: () => CoroutineState }).getState();
                setStatus(state === CoroutineState.Cancelled ? "cancelled" : "failed");
            });
    }, [priority]);

    const cancel = useCallback(() => {
        handleRef.current?.cancel();
        setStatus("cancelled");
    }, []);

    const pause = useCallback(() => {
        const h = handleRef.current;
        if (h) (schedulerRef.current as Scheduler).pause(h.id);
        setPaused(true);
        setStatus("suspended");
    }, []);

    const resume = useCallback(() => {
        const h = handleRef.current;
        if (h) (schedulerRef.current as Scheduler).resume(h.id);
        setPaused(false);
        setStatus("running");
    }, []);

    const setPriority = useCallback((p: number) => {
        const h = handleRef.current;
        if (h) h.setPriority(p);
    }, []);

    useEffect(() => {
        if (autoStart) start();
    }, [autoStart, start]);

    useEffect(() => {
        const sched = schedulerRef.current as Scheduler;
        return () => {
            handleRef.current?.cancel();
            sched.destroy();
            schedulerRef.current = undefined;
        };
    }, []);

    const isRunning = useMemo(() => status === "running" || status === "suspended", [status]);

    void paused;

    return { status, result, error, start, cancel, pause, resume, setPriority, isRunning };
}

/**
 * Use coroutine scope
 * @param options {SchedulerOptions} Scheduler options
 */
export function useCoroutineScope(options?: SchedulerOptions): Scheduler {
    const [scheduler] = useState(() => createScheduler(options));
    const ref = useRef<Scheduler>(scheduler);
    useEffect(() => {
        const s = ref.current;
        return () => s.destroy();
    }, []);
    return ref.current;
}
