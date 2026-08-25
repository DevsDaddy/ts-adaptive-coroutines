/**
 * TypeScript Coroutines Heap Implementation
 *
 * This code implements a binary heap, a classic data
 * structure that provides efficient access to the element
 * with the smallest (or largest, depending on the comparator)
 * key.
 *
 * The scheduler uses a binary heap to store coroutines ready
 * to run, ordered by their effective priority (which may take
 * into account latency). This allows the scheduler to quickly
 * select the next coroutine with the highest priority without
 * reordering the entire queue at each step.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Heap comparator */
export type HeapComparator<T> = (a: T, b: T) => number;

/**
 * Binary Heap Implementation
 */
export class BinaryHeap<T> {
    private data: T[] = [];

    /**
     * Binary heap
     * @param compare {HeapComparator} Heap comparator
     */
    constructor(private readonly compare: HeapComparator<T>) {
    }

    /**
     * Get size of heap
     */
    public get size(): number {
        return this.data.length;
    }

    /**
     * Check if heap is empty
     */
    public get isEmpty(): boolean {
        return this.data.length === 0;
    }

    /**
     * Peek from binary heap
     */
    public peek(): T | undefined {
        return this.data[0];
    }

    /**
     * Push item to binary heap
     * @param item {any} Item to push
     */
    public push(item: T): void {
        this.data.push(item);
        this.bubbleUp(this.data.length - 1);
    }

    /**
     * Pop from binary heap
     */
    public pop(): T | undefined {
        if (this.data.length === 0) return undefined;
        const top = this.data[0] as T;
        const last = this.data.pop() as T;
        if (this.data.length > 0) {
            this.data[0] = last;
            this.bubbleDown(0);
        }
        return top;
    }

    /**
     * Remove from binary heap
     * @param predicate {predicate} Predicate
     */
    public remove(predicate: (item: T) => boolean): T | undefined {
        const idx = this.data.findIndex(predicate);
        if (idx === -1) return undefined;
        const item = this.data[idx] as T;
        const last = this.data.pop() as T;
        if (idx < this.data.length) {
            this.data[idx] = last;
            this.bubbleUp(idx);
            this.bubbleDown(idx);
        }
        return item;
    }

    /**
     * Clear binary heap
     */
    public clear(): void {
        this.data.length = 0;
    }

    /**
     * Convert binary heap to array
     */
    public toArray(): T[] {
        return [...this.data];
    }

    /**
     * Heapify
     */
    public heapify(): void {
        for (let i = (this.data.length >> 1) - 1; i >= 0; i--) this.bubbleDown(i);
    }

    /**
     * Update all items
     * @param fn
     */
    public updateAll(fn: (item: T) => void): void {
        for (const item of this.data) fn(item);
        this.heapify();
    }

    private bubbleUp(idx: number): void {
        while (idx > 0) {
            const parent = (idx - 1) >> 1;
            if (this.compare(this.data[idx] as T, this.data[parent] as T) >= 0) break;
            this.swap(idx, parent);
            idx = parent;
        }
    }

    private bubbleDown(idx: number): void {
        const n = this.data.length;
        while (true) {
            let smallest = idx;
            const left = (idx << 1) + 1;
            const right = left + 1;
            if (left < n && this.compare(this.data[left] as T, this.data[smallest] as T) < 0) smallest = left;
            if (right < n && this.compare(this.data[right] as T, this.data[smallest] as T) < 0) smallest = right;
            if (smallest === idx) break;
            this.swap(idx, smallest);
            idx = smallest;
        }
    }

    private swap(a: number, b: number): void {
        const tmp = this.data[a] as T;
        this.data[a] = this.data[b] as T;
        this.data[b] = tmp;
    }
}
