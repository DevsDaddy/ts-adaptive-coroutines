/**
 * TypeScript Coroutines Channels and Semaphore Implementation
 *
 * Here is an implementation of typical primitives for organizing
 * interaction in concurrent systems, including our adaptive coroutines.
 *
 * They include three main parts:
 * 1) Channel buffers (slidingBuffer, droppingBuffer, fixedBuffer) are strategies for storing messages when the consumer does not keep up with the producer.
 * 2) Channel is an abstraction for passing values with support for asynchronous waits (put/take) and non-blocking attempts (tryPut/tryTake).
 * 3) Semaphore is a limiter on the number of simultaneous accesses to a resource or execution of tasks.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/**
 * Channel buffer type
 */
export type ChannelBuffer<T> = {
    push: (v: T) => boolean;
    shift: () => T | undefined;
    size: number;
    capacity: number;
};

/**
 * Sliding buffer
 * @param capacity {number} Capacity
 */
export function slidingBuffer<T>(capacity: number): ChannelBuffer<T> {
    const buf: T[] = [];
    return {
        push(v: T) {
            if (buf.length >= capacity) buf.shift();
            buf.push(v);
            return true;
        },
        shift() {
            return buf.shift();
        },
        get size() {
            return buf.length;
        },
        capacity,
    };
}

/**
 * Dropping buffer
 * @param capacity {number} Capacity
 */
export function droppingBuffer<T>(capacity: number): ChannelBuffer<T> {
    const buf: T[] = [];
    return {
        push(v: T) {
            if (buf.length < capacity) buf.push(v);
            return buf.length <= capacity;
        },
        shift() {
            return buf.shift();
        },
        get size() {
            return buf.length;
        },
        capacity,
    };
}

/**
 * Fixed buffer
 * @param capacity {number} Capacity
 */
export function fixedBuffer<T>(capacity: number): ChannelBuffer<T> {
    const buf: T[] = [];
    return {
        push(v: T) {
            if (buf.length >= capacity) return false;
            buf.push(v);
            return true;
        },
        shift() {
            return buf.shift();
        },
        get size() {
            return buf.length;
        },
        capacity,
    };
}

/**
 * Basic Channel Implementation
 */
export class Channel<T> {
    // Buffer and operations
    private buffer: ChannelBuffer<T>;
    private takers: Array<(v: T | undefined) => void> = [];
    private putters: Array<{ value: T; resolve: (v: boolean) => void }> = [];
    private closed = false;

    /**
     * Create Channel
     * @param buffer {ChannelBuffer} Channel buffer
     */
    constructor(buffer: ChannelBuffer<T> = fixedBuffer<T>(0)) {
        this.buffer = buffer;
    }

    /**
     * Check if channel is closed
     */
    public get isClosed(): boolean {
        return this.closed;
    }

    /**
     * Close channel
     */
    public close(): void {
        this.closed = true;
        while (this.takers.length > 0) {
            const taker = this.takers.shift()!;
            taker(undefined);
        }
    }

    /**
     * Put to channel
     * @param value {any} Value
     */
    public async put(value: T): Promise<boolean> {
        if (this.closed) return false;
        if (this.takers.length > 0) {
            const taker = this.takers.shift()!;
            taker(value);
            return true;
        }
        if (this.buffer.push(value)) return true;
        return new Promise<boolean>((resolve) => {
            this.putters.push({value, resolve});
        });
    }

    /**
     * Take from channel
     */
    public async take(): Promise<T | undefined> {
        const buffered = this.buffer.shift();
        if (buffered !== undefined) {
            if (this.putters.length > 0) {
                const putter = this.putters.shift()!;
                this.buffer.push(putter.value);
                putter.resolve(true);
            }
            return buffered;
        }
        if (this.putters.length > 0) {
            const putter = this.putters.shift()!;
            putter.resolve(true);
            return putter.value;
        }
        if (this.closed) return undefined;
        return new Promise<T | undefined>((resolve) => {
            this.takers.push(resolve);
        });
    }

    /**
     * Try to put in channel
     * @param value {any} Value
     */
    public tryPut(value: T): boolean {
        if (this.closed) return false;
        if (this.takers.length > 0) {
            const taker = this.takers.shift()!;
            taker(value);
            return true;
        }
        return this.buffer.push(value);
    }

    /**
     * Try to take from channel
     */
    public tryTake(): T | undefined {
        const buffered = this.buffer.shift();
        if (buffered !== undefined) {
            if (this.putters.length > 0) {
                const putter = this.putters.shift()!;
                this.buffer.push(putter.value);
                putter.resolve(true);
            }
            return buffered;
        }
        if (this.putters.length > 0) {
            const putter = this.putters.shift()!;
            putter.resolve(true);
            return putter.value;
        }
        return undefined;
    }
}

/**
 * Semaphore Implementation
 */
export class Semaphore {
    private count: number;
    private waiters: Array<() => void> = [];

    /**
     * Create semaphore
     * @param max {number} Maximal count
     */
    constructor(private readonly max: number) {
        this.count = max;
    }

    /**
     * Get available count
     */
    public get available(): number {
        return this.count;
    }

    /**
     * Acquire
     */
    public async acquire(): Promise<void> {
        if (this.count > 0) {
            this.count--;
            return;
        }
        return new Promise<void>((resolve) => {
            this.waiters.push(resolve);
        });
    }

    /**
     * Release
     */
    public release(): void {
        if (this.waiters.length > 0) {
            const waiter = this.waiters.shift()!;
            waiter();
        } else {
            this.count = Math.min(this.max, this.count + 1);
        }
    }

    /**
     * Try to acquire
     */
    public tryAcquire(): boolean {
        if (this.count > 0) {
            this.count--;
            return true;
        }
        return false;
    }
}
