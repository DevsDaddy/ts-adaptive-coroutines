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
import {DefaultEventLoopAdapter, ManualEventLoopAdapter, getYieldFn, resetYieldCache} from "../src";

describe("EventLoop", () => {
    it("getYieldFn returns function", () => {
        resetYieldCache();
        const fn = getYieldFn();
        expect(typeof fn).toBe("function");
    });

    it("Default adapter yieldToMain resolves", async () => {
        const adapter = new DefaultEventLoopAdapter();
        await expect(adapter.yieldToMain()).resolves.toBeUndefined();
    });

    it("Manual adapter flush", async () => {
        const m = new ManualEventLoopAdapter();
        let called = false;
        m.scheduleMicrotask(() => (called = true));
        await new Promise<void>((r) => queueMicrotask(r));
        expect(called).toBe(true);
    });

    it("Manual advance time", () => {
        const m = new ManualEventLoopAdapter();
        expect(m.now()).toBe(0);
        m.advance(100);
        expect(m.now()).toBe(100);
    });

    it("scheduleMacrotask and cancel", () => {
        const m = new ManualEventLoopAdapter();
        let a = 0, b = 0;
        const id = m.scheduleMacrotask(() => (a = 1));
        m.scheduleMacrotask(() => (b = 1));
        m.cancelMacrotask(id);
        m.flushMacrotasks();
        expect(a).toBe(0);
        expect(b).toBe(1);
    });
});
