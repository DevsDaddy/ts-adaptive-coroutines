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
import {
    Scheduler,
    createScheduler,
    ManualEventLoopAdapter,
    yieldMain,
    sleep,
    fork,
    all,
    race,
    call,
    awaitPromise,
    setPriority,
    yieldEvery,
    CoroutineState
} from "../src";

describe("Scheduler basic", () => {
    it("runs simple generator to completion", async () => {
        const sched = createScheduler({quantumMs: 100});
        const result = await sched.run(function* () {
            return 42;
        });
        expect(result).toBe(42);
        sched.destroy();
    });

    it("yieldMain interleaves", async () => {
        const sched = createScheduler({quantumMs: 100});
        const order: number[] = [];
        const p1 = sched.run(function* () {
            order.push(1);
            yield yieldMain();
            order.push(3);
        });
        const p2 = sched.run(function* () {
            order.push(2);
            yield yieldMain();
            order.push(4);
        });
        await Promise.all([p1, p2]);
        await new Promise((r) => setTimeout(r, 20));
        expect(order).toContain(1);
        expect(order).toContain(2);
        sched.destroy();
    });

    it("priority ordering: high priority first", async () => {
        const loop = new ManualEventLoopAdapter();
        const sched = new Scheduler({eventLoop: loop, strategy: "fixed", quantumMs: 100});
        const order: string[] = [];
        sched.spawn(function* () {
            order.push("low");
        }, {priority: 1});
        sched.spawn(function* () {
            order.push("high");
        }, {priority: 10});
        sched.spawn(function* () {
            order.push("mid");
        }, {priority: 5});
        await sched.tick();
        await sched.tick();
        await sched.tick();
        expect(order[0]).toBe("high");
        expect(order[1]).toBe("mid");
        expect(order[2]).toBe("low");
        sched.destroy();
    });

    it("sleep delays execution", async () => {
        const loop = new ManualEventLoopAdapter();
        const sched = new Scheduler({eventLoop: loop, quantumMs: 100});
        let done = false;
        const p = sched.run(function* () {
            yield sleep(50);
            done = true;
            return 1;
        });
        await sched.tick();
        expect(done).toBe(false);
        loop.advance(60);
        await sched.tick();
        await p;
        expect(done).toBe(true);
        sched.destroy();
    });

    it("fork spawns child", async () => {
        const sched = createScheduler({quantumMs: 100});
        let childDone = false;
        const result = await sched.run(function* () {
            const child = yield fork(function* () {
                childDone = true;
                return 99;
            });
            void child;
            yield sleep(10);
            return 1;
        });
        await new Promise((r) => setTimeout(r, 30));
        expect(childDone).toBe(true);
        expect(result).toBe(1);
        sched.destroy();
    });

    it("all waits for all", async () => {
        const sched = createScheduler({quantumMs: 100});
        const result = await sched.run(function* () {
            const vals = yield all([function* () {
                return 1;
            }, function* () {
                return 2;
            }, function* () {
                return 3;
            }]);
            return vals;
        });
        expect(result).toEqual([1, 2, 3]);
        sched.destroy();
    });

    it("race returns first", async () => {
        const sched = createScheduler({quantumMs: 100});
        const result = await sched.run(function* () {
            const v = yield race([function* () {
                return 1;
            }, function* () {
                return 2;
            }]);
            return v;
        });
        expect([1, 2]).toContain(result as number);
        sched.destroy();
    });

    it("call effect", async () => {
        const sched = createScheduler({quantumMs: 100});
        const result = await sched.run(function* () {
            const v = yield call(() => 42);
            return v;
        });
        expect(result).toBe(42);
        sched.destroy();
    });

    it("call with promise", async () => {
        const sched = createScheduler({quantumMs: 100});
        const result = await sched.run(function* () {
            const v = yield call(() => Promise.resolve(100));
            return v;
        });
        expect(result).toBe(100);
        sched.destroy();
    });

    it("awaitPromise effect", async () => {
        const sched = createScheduler({quantumMs: 100});
        const result = await sched.run(function* () {
            const v = yield awaitPromise(Promise.resolve(77));
            return v;
        });
        expect(result).toBe(77);
        sched.destroy();
    });

    it("setPriority changes priority", async () => {
        const sched = createScheduler({quantumMs: 100});
        const result = await sched.run(function* () {
            yield setPriority(9);
            return 1;
        });
        expect(result).toBe(1);
        sched.destroy();
    });

    it("yieldEvery batches", async () => {
        const sched = createScheduler({quantumMs: 100});
        let sum = 0;
        const counter = {count: 0};
        const result = await sched.run(function* () {
            for (let i = 0; i < 100; i++) {
                sum += 1;
                yield yieldEvery(10, counter);
            }
            return sum;
        });
        expect(result).toBe(100);
        sched.destroy();
    });

    it("async generator support", async () => {
        const sched = createScheduler({quantumMs: 100});
        const result = await sched.run(async function* () {
            const v = await Promise.resolve(5);
            yield awaitPromise(Promise.resolve(v));
            return 42;
        } as unknown as () => Generator<unknown, number, unknown>);
        expect(result).toBe(42);
        sched.destroy();
    });

    it("promise yield (bare promise)", async () => {
        const sched = createScheduler({quantumMs: 100});
        const result = await sched.run(function* () {
            // @ts-ignore
            const v: number = yield Promise.resolve(123) as unknown as number;
            return v;
        });
        expect(result).toBe(123);
        sched.destroy();
    });

    it("cancel", async () => {
        const sched = createScheduler({quantumMs: 100});
        const handle = sched.spawn(function* () {
            yield sleep(1000);
            return 1;
        });
        handle.cancel();
        expect(handle.getState()).toBe(CoroutineState.Cancelled);
        await expect(handle.promise).rejects.toThrow();
        sched.destroy();
    });

    it("error propagation", async () => {
        const sched = createScheduler({quantumMs: 100});
        await expect(sched.run(function* () {
            throw new Error("fail");
        })).rejects.toThrow("fail");
        sched.destroy();
    });

    it("try/finally cleanup on cancel", async () => {
        const sched = createScheduler({quantumMs: 100});
        const handle = sched.spawn(function* () {
            try {
                yield sleep(1000);
            } finally {
                void 0;
            }
        });
        handle.cancel();
        expect(handle.getState()).toBe(CoroutineState.Cancelled);
        sched.destroy();
    });

    it("priority decay prevents starvation", async () => {
        const loop = new ManualEventLoopAdapter();
        const sched = new Scheduler({
            eventLoop: loop,
            strategy: "decay",
            decayOptions: {lambda: 0.05, boost: 10, agingIntervalMs: 10, agingStep: 1},
            quantumMs: 100
        });
        const order: string[] = [];
        for (let i = 0; i < 5; i++) sched.spawn(function* () {
            order.push(`low-${i}`);
        }, {priority: 0});
        sched.spawn(function* () {
            order.push("high");
        }, {priority: 10});
        loop.advance(1000);
        for (let i = 0; i < 6; i++) await sched.tick();
        expect(order.length).toBe(6);
        sched.destroy();
    });

    it("1000 coroutines", async () => {
        const sched = createScheduler({quantumMs: 100});
        const promises: Promise<number>[] = [];
        for (let i = 0; i < 1000; i++) promises.push(sched.run(function* () {
            return i;
        }) as Promise<number>);
        const results = await Promise.all(promises);
        expect(results.length).toBe(1000);
        expect(results[999]).toBe(999);
        sched.destroy();
    });

    it("stats tracking", async () => {
        const sched = createScheduler({quantumMs: 100});
        await sched.run(function* () {
            return 1;
        });
        await sched.run(function* () {
            return 2;
        });
        const stats = sched.getStats();
        expect(stats.completed).toBe(2);
        expect(stats.totalSpawned).toBe(2);
        expect(stats.switches).toBeGreaterThan(0);
        sched.destroy();
    });

    it("max coroutines limit", () => {
        const sched = createScheduler({maxCoroutines: 2, quantumMs: 100});
        sched.spawn(function* () {
            yield sleep(1000);
        });
        sched.spawn(function* () {
            yield sleep(1000);
        });
        expect(() => sched.spawn(function* () {
        })).toThrow();
        sched.destroy();
    });

    it("createScheduler factory", () => {
        const s = createScheduler();
        expect(s).toBeInstanceOf(Scheduler);
        s.destroy();
    });
});

describe('Scheduler async/await support', () => {
    it('should run an async function and return its result', async () => {
        const scheduler = createScheduler();
        const result = await scheduler.run(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 42;
        });
        expect(result).toBe(42);
    });

    it('should propagate errors from async functions', async () => {
        const scheduler = createScheduler();
        const promise = scheduler.run(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            throw new Error('boom');
        });
        await expect(promise).rejects.toThrow('boom');
    });

    it('should allow cancellation of an async coroutine', async () => {
        const scheduler = createScheduler();
        const handle = scheduler.spawn(async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return 'done';
        });
        setTimeout(() => handle.cancel(), 10);
        await expect(handle.promise).rejects.toThrow(/cancelled/i);
    });
});