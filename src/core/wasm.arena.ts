/**
 * TypeScript Coroutines WASM-Based Arena Implementation
 *
 * This code implements an extension of the basic Arena
 * capabilities through two additional mechanisms:
 * 1) WebAssembly (WASM): for accelerating memory allocation
 * operations (bump allocator) using native code.
 * 2) SharedArrayBuffer (SAB) + Atomics - for safely sharing
 * an arena between multiple threads (e.g. Web Workers).
 *
 * This allows the adaptive coroutine library to operate in
 * a multithreaded environment and achieve high allocation
 * performance, which is critical for systems with a large
 * number of short-lived coroutines.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import {Arena} from "./arena";

/**
 * WASM Bump Implementation
 */
const WASM_BUMP = `(module
  (memory (export "mem") 256)
  (global $off (mut i32) (i32.const 0))
  (func (export "alloc") (param $size i32) (param $align i32) (result i32)
    (local $aligned i32)
    (local.set $aligned (i32.and (i32.add (global.get $off) (i32.sub (local.get $align) (i32.const 1))) (i32.sub (i32.const 0) (local.get $align))))
    (if (i32.gt_u (i32.add (local.get $aligned) (local.get $size)) (i32.mul (memory.size) (i32.const 65536))) (then (unreachable)))
    (global.set $off (i32.add (local.get $aligned) (local.get $size)))
    (local.get $aligned))
  (func (export "reset") (param $mark i32) (global.set $off (local.get $mark)))
  (func (export "mark") (result i32) (global.get $off))
  (func (export "grow") (param $pages i32) (result i32) (memory.grow (local.get $pages)))
)`;

/**
 * Try to create WASM Arena
 * @param capacity {number} Capacity
 */
function tryCreateWasm(capacity: number): { instance: WebAssembly.Instance; mem: WebAssembly.Memory } | null {
    try {
        if (typeof WebAssembly === "undefined") return null;
        const pages = Math.ceil(capacity / 65536);
        const wasmBytes = Uint8Array.from(atob(WASM_BUMP_BASE64), (c) => c.charCodeAt(0));
        const mod = new WebAssembly.Module(wasmBytes);
        const instance = new WebAssembly.Instance(mod, {});
        const mem = instance.exports["mem"] as WebAssembly.Memory;
        if (mem.buffer.byteLength < capacity) {
            const need = Math.ceil((capacity - mem.buffer.byteLength) / 65536);
            (instance.exports["grow"] as (n: number) => number)(need);
        }
        return {instance, mem};
    } catch {
        return null;
    }
}

/* Convert WASM to Bsae64 */
const WASM_BUMP_BASE64 = btoa(WASM_BUMP);

/**
 * WASM Arena Implementation
 */
export class WasmArena {
    private arena: Arena;
    private wasm: { instance: WebAssembly.Instance; mem: WebAssembly.Memory } | null = null;
    private useWasm = false;
    private sabOffset: Int32Array | null = null;

    /**
     * Create WASM-Based Arena
     * @param capacity {number} Capacity
     * @param shared {boolean} Use shared array
     */
    constructor(
        capacity: number = 16 * 1024 * 1024,
        private readonly shared: boolean = false,
    ) {
        if (shared && typeof SharedArrayBuffer !== "undefined") {
            try {
                const sab = new SharedArrayBuffer(capacity);
                this.arena = new Arena(capacity);
                (this.arena as unknown as { _buffer: ArrayBuffer })._buffer = sab as unknown as ArrayBuffer;
                (this.arena as unknown as { _view: DataView })._view = new DataView(sab);
                (this.arena as unknown as { _u8: Uint8Array })._u8 = new Uint8Array(sab);
                this.sabOffset = new Int32Array(sab, 0, 1);
                Atomics.store(this.sabOffset, 0, 0);
                this.useWasm = false;
                return;
            } catch {
            }
        }
        const w = tryCreateWasm(capacity);
        if (w) {
            this.wasm = w;
            this.useWasm = true;
            this.arena = new Arena(0);
            (this.arena as unknown as { _buffer: ArrayBuffer })._buffer = w.mem.buffer;
            (this.arena as unknown as { _view: DataView })._view = new DataView(w.mem.buffer);
            (this.arena as unknown as { _u8: Uint8Array })._u8 = new Uint8Array(w.mem.buffer);
        } else {
            this.arena = new Arena(capacity);
        }
    }

    /**
     * Get arena capacity
     */
    public get capacity(): number {
        return this.arena.capacity;
    }

    /**
     * Get used
     */
    public get used(): number {
        if (this.useWasm && this.wasm) return (this.wasm.instance.exports["mark"] as () => number)();
        if (this.sabOffset) return Atomics.load(this.sabOffset, 0);
        return this.arena.used;
    }

    /**
     * Allocate aligned
     * @param size {number} Size for allocation
     * @param align {number} Align
     */
    public allocAligned(size: number, align: number = 8): number {
        if (this.sabOffset) {
            let off: number;
            do {
                const cur = Atomics.load(this.sabOffset, 0);
                const aligned = (cur + (align - 1)) & ~(align - 1);
                const next = aligned + size;
                if (next > this.capacity) throw new RangeError("WasmArena overflow");
                if (Atomics.compareExchange(this.sabOffset, 0, cur, next) === cur) {
                    off = aligned;
                    break;
                }
            } while (true);
            return off!;
        }
        if (this.useWasm && this.wasm) {
            return (this.wasm.instance.exports["alloc"] as (s: number, a: number) => number)(size, align);
        }
        return this.arena.allocAligned(size, align);
    }

    /**
     * Mark allocation
     */
    public mark(): number {
        if (this.sabOffset) return Atomics.load(this.sabOffset, 0);
        if (this.useWasm && this.wasm) return (this.wasm.instance.exports["mark"] as () => number)();
        return this.arena.used;
    }

    /**
     * Reset arena
     * @param mark {number} Current mark
     */
    public reset(mark: number = 0): void {
        if (this.sabOffset) {
            Atomics.store(this.sabOffset, 0, mark);
            return;
        }
        if (this.useWasm && this.wasm) {
            (this.wasm.instance.exports["reset"] as (m: number) => void)(mark);
            return;
        }
        this.arena.reset(mark);
    }

    /**
     * Get arena buffer
     */
    public get buffer(): ArrayBuffer | SharedArrayBuffer {
        return this.arena.buffer;
    }

    /**
     * View arena buffer
     * @param offset {number} Offset
     * @param size {number} Size
     */
    public view(offset: number, size: number): DataView {
        return this.arena.view(offset, size);
    }

    /**
     * Get arena bytes with offset
     * @param offset {number} Offset
     * @param size {number} Size
     */
    public bytes(offset: number, size: number): Uint8Array {
        return this.arena.bytes(offset, size);
    }

    /**
     * Free arena
     */
    public free(): void {
        this.reset(0);
    }

    /**
     * Slice arena
     */
    public slice(): ArrayBuffer {
        return this.arena.slice();
    }

    /**
     * Grow arena
     * @param newCapacity {number} New capacity
     */
    public grow(newCapacity: number): void {
        this.arena.grow(newCapacity);
    }

    /**
     * Write Int32 Value
     * @param offset {number} Offset
     * @param value {number} Int32 Value
     */
    public writeInt32(offset: number, value: number): void {
        this.arena.writeInt32(offset, value);
    }

    /**
     * Read Int32 Value
     * @param offset {number} Offset
     */
    public readInt32(offset: number): number {
        return this.arena.readInt32(offset);
    }

    /**
     * Write Float64 Value
     * @param offset {offset} Offset
     * @param value {number} Float64 Value
     */
    public writeFloat64(offset: number, value: number): void {
        this.arena.writeFloat64(offset, value);
    }

    /**
     * Read Float64
     * @param offset {number} Offset
     */
    public readFloat64(offset: number): number {
        return this.arena.readFloat64(offset);
    }

    /**
     * Transfer memory
     */
    public transfer(): ArrayBuffer {
        return this.arena.transfer();
    }

    /**
     * Get remaining bytes in arena
     */
    public get remaining(): number {
        return this.capacity - this.used;
    }

    /**
     * Allocate buffer in arena
     * @param size {number} Size to allocate
     */
    public alloc(size: number): number {
        return this.allocAligned(size, 1);
    }
}
