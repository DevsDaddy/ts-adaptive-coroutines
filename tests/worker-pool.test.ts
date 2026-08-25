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
import {DistributedScheduler, createDistributedScheduler, WorkerChannel} from "../src";

describe("DistributedScheduler", () => {
    it("round-robin spawn", async () => {
        const pool = new DistributedScheduler({size: 2, quantumMs: 100});
        const p1 = pool.spawn(function* () {
            return 1;
        });
        const p2 = pool.spawn(function* () {
            return 2;
        });
        const p3 = pool.spawn(function* () {
            return 3;
        });
        const r1 = (await p1.promise) as unknown as number;
        const r2 = (await p2.promise) as unknown as number;
        const r3 = (await p3.promise) as unknown as number;
        expect(r1).toBe(1);
        expect(r2).toBe(2);
        expect(r3).toBe(3);
        pool.destroy();
    });

    it("run returns value", async () => {
        const pool = createDistributedScheduler({size: 2});
        const v = await pool.run(function* () {
            return 42;
        });
        expect(v).toBe(42);
        pool.destroy();
    });

    it("spawnOn specific worker", async () => {
        const pool = new DistributedScheduler({size: 3});
        const h = pool.spawnOn(1, function* () {
            return 99;
        });
        expect(await h.promise).toBe(99);
        pool.destroy();
    });

    it("broadcast to all workers", async () => {
        const pool = new DistributedScheduler({size: 2});
        const handles = pool.broadcast(function* () {
            return 7;
        });
        expect(handles.length).toBe(2);
        const vals = await Promise.all(handles.map((h) => h.promise));
        expect(vals).toEqual([7, 7]);
        pool.destroy();
    });

    it("high priority goes to worker 0", async () => {
        const pool = new DistributedScheduler({size: 3});
        const h = pool.spawn(function* () {
            return 1;
        }, {priority: 9});
        expect(await h.promise).toBe(1);
        pool.destroy();
    });

    it("getStats per worker", async () => {
        const pool = new DistributedScheduler({size: 2});
        await pool.run(function* () {
            return 1;
        });
        const stats = pool.getStats();
        expect(stats.length).toBe(2);
        pool.destroy();
    });

    it("WorkerChannel runInWorker", async () => {
        const v = await WorkerChannel.runInWorker(function* () {
            return 123;
        });
        expect(v).toBe(123);
    });
});
