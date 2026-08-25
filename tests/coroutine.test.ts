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
import {Coroutine, CoroutineState, CancelError} from "../src";

describe("Coroutine", () => {
    it("lifecycle complete", async () => {
        const c = new Coroutine<number>(1, {priority: 5}, function* () {
            return 42;
        }, 0);
        c.init();
        expect(c.state).toBe(CoroutineState.Pending);
        c.complete(42);
        expect(c.state).toBe(CoroutineState.Completed);
        expect(await c.promise).toBe(42);
    });

    it("fail", async () => {
        const c = new Coroutine<number>(1, {priority: 5}, function* () {
            return 1;
        }, 0);
        c.fail(new Error("oops"));
        expect(c.state).toBe(CoroutineState.Failed);
        await expect(c.promise).rejects.toThrow("oops");
    });

    it("cancel", async () => {
        const c = new Coroutine<number>(1, {priority: 5}, function* () {
            yield 1;
            return 1;
        }, 0);
        c.init();
        c.doCancel();
        expect(c.state).toBe(CoroutineState.Cancelled);
        await expect(c.promise).rejects.toBeInstanceOf(CancelError);
    });

    it("reset reuses", async () => {
        const c = new Coroutine<number>(1, {priority: 5}, function* () {
            return 1;
        }, 0);
        c.complete(1);
        c.reset(2, {priority: 3}, function* () {
            return 2;
        }, 100);
        expect(c.id).toBe(2);
        expect(c.priority).toBe(3);
        expect(c.state).toBe(CoroutineState.Pending);
    });

    it("setPriority", () => {
        const c = new Coroutine(1, {priority: 5}, function* () {
        }, 0);
        c.setPriority(9);
        expect(c.priority).toBe(9);
    });
});
