/**
 * TypeScript Coroutines Benchmarks
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/* Import required modules */
import { bench, describe } from "vitest";
import { createScheduler, ManualEventLoopAdapter, yieldMain } from "../../src";

describe("scheduler bench", () => {
    bench("sync switch 1000 coroutines (manual loop)", async () => {
        const loop = new ManualEventLoopAdapter();
        const sched = createScheduler({ eventLoop: loop, quantumMs: 100 });
        const promises: Promise<number>[] = [];
        for (let i = 0; i < 100; i++) promises.push(sched.run(function* () { return i; }) as Promise<number>);
        await Promise.all(promises);
        sched.destroy();
    });

    bench("yieldMain 100 iterations", async () => {
        const loop = new ManualEventLoopAdapter();
        const sched = createScheduler({ eventLoop: loop, quantumMs: 100 });
        await sched.run(function* () {
            for (let i = 0; i < 100; i++) yield yieldMain();
        });
        sched.destroy();
    });
});
