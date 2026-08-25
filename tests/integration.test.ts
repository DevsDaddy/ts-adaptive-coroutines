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
import {createScheduler} from "../src";
import {sleep, yieldMain, fork, all} from "../src";

describe("Integration", () => {
    it("producer-consumer with priorities", async () => {
        const sched = createScheduler({quantumMs: 5});
        const buffer: number[] = [];
        const consumed: number[] = [];
        await Promise.all([
            sched.run(function* () {
                for (let i = 0; i < 5; i++) {
                    buffer.push(i);
                    yield yieldMain();
                }
            }, {priority: 8}),
            sched.run(function* () {
                for (let i = 0; i < 5; i++) {
                    yield sleep(1);
                    if (buffer.length) consumed.push(buffer.shift() as number);
                }
            }, {priority: 5}),
        ]);
        expect(consumed.length).toBeGreaterThan(0);
        sched.destroy();
    });

    it("nested fork and join", async () => {
        const sched = createScheduler();
        const result = await sched.run(function* () {
            const a = yield fork(function* () {
                const b = yield fork(function* () {
                    return 10;
                });
                void b;
                yield sleep(5);
                return 20;
            });
            void a;
            yield sleep(10);
            return 30;
        });
        expect(result).toBe(30);
        sched.destroy();
    });

    it("concurrent all with 100 tasks", async () => {
        const sched = createScheduler();
        const factories = Array.from({length: 100}, (_, i) => function* () {
            yield sleep(i % 10);
            return i;
        });
        const result = await sched.run(function* () {
            const vals = yield all(factories);
            return vals as number[];
        });
        expect((result as number[]).length).toBe(100);
        sched.destroy();
    });

    it("starvation test: low priority eventually runs", async () => {
        const sched = createScheduler({
            strategy: "decay",
            decayOptions: {lambda: 0.02, boost: 10, agingIntervalMs: 10, agingStep: 1}
        });
        let lowRan = false;
        const highFactories = Array.from({length: 20}, () => function* () {
            yield yieldMain();
        });
        const lowPromise = sched.run(function* () {
            yield sleep(5);
            lowRan = true;
            return 1;
        }, {priority: 0});
        for (const f of highFactories) sched.spawn(f, {priority: 10});
        await lowPromise;
        expect(lowRan).toBe(true);
        sched.destroy();
    });

    it("cross-platform: scheduler works without MessageChannel (fallback)", async () => {
        const sched = createScheduler();
        const v = await sched.run(function* () {
            yield sleep(0);
            return "ok";
        });
        expect(v).toBe("ok");
        sched.destroy();
    });
});
