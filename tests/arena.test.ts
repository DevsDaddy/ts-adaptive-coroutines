/**
 * TypeScript Coroutines Test
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import {describe, it, expect} from "vitest";
import {Arena, PooledArena} from "../src";

describe("Arena", () => {
    it("alloc and read/write", () => {
        const arena = new Arena(1024);
        const off = arena.alloc(8);
        arena.writeInt32(off, 42);
        arena.writeFloat64(off + 4, 3.14);
        expect(arena.readInt32(off)).toBe(42);
        expect(arena.readFloat64(off + 4)).toBeCloseTo(3.14);
        expect(arena.used).toBeGreaterThan(0);
    });

    it("allocAligned respects alignment", () => {
        const arena = new Arena(1024);
        arena.alloc(1);
        const off = arena.allocAligned(4, 8);
        expect(off % 8).toBe(0);
    });

    it("mark/reset", () => {
        const arena = new Arena(1024);
        const m0 = arena.mark();
        arena.alloc(100);
        const m1 = arena.mark();
        expect(m1).toBeGreaterThan(m0);
        arena.reset(m0);
        expect(arena.used).toBe(m0);
    });

    it("throws on overflow", () => {
        const arena = new Arena(16);
        arena.alloc(16);
        expect(() => arena.alloc(1)).toThrow(RangeError);
    });

    it("grow extends capacity", () => {
        const arena = new Arena(16);
        arena.alloc(16);
        arena.grow(32);
        expect(arena.capacity).toBe(32);
        expect(() => arena.alloc(8)).not.toThrow();
    });

    it("bytes and view", () => {
        const arena = new Arena(64);
        const off = arena.alloc(4);
        const bytes = arena.bytes(off, 4);
        bytes[0] = 99;
        expect(arena.bytes(off, 4)[0]).toBe(99);
        expect(arena.view(off, 4).getUint8(0)).toBe(99);
    });

    it("transfer creates new buffer", () => {
        const arena = new Arena(64);
        arena.alloc(8);
        const buf = arena.transfer();
        expect(buf.byteLength).toBe(64);
        expect(arena.used).toBe(0);
    });
});

describe("PooledArena", () => {
    it("acquire/release reuse", () => {
        const pool = new PooledArena(64, 2);
        const a1 = pool.acquire();
        a1.alloc(10);
        pool.release(a1);
        const a2 = pool.acquire();
        expect(a2.used).toBe(0);
    });

    it("creates new when pool empty", () => {
        const pool = new PooledArena(64, 1);
        const a1 = pool.acquire();
        const a2 = pool.acquire();
        expect(a1).not.toBe(a2);
    });
});
