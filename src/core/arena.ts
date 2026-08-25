/**
 * TypeScript Coroutines Arena Implementation
 *
 * Arenas are a special approach to memory management.
 *
 * In our case, they are needed to:
 * - Switching between coroutines doesn't require copying memory; the arena pointer simply changes.
 * - There are no overheads for malloc/free or garbage collection for each small allocation.
 * - All coroutine memory is isolated, simplifying debugging and preventing leaks.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/**
 * Basic Arena Interface
 */
export interface IArena {
    readonly capacity: number;
    readonly used: number;
    readonly buffer: ArrayBuffer;

    alloc(size: number): number;

    allocAligned(size: number, align?: number): number;

    reset(mark?: number): void;

    view(offset: number, size: number): DataView;

    bytes(offset: number, size: number): Uint8Array;

    free(): void;
}

/**
 * Basic Arena Implementation
 */
export class Arena implements IArena {
    // Offsets and buffer
    private _offset = 0;
    private _buffer: ArrayBuffer;
    private _view: DataView;
    private _u8: Uint8Array;

    /**
     * Create arena
     * @param capacity {number} Arena capacity
     */
    constructor(capacity: number = 16 * 1024 * 1024) {
        this._buffer = new ArrayBuffer(capacity);
        this._view = new DataView(this._buffer);
        this._u8 = new Uint8Array(this._buffer);
    }

    /**
     * Return current capacity
     */
    public get capacity(): number {
        return this._buffer.byteLength;
    }

    /**
     * Return used bytes offset
     */
    public get used(): number {
        return this._offset;
    }

    /**
     * Return current buffer
     */
    public get buffer(): ArrayBuffer {
        return this._buffer;
    }

    /**
     * Return remaining bytes in arena
     */
    public get remaining(): number {
        return this.capacity - this._offset;
    }

    /**
     * Allocate memory
     * @param size {number} Size for allocation
     */
    public alloc(size: number): number {
        return this.allocAligned(size, 1);
    }

    /**
     * Allocate aligned
     * @param size {number} Size for allocation
     * @param align {number} Align
     */
    public allocAligned(size: number, align: number = 8): number {
        const aligned = (this._offset + (align - 1)) & ~(align - 1);
        if (aligned + size > this.capacity) throw new RangeError(`Arena overflow: need ${size}, remaining ${this.remaining}`);
        this._offset = aligned + size;
        return aligned;
    }

    /**
     * Reset from
     * @param mark {number} Mark
     */
    public reset(mark: number = 0): void {
        if (mark < 0) mark = 0;
        if (mark > this.capacity) mark = this.capacity;
        this._offset = mark;
    }

    /**
     * View memory from offset
     * @param offset {number} Offset
     * @param size {number} Size of memory for view
     */
    public view(offset: number, size: number): DataView {
        return new DataView(this._buffer, offset, size);
    }

    /**
     * Get bytes with offset
     * @param offset {number} Offset
     * @param size {number} Size of memory to get bytes
     */
    public bytes(offset: number, size: number): Uint8Array {
        return new Uint8Array(this._buffer, offset, size);
    }

    /**
     * Write Int32 Value
     * @param offset {number} Offset
     * @param value {number} Int32 Value
     */
    public writeInt32(offset: number, value: number): void {
        this._view.setInt32(offset, value, true);
    }

    /**
     * Read Int32 Value
     * @param offset {number} Offset
     */
    public readInt32(offset: number): number {
        return this._view.getInt32(offset, true);
    }

    /**
     * Write Float64 Value
     * @param offset {offset} Offset
     * @param value {number} Float64 Value
     */
    public writeFloat64(offset: number, value: number): void {
        this._view.setFloat64(offset, value, true);
    }

    /**
     * Read Float64
     * @param offset {number} Offset
     */
    public readFloat64(offset: number): number {
        return this._view.getFloat64(offset, true);
    }

    /**
     * Transfer memory
     */
    public transfer(): ArrayBuffer {
        const buf = this._buffer;
        this._buffer = new ArrayBuffer(this.capacity);
        this._view = new DataView(this._buffer);
        this._u8 = new Uint8Array(this._buffer);
        this._offset = 0;
        return buf;
    }

    /**
     * Free memory
     */
    public free(): void {
        this._offset = 0;
    }

    /**
     * Slice memory
     */
    public slice(): ArrayBuffer {
        return this._buffer.slice(0, this._offset);
    }

    /**
     * Grow memory in arena
     * @param newCapacity {number} New capacity
     */
    public grow(newCapacity: number): void {
        if (newCapacity <= this.capacity) return;
        const next = new ArrayBuffer(newCapacity);
        new Uint8Array(next).set(this._u8);
        this._buffer = next;
        this._view = new DataView(next);
        this._u8 = new Uint8Array(next);
    }
}

/**
 * Pooled Arena
 */
export class PooledArena {
    // Available arenas
    private arenas: Arena[] = [];

    /**
     * Create pooled arena
     * @param arenaSize {number} Arena size
     * @param poolSize {number} Pool size
     */
    constructor(
        private readonly arenaSize: number = 64 * 1024,
        private readonly poolSize: number = 8,
    ) {
        for (let i = 0; i < poolSize; i++) this.arenas.push(new Arena(arenaSize));
    }

    /**
     * Acquire arena
     */
    public acquire(): Arena {
        const arena = this.arenas.pop();
        if (arena) {
            arena.reset(0);
            return arena;
        }
        return new Arena(this.arenaSize);
    }

    /**
     * Release arena
     * @param arena {Arena} Arena instance
     */
    public release(arena: Arena): void {
        arena.reset(0);
        if (this.arenas.length < this.poolSize) this.arenas.push(arena);
    }
}
