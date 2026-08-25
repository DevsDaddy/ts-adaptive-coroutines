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
import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {createScheduler, Scheduler, type SchedulerOptions} from "../core/scheduler";
import {CoroutineState} from "../core/coroutine";
import type {AnyGenerator, CoroutineHandle} from "../core/coroutine";
import { SchedulerContext } from "./schedulerProvider";

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
    scheduler?: Scheduler;
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
    isPaused: boolean;
}

/**
 * Use scheduler hook
 * @param options {SchedulerOptions} Scheduler options
 * @param autoCreate {boolean} Auto create scheduler
 */
export function useScheduler(options?: SchedulerOptions, autoCreate: boolean = true): Scheduler | undefined {
    const contextScheduler = useContext(SchedulerContext);
    const [localScheduler, setLocalScheduler] = useState<Scheduler | undefined>(() =>
        !contextScheduler && autoCreate ? createScheduler(options) : undefined
    );
    const ref = useRef<Scheduler | undefined>(localScheduler);
    ref.current = contextScheduler ?? localScheduler;

    useEffect(() => {
        if (!contextScheduler && localScheduler) {
            return () => {
                localScheduler.destroy();
            };
        }
    }, [contextScheduler, localScheduler]);

    return ref.current;
}

/**
 * Use Coroutine
 * @param factory Coroutine
 * @param options Coroutine Options
 */
export function useCoroutine<T>(
    factory: () => AnyGenerator<T>,
    options: UseCoroutineOptions<T> = {}
): UseCoroutineReturn<T> {
    const {
        priority,
        autoStart = true,
        scheduler: externalScheduler,
        ...schedulerOpts
    } = options;

    // Get scheduler: from props, context or create new local
    const contextScheduler = useContext(SchedulerContext);
    const [localScheduler] = useState(() =>
        !externalScheduler && !contextScheduler ? createScheduler(schedulerOpts) : null
    );
    const scheduler = externalScheduler ?? contextScheduler ?? localScheduler!;

    // Links
    const schedulerRef = useRef<Scheduler>(scheduler);
    schedulerRef.current = scheduler;
    const handleRef = useRef<CoroutineHandle<any> | null>(null);
    const factoryRef = useRef(factory);
    factoryRef.current = factory;

    // States
    const [status, setStatus] = useState<CoroutineStatus>("idle");
    const [result, setResult] = useState<T | undefined>(undefined);
    const [error, setError] = useState<unknown>(undefined);
    const [pausedFlag, setPausedFlag] = useState(false);

    // Helper function to collect state before new start launched
    const resetState = useCallback(() => {
        setError(undefined);
        setResult(undefined);
        setStatus("running");
        setPausedFlag(false);
    }, []);

    // Start coroutine
    const start = useCallback(() => {
        const sched = schedulerRef.current;
        if (!sched) return;

        // If had active coroutine - do not run new
        if (handleRef.current) {
            const currentState = handleRef.current.getState();
            if (
                currentState === CoroutineState.Running ||
                currentState === CoroutineState.Suspended ||
                currentState === CoroutineState.Pending
            ) {
                return;
            }
        }

        resetState();
        const handle = sched.spawn(factoryRef.current, priority !== undefined ? { priority } : {});
        handleRef.current = handle;

        handle.promise
            .then((value) => {
                if (handleRef.current !== handle) return; // устаревший handle
                setResult(value as T);
                setStatus("completed");
            })
            .catch((err) => {
                if (handleRef.current !== handle) return;
                setError(err);
                const state = handle.getState();
                setStatus(state === CoroutineState.Cancelled ? "cancelled" : "failed");
            })
            .finally(() => {
                if (handleRef.current === handle) {
                    handleRef.current = null;
                }
            });
    }, [priority, resetState]);

    // Cancel
    const cancel = useCallback(() => {
        handleRef.current?.cancel();
    }, []);

    // Pause
    const pause = useCallback(() => {
        const handle = handleRef.current;
        if (handle) {
            const sched = schedulerRef.current;
            if (sched && "pause" in sched) {
                (sched as Scheduler).pause(handle.id);
            }
            setPausedFlag(true);
            setStatus("suspended");
        }
    }, []);

    // Resume
    const resume = useCallback(() => {
        const handle = handleRef.current;
        if (handle) {
            const sched = schedulerRef.current;
            if (sched && "resume" in sched) {
                (sched as Scheduler).resume(handle.id);
            }
            setPausedFlag(false);
            setStatus("running");
        }
    }, []);

    // Change priority
    const setPriority = useCallback((p: number) => {
        handleRef.current?.setPriority(p);
    }, []);

    // Autostart
    useEffect(() => {
        if (autoStart) start();
    }, [autoStart, start]);

    // Clear on unmount
    useEffect(() => {
        const sched = localScheduler;
        return () => {
            handleRef.current?.cancel();
            if (sched) {
                sched.destroy();
            }
        };
    }, [localScheduler]);

    const isRunning = useMemo(
        () => status === "running" || status === "suspended",
        [status]
    );
    const isPaused = pausedFlag;

    return {
        status,
        result,
        error,
        start,
        cancel,
        pause,
        resume,
        setPriority,
        isRunning,
        isPaused,
    };
}

/**
 * Create local scheduler
 * @param options {SchedulerOptions} Scheduler options
 */
export function createLocalScheduler(options?: SchedulerOptions): Scheduler {
    return createScheduler(options);
}

/**
 * Use coroutine scope
 * @param options {SchedulerOptions} Scheduler options
 */
export function useCoroutineScope(options?: SchedulerOptions): Scheduler {
    const scheduler = useScheduler(options, true);
    if (!scheduler) throw new Error("Scheduler could not be created");
    return scheduler;
}
