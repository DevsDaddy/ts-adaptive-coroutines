/**
 * TypeScript Coroutines Priority Implementation
 *
 * This code implements coroutine priority management
 * mechanisms in the scheduler. These priorities
 * determine the order in which the scheduler selects
 * coroutines for execution.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/**
 * Priority level
 */
export type PriorityLevel = number;

/**
 * Priority config
 */
export interface PriorityConfig {
    min: number;                    // Minimal priority level
    max: number;                    // Maximal priority level
    default: number;                // Default priority level
}

/**
 * Default priority configuration
 */
export const DEFAULT_PRIORITY_CONFIG: PriorityConfig = {
    min: 0,
    max: 10,
    default: 5,
};

/**
 * Clamp priority
 * @param value {number} Current value
 * @param config {PriorityConfig} Priority config
 */
export function clampPriority(value: number, config: PriorityConfig = DEFAULT_PRIORITY_CONFIG): number {
    return Math.max(config.min, Math.min(config.max, value | 0));
}

/**
 * Decay options
 */
export interface DecayOptions {
    lambda: number;
    boost: number;
    agingIntervalMs: number;
    agingStep: number;
}

/**
 * Default decay options
 */
export const DEFAULT_DECAY_OPTIONS: DecayOptions = {
    lambda: 0.002,
    boost: 5,
    agingIntervalMs: 100,
    agingStep: 0.5,
};

/**
 * Priority strategy
 */
export interface IPriorityStrategy {
    effectivePriority(base: number, waitMs: number, now: number): number;

    decay(currentEffective: number, base: number, elapsedMs: number): number;

    onEnqueue(base: number, now: number): { base: number; enqueuedAt: number };
}

/**
 * Decay priority strategy
 */
export class DecayPriorityStrategy implements IPriorityStrategy {
    /**
     * Create decay priority strategy
     * @param opts {DecayOptions} Decay options
     * @param config {PriorityConfig} Priority options
     */
    constructor(
        private readonly opts: DecayOptions = DEFAULT_DECAY_OPTIONS,
        private readonly config: PriorityConfig = DEFAULT_PRIORITY_CONFIG,
    ) {
    }

    /**
     * Effective priority
     * @param base {number} Base
     * @param waitMs {number} Wait for ms
     * @param _now {number} Now
     */
    public effectivePriority(base: number, waitMs: number, _now: number): number {
        const boost = this.opts.boost * Math.expm1(-this.opts.lambda * waitMs) * -1;
        const eff = base + boost;
        return Math.max(this.config.min, Math.min(this.config.max, eff));
    }

    /**
     * Decay priority
     * @param _currentEffective {number} Current effective
     * @param base {number} Base
     * @param elapsedMs {number} Elapsed ms
     */
    public decay(_currentEffective: number, base: number, elapsedMs: number): number {
        return this.effectivePriority(base, elapsedMs, 0);
    }

    /**
     * On enqueue
     * @param base {number} Base number
     * @param now {number} Now
     */
    public onEnqueue(base: number, now: number): { base: number; enqueuedAt: number } {
        return {base, enqueuedAt: now};
    }
}

/**
 * Fixed priority strategy
 */
export class FixedPriorityStrategy implements IPriorityStrategy {
    /**
     * Effective priority
     * @param base {number} Base number
     */
    public effectivePriority(base: number): number {
        return base;
    }

    /**
     * Decay priority
     * @param currentEffective {number} Current effective
     */
    public decay(currentEffective: number): number {
        return currentEffective;
    }

    /**
     * On enqueue
     * @param base {number} Base number
     * @param now {number} Now
     */
    public onEnqueue(base: number, now: number): { base: number; enqueuedAt: number } {
        return {base, enqueuedAt: now};
    }
}

/**
 * Priority entry
 */
export class PriorityEntry {
    /**
     * Priority entry
     * @param base {number} Base number
     * @param enqueuedAt {number} Enqueue at
     * @param effective {number} Effective
     */
    constructor(
        public base: number,
        public enqueuedAt: number,
        public effective: number,
    ) {
    }

    /**
     * Recompute entry
     * @param strategy {IPriorityStrategy} Strategy
     * @param now {number} Now
     */
    public recompute(strategy: IPriorityStrategy, now: number): void {
        this.effective = strategy.effectivePriority(this.base, now - this.enqueuedAt, now);
    }
}

/**
 * Compare priority
 * @param a {PriorityEntry}
 * @param b {PriorityEntry}
 */
export function comparePriority(a: PriorityEntry, b: PriorityEntry): number {
    if (a.effective !== b.effective) return b.effective - a.effective;
    return a.enqueuedAt - b.enqueuedAt;
}
