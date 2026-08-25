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
import { describe, it, expect } from "vitest";
import { createScheduler, Channel, fixedBuffer, takeEvery, takeLatest, sleep } from "../src";

describe("Helpers", () => {
    it("takeEvery run worker for each message", async () => {
        const scheduler = createScheduler();
        const channel = new Channel<number>(fixedBuffer(10));
        const processed: number[] = [];

        scheduler.spawn(takeEvery(channel, function* (value) {
            processed.push(value);
            yield sleep(10);
        }));

        channel.put(1);
        channel.put(2);
        await scheduler.run(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
        });
        expect(processed).toEqual([1, 2]);
    });

    it("takeLatest cancel previous worker when received new message", async () => {
        const scheduler = createScheduler();
        const channel = new Channel<number>(fixedBuffer(10));
        const processed: number[] = [];

        scheduler.spawn(takeLatest(channel, function* (value) {
            yield sleep(100);
            processed.push(value);
        }));

        channel.put(1);
        await new Promise(resolve => setTimeout(resolve, 10));
        channel.put(2);
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(processed).toEqual([2]);
    });
});