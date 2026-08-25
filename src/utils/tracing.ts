/**
 * TypeScript Coroutines Tracing Utils Implementation
 *
 * This code implements Tracer, which is designed for observability
 * and performance diagnostics in adaptive coroutines. It records
 * key coroutine lifecycle events (queueing, execution start, completion)
 * and collects wait time statistics, which are important for
 * assessing scheduler performance and identifying problems
 * (e.g., starvation, high latency).
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/**
 * Trace Event
 */
export type TraceEvent = {
    id: number;
    priority: number;
    enqueuedAt: number;
    startedAt?: number;
    completedAt?: number;
    waitMs?: number;
    state: string;
};

/**
 * Tracer Implementation
 */
export class Tracer {
    private events: TraceEvent[] = [];
    private waits: number[] = [];
    private enabled: boolean;

    /**
     * Create new tracer
     * @param enabled {boolean} Is enabled
     */
    constructor(enabled : boolean = false) {
        this.enabled = enabled;
    }

    /**
     * Enable tracer
     */
    public enable(): void {
        this.enabled = true;
    }

    /**
     * Disable tracer
     */
    public disable(): void {
        this.enabled = false;
    }

    /**
     * Record enqueue
     * @param id {number} Index of record
     * @param priority {number} Priority
     * @param now {number} Now
     */
    public recordEnqueue(id: number, priority: number, now: number): void {
        if (!this.enabled) return;
        this.events.push({id, priority, enqueuedAt: now, state: "enqueued"});
    }

    /**
     * Start recording
     * @param id {number} Index
     * @param now {number} Now
     */
    public recordStart(id: number, now: number): void {
        if (!this.enabled) return;
        const ev = this.events.find((e) => e.id === id && !e.startedAt);
        if (ev) {
            ev.startedAt = now;
            ev.waitMs = now - ev.enqueuedAt;
            if (ev.waitMs !== undefined) this.waits.push(ev.waitMs);
        }
    }

    /**
     * Complete record
     * @param id {number} Id
     * @param now {number} Now
     * @param state {string} State
     */
    public recordComplete(id: number, now: number, state: string): void {
        if (!this.enabled) return;
        const ev = this.events.find((e) => e.id === id && !e.completedAt);
        if (ev) {
            ev.completedAt = now;
            ev.state = state;
        }
    }

    /**
     * Get p=50 percentile
     */
    public getP50(): number {
        return this.percentile(50);
    }

    /**
     * Get p=99 percentile
     */
    public getP99(): number {
        return this.percentile(99);
    }

    /**
     * Get p=95 percentile
     */
    public getP95(): number {
        return this.percentile(95);
    }

    /**
     * Calculates the p percentile of wait times based on the collected waits. If there is no data, returns 0.
     * @param p {number} Percentile
     */
    public percentile(p: number): number {
        if (this.waits.length === 0) return 0;
        const sorted = [...this.waits].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
    }

    /**
     * Get stats
     */
    public getStats(): { p50: number; p95: number; p99: number; count: number; avg: number } {
        const avg = this.waits.length > 0 ? this.waits.reduce((a, b) => a + b, 0) / this.waits.length : 0;
        return {p50: this.getP50(), p95: this.getP95(), p99: this.getP99(), count: this.waits.length, avg};
    }

    /**
     * Convert to OTEL
     */
    public toOTEL(): { resource: string; metrics: ReturnType<Tracer["getStats"]>; events: TraceEvent[] } {
        return {resource: "ts-adaptive-coroutines", metrics: this.getStats(), events: [...this.events]};
    }

    /**
     * Reset tracer
     */
    public reset(): void {
        this.events.length = 0;
        this.waits.length = 0;
    }
}
