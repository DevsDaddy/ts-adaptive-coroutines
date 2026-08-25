/**
 * TypeScript Coroutines High level helpers
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import {Channel} from "./channel";
import {fork, cancel, awaitPromise, sleep, call, Effect} from "./effects";
import type {AnyGenerator, CoroutineHandle} from "./coroutine";

/**
 * For each message from the channel, it starts a worker coroutine.
 * This worker runs indefinitely until the channel closes (or the coroutine is canceled).
 * @param channel {Channel} Channel
 * @param worker { (value: T) => AnyGenerator<R> } Worker
 */
export function takeEvery<T, R = void>(
    channel: Channel<T>,
    worker: (value: T) => AnyGenerator<R>
): () => AnyGenerator<void> {
    return function* () {
        while (true) {
            const value = yield awaitPromise(channel.take());
            if (value === undefined) return;
            // @ts-ignore
            yield fork(() => worker(value));
        }
    };
}

/**
 * When a new message is received, it cancels the previous worker coroutine and starts a new one.
 * @param channel {Channel} Channel
 * @param worker { (value: T) => AnyGenerator<R> } Worker
 */
export function takeLatest<T, R = void>(
    channel: Channel<T>,
    worker: (value: T) => AnyGenerator<R>
): () => AnyGenerator<void> {
    return function* () {
        let current: CoroutineHandle<R> | null = null;
        while (true) {
            const value = yield awaitPromise(channel.take());
            if (value === undefined) {
                if (current) yield cancel(current.id);
                return;
            }
            if (current) {
                yield cancel(current.id);
            }
            // @ts-ignore
            const handle = yield fork(() => worker(value));
            current = handle as unknown as CoroutineHandle<R>;
        }
    };
}

/**
 * Run delay coroutine (sleep analog)
 * @param ms {number} Sleep timeout
 */
export function delay(ms: number): Effect {
    return sleep(ms);
}

/**
 * Limits the frequency of function calls: no more than once per ms milliseconds.
 * Returns a wrapped function that can be called from coroutines.
 * @param ms
 * @param fn
 */
export function throttle<A extends unknown[]>(
    ms: number,
    fn: (...args: A) => void | Promise<void>
): (...args: A) => AnyGenerator<void> {
    let lastCall = 0;
    return function* (...args: A): AnyGenerator<void> {
        const now = Date.now();
        if (now - lastCall >= ms) {
            lastCall = now;
            yield call(() => fn(...args));
        }
    };
}

/**
 * Delays calling a function until ms milliseconds have passed since the last call.
 * Returns a generator that should be run on each event.
 * @param ms
 * @param fn
 */
export function debounce<A extends unknown[]>(
    ms: number,
    fn: (...args: A) => void | Promise<void>
): (...args: A) => AnyGenerator<void> {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    return function* (...args: A): AnyGenerator<void> {
        if (timerId) {
            clearTimeout(timerId);
        }
        timerId = setTimeout(() => {
            void fn(...args);
        }, ms);
    };
}

/**
 * Combines several coroutines and waits for them to complete (similar to all).
 * @param factories
 */
export function runAll(factories: Array<() => AnyGenerator<unknown>>): Effect {
    return {_effect: "all", factories} as Effect;
}

/**
 * Race: waits for the first completed coroutine, cancels the rest.
 * @param factories
 */
export function runRace(factories: Array<() => AnyGenerator<unknown>>): Effect {
    return {_effect: "race", factories} as Effect;
}