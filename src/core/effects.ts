/**
 * TypeScript Coroutines Effects Implementation
 *
 * This code defines a system of effects - declarative
 * instructions that coroutines return via yield to control
 * their execution.
 *
 * Instead of directly calling asynchronous functions or
 * synchronization primitives, a coroutine yields an effect
 * object, and the scheduler (the coroutine runtime)
 * interprets it and decides what to do:
 * pause the coroutine, continue later, start
 * another coroutine, etc.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/**
 * Effect types
 */
export const EFFECT_TYPE = {
    YIELD: "yield",
    SLEEP: "sleep",
    FORK: "fork",
    CANCEL: "cancel",
    ALL: "all",
    RACE: "race",
    CALL: "call",
    AWAIT: "await",
    YIELD_EVERY: "yieldEvery",
    SET_PRIORITY: "setPriority",
} as const;

/* Effect type */
export type EffectType = (typeof EFFECT_TYPE)[keyof typeof EFFECT_TYPE];

/**
 * Base effect
 */
export interface BaseEffect<T extends string> {
    readonly _effect: T;
}

/**
 * Yield Effect
 */
export interface YieldEffect extends BaseEffect<"yield"> {
    readonly _effect: "yield";
}

/**
 * Sleep Effect
 */
export interface SleepEffect extends BaseEffect<"sleep"> {
    readonly _effect: "sleep";
    readonly ms: number;
}

/**
 * Fork Effect
 */
export interface ForkEffect extends BaseEffect<"fork"> {
    readonly _effect: "fork";
    readonly factory: CoroutineFactory<unknown>;
    readonly priority?: number | undefined;
}

/**
 * Cancel Effect
 */
export interface CancelEffect extends BaseEffect<"cancel"> {
    readonly _effect: "cancel";
    readonly handleId?: number | undefined;
}

/**
 * All Effect
 */
export interface AllEffect extends BaseEffect<"all"> {
    readonly _effect: "all";
    readonly factories: CoroutineFactory<unknown>[];
}

/**
 * Race Effect
 */
export interface RaceEffect extends BaseEffect<"race"> {
    readonly _effect: "race";
    readonly factories: CoroutineFactory<unknown>[];
}

/**
 * Call Effect
 */
export interface CallEffect<T> extends BaseEffect<"call"> {
    readonly _effect: "call";
    readonly fn: () => T | Promise<T>;
}

/**
 * Await Effect
 */
export interface AwaitEffect<T> extends BaseEffect<"await"> {
    readonly _effect: "await";
    readonly promise: Promise<T>;
}

/**
 * Yield Every Effect
 */
export interface YieldEveryEffect extends BaseEffect<"yieldEvery"> {
    readonly _effect: "yieldEvery";
    readonly every: number;
    readonly counter: { count: number };
}

/**
 * Set Priority Effect
 */
export interface SetPriorityEffect extends BaseEffect<"setPriority"> {
    readonly _effect: "setPriority";
    readonly priority: number;
}

/**
 * Effects
 */
export type Effect =
    | YieldEffect
    | SleepEffect
    | ForkEffect
    | CancelEffect
    | AllEffect
    | RaceEffect
    | CallEffect<unknown>
    | AwaitEffect<unknown>
    | YieldEveryEffect
    | SetPriorityEffect;

/**
 * Coroutine Factory
 */
export type CoroutineFactory<T> = () => Generator<Effect | unknown, T, unknown> | AsyncGenerator<Effect | unknown, T, unknown>;

/**
 * Yield main
 */
export function yieldMain(): YieldEffect {
    return { _effect: "yield" };
}

/**
 * Sleep
 * @param ms {number} Sleep timeout in ms
 */
export function sleep(ms: number): SleepEffect {
    return { _effect: "sleep", ms };
}

/**
 * Fork
 * @param factory {CoroutineFactory} Coroutine factory
 * @param priority {number} Priority
 */
export function fork<T>(factory: CoroutineFactory<T>, priority?: number): ForkEffect {
    return { _effect: "fork", factory, priority };
}

/**
 * Cancel
 * @param handleId {number} Handle ID
 */
export function cancel(handleId?: number): CancelEffect {
    return { _effect: "cancel", handleId };
}

/**
 * All
 * @param factories {CoroutineFactory[]} Coroutine factories
 */
export function all(factories: CoroutineFactory<unknown>[]): AllEffect {
    return { _effect: "all", factories };
}

/**
 * Race
 * @param factories {CoroutineFactory[]} Coroutine factories
 */
export function race(factories: CoroutineFactory<unknown>[]): RaceEffect {
    return { _effect: "race", factories };
}

/**
 * Call
 * @param fn
 */
export function call<T>(fn: () => T | Promise<T>): CallEffect<T> {
    return { _effect: "call", fn };
}

/**
 * Await promise
 * @param promise {Promise} Promise to await
 */
export function awaitPromise<T>(promise: Promise<T>): AwaitEffect<T> {
    return { _effect: "await", promise };
}

/**
 * Yield every
 * @param every {number} Number of yield every
 * @param counter {{ count: number }} Counter
 */
export function yieldEvery(every: number, counter = { count: 0 }): YieldEveryEffect {
    return { _effect: "yieldEvery", every, counter };
}

/**
 * Set priority
 * @param priority {number} Priority
 */
export function setPriority(priority: number): SetPriorityEffect {
    return { _effect: "setPriority", priority };
}

/**
 * Is effect
 * @param value {any} value to check
 */
export function isEffect(value: unknown): value is Effect {
    return (
        typeof value === "object" &&
        value !== null &&
        "_effect" in value &&
        typeof (value as { _effect: unknown })._effect === "string"
    );
}
