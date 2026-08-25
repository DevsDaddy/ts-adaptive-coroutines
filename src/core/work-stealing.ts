/**
 * TypeScript Coroutines Work Stealing Implementation
 *
 * This code implements data structures for work-stealing,
 * a classic load balancing strategy in multithreaded systems.
 * In the context of adaptive coroutines, this allows for
 * efficient distribution of ready-to-run coroutines across
 * multiple threads (workers), minimizing downtime and
 * ensuring high resource utilization.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import type {Coroutine} from "./coroutine";

/**
 * Stealable Queue
 */
export type StealableQueue<T> = {
    push: (item: T) => void;
    pop: () => T | undefined;
    steal: () => T | undefined;
    size: number;
    isEmpty: boolean;
};

/**
 * Deque Implementation
 */
export class Deque<T> implements StealableQueue<T> {
    private data: T[] = [];

    /**
     * Push item
     * @param item {any} Item
     */
    public push(item: T): void {
        this.data.push(item);
    }

    /**
     * Pop item
     */
    public pop(): T | undefined {
        return this.data.pop();
    }

    /**
     * Steal item
     */
    public steal(): T | undefined {
        return this.data.shift();
    }

    /**
     * Get size of deque
     */
    public get size(): number {
        return this.data.length;
    }

    /**
     * Check if deque is empty
     */
    public get isEmpty(): boolean {
        return this.data.length === 0;
    }

    /**
     * Convert deque to array
     */
    public toArray(): T[] {
        return [...this.data];
    }
}

/**
 * Work stealing pool
 */
export class WorkStealingPool {
    private deques: Deque<{ coro: Coroutine<unknown>; effective: number; enqueuedAt: number }>[] = [];
    private channelBackpressure: Map<number, number> = new Map();

    /**
     * Create Work Stealing Pool
     * @param numWorkers {number} Num of workers
     */
    constructor(private readonly numWorkers: number) {
        for (let i = 0; i < numWorkers; i++) this.deques.push(new Deque());
    }

    /**
     * Get size of pool
     */
    public get size(): number {
        return this.deques.reduce((acc, d) => acc + d.size, 0);
    }

    /**
     * Push to pool
     * @param workerId {number} Worker id
     * @param item { { coro: Coroutine, effective: number, enqueuedAt: number }} Item to push in pool
     */
    public push(workerId: number, item: { coro: Coroutine<unknown>; effective: number; enqueuedAt: number }): void {
        const deque = this.deques[workerId % this.numWorkers]!;
        const backpressure = this.channelBackpressure.get(workerId) ?? 0;
        if (backpressure > 1000) return;
        deque.push(item);
    }

    /**
     * Pop item from pool
     * @param workerId {number} Worker id
     */
    public pop(workerId: number): { coro: Coroutine<unknown>; effective: number; enqueuedAt: number } | undefined {
        const deque = this.deques[workerId % this.numWorkers]!;
        const item = deque.pop();
        if (item) return item;
        return this.steal(workerId);
    }

    /**
     * Steal item from pool
     * @param workerId {number} Worker id
     */
    public steal(workerId: number): { coro: Coroutine<unknown>; effective: number; enqueuedAt: number } | undefined {
        for (let i = 0; i < this.numWorkers; i++) {
            if (i === workerId % this.numWorkers) continue;
            const victim = this.deques[i]!;
            if (!victim.isEmpty) {
                const item = victim.steal();
                if (item) return item;
            }
        }
        return undefined;
    }

    /**
     * Set back pressure
     * @param workerId {number} Worker id
     * @param queueSize {number} Queue size
     */
    public setBackpressure(workerId: number, queueSize: number): void {
        this.channelBackpressure.set(workerId, queueSize);
    }

    /**
     * Get back pressure
     * @param workerId {number} Worker id
     */
    public getBackpressure(workerId: number): number {
        return this.channelBackpressure.get(workerId) ?? 0;
    }

    /**
     * Clear pool
     */
    public clear(): void {
        for (const d of this.deques) {
            while (!d.isEmpty) d.pop();
        }
    }

    /**
     * Peek all items
     */
    public peekAll(): { coro: Coroutine<unknown>; effective: number; enqueuedAt: number }[] {
        return this.deques.flatMap((d) => d.toArray());
    }
}
