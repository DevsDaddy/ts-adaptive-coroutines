/**
 * TypeScript Coroutines Atomic Heap Implementation
 *
 * This code introduces the Atomic Heap, which extends the
 * functionality of BinaryHeap by adding thread safety
 * through a spinlock mechanism based on SharedArrayBuffer
 * and atomic operations.
 *
 * The idea is to allow multiple threads (e.g., web workers)
 * to safely access the same heap by serializing access to it.
 *
 * TODO: However, the implementation has an important
 * TODO: limitation: only the access operation is protected,
 * TODO: but the heap data itself (BinaryHeap.data) is stored
 * TODO: in regular (non-shared) JavaScript memory, so it
 * TODO: requires some improvement.
 *
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import {BinaryHeap} from "./heap";

/**
 * Atomic heap based on BinaryHeap with locks
 */
export class AtomicHeap<T> {
    // Binary heap inside
    private heap: BinaryHeap<T>;
    private sab: SharedArrayBuffer | null = null;
    private lock: Int32Array | null = null;

    /**
     * Binary heap
     * @param compare {function} Comparator
     * @param shared {boolean} Use shared array buffer
     */
    constructor(
        private readonly compare: (a: T, b: T) => number,
        shared = false,
    ) {
        this.heap = new BinaryHeap<T>(compare);
        if (shared && typeof SharedArrayBuffer !== "undefined") {
            try {
                this.sab = new SharedArrayBuffer(4);
                this.lock = new Int32Array(this.sab);
            } catch {
            }
        }
    }

    /**
     * Get heap size with lock
     */
    public get size(): number {
        return this.withLock(() => this.heap.size);
    }

    /**
     * Check if is empty with lock
     */
    public get isEmpty(): boolean {
        return this.withLock(() => this.heap.isEmpty);
    }

    /**
     * Peek from heap with lock
     */
    public peek(): T | undefined {
        return this.withLock(() => this.heap.peek());
    }

    /**
     * Push item to heap with lock
     * @param item {any} Item to push
     */
    public push(item: T): void {
        this.withLock(() => this.heap.push(item));
    }

    /**
     * Pop rom heap with lock
     */
    public pop(): T | undefined {
        return this.withLock(() => this.heap.pop());
    }

    /**
     * Remove from heap with lock
     * @param predicate {predicate} Predicate
     */
    public remove(predicate: (item: T) => boolean): T | undefined {
        return this.withLock(() => this.heap.remove(predicate));
    }

    /**
     * Clear heap with lock
     */
    public clear(): void {
        this.withLock(() => this.heap.clear());
    }

    /**
     * Convert heap to array with lock
     */
    public toArray(): T[] {
        return this.withLock(() => this.heap.toArray());
    }

    /**
     * Heapify with lock
     */
    public heapify(): void {
        this.withLock(() => this.heap.heapify());
    }

    /**
     * Update all with lock
     * @param fn
     */
    public updateAll(fn: (item: T) => void): void {
        this.withLock(() => this.heap.updateAll(fn));
    }

    // Using lock with atomics
    private withLock<R>(fn: () => R): R {
        if (!this.lock) return fn();
        while (Atomics.compareExchange(this.lock, 0, 0, 1) !== 0) {
        }
        try {
            return fn();
        } finally {
            Atomics.store(this.lock, 0, 0);
        }
    }
}
