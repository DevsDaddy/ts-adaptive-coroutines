/**
 * TypeScript Coroutines Pool Implementation
 *
 * This code implements an object pool, reduces the
 * load on the garbage collector (GC) and reduces
 * the overhead of allocation, which is especially
 * important for the performance of coroutines.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/**
 * Pooled mark interface
 */
export interface IPooled {
    __poolId?: number;
}

/**
 * Pool factory
 */
export interface PoolFactory<T> {
    create(): T;

    reset(item: T): void;
}

/**
 * Pool implementation
 */
export class Pool<T extends object> {
    private free: T[] = [];
    private created = 0;

    /**
     * Create new pool
     * @param factory {PoolFactory} Pool factory
     * @param maxSize {number} Max pool size
     * @param resetOnRelease {boolean} Reset on release or not
     */
    constructor(
        private readonly factory: PoolFactory<T>,
        private readonly maxSize: number = 1024,
        private readonly resetOnRelease: boolean = true,
    ) {
    }

    /**
     * Return pool size
     */
    public get size(): number {
        return this.free.length;
    }

    /**
     * Return total number of created elements
     */
    public get totalCreated(): number {
        return this.created;
    }

    /**
     * Acquire pool
     */
    public acquire(): T {
        const item = this.free.pop();
        if (item !== undefined) return item;
        this.created++;
        return this.factory.create();
    }

    /**
     * Release item from pool
     * @param item {any} Item
     */
    public release(item: T): void {
        if (this.resetOnRelease) this.factory.reset(item);
        if (this.free.length < this.maxSize) this.free.push(item);
    }

    /**
     * Drain pool
     */
    public drain(): void {
        this.free.length = 0;
    }

    /**
     * Pre-allocate
     * @param count {number} Count for allocate
     */
    public prealloc(count: number): void {
        for (let i = 0; i < count; i++) {
            if (this.free.length >= this.maxSize) break;
            this.free.push(this.factory.create());
            this.created++;
        }
    }
}

/**
 * Create pool
 * @param create {Function} Callback function (create new object instance)
 * @param reset {Function} Callback function (reset object in pool)
 * @param maxSize {number} Maximal size of pool
 */
export function createPool<T extends object>(create: () => T, reset: (item: T) => void, maxSize?: number): Pool<T> {
    return new Pool<T>({create, reset}, maxSize);
}
