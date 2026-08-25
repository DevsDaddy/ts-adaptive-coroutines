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
import {Pool, createPool} from "../src";

describe("Pool", () => {
    it("acquire creates new, release reuses", () => {
        let counter = 0;
        const pool = new Pool<{ id: number; v: number }>(
            {
                create: () => ({id: counter++, v: 0}),
                reset: (o) => (o.v = 0),
            },
            10,
        );
        const a = pool.acquire();
        a.v = 99;
        pool.release(a);
        const b = pool.acquire();
        expect(b.v).toBe(0);
        expect(pool.size).toBe(0);
        expect(b).toBe(a);
    });

    it("respects maxSize", () => {
        const pool = createPool(() => ({x: 1}), () => {
        }, 2);
        const a = pool.acquire();
        const b = pool.acquire();
        const c = pool.acquire();
        pool.release(a);
        pool.release(b);
        pool.release(c);
        expect(pool.size).toBe(2);
    });

    it("prealloc", () => {
        const pool = createPool(() => ({x: 1}), () => {
        }, 10);
        pool.prealloc(5);
        expect(pool.size).toBe(5);
        expect(pool.totalCreated).toBe(5);
    });

    it("drain", () => {
        const pool = createPool(() => ({x: 1}), () => {
        }, 10);
        pool.prealloc(3);
        pool.drain();
        expect(pool.size).toBe(0);
    });
});
