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
import {yieldMain, sleep, fork, all, race, call, awaitPromise, yieldEvery, setPriority, isEffect} from "../src";

describe("Effects", () => {
    it("creates effect objects with _effect tag", () => {
        expect(yieldMain()._effect).toBe("yield");
        expect(sleep(10)._effect).toBe("sleep");
        expect(fork(function* () {
        })._effect).toBe("fork");
        expect(all([])._effect).toBe("all");
        expect(race([])._effect).toBe("race");
        expect(call(() => 1)._effect).toBe("call");
        expect(awaitPromise(Promise.resolve(1))._effect).toBe("await");
        expect(yieldEvery(10)._effect).toBe("yieldEvery");
        expect(setPriority(5)._effect).toBe("setPriority");
    });

    it("isEffect discriminates", () => {
        expect(isEffect(yieldMain())).toBe(true);
        expect(isEffect({_effect: "yield"})).toBe(true);
        expect(isEffect({})).toBe(false);
        expect(isEffect(null)).toBe(false);
        expect(isEffect(42)).toBe(false);
        expect(isEffect(Promise.resolve(1))).toBe(false);
    });

    it("yieldEvery counter", () => {
        const c = {count: 0};
        const e = yieldEvery(5, c);
        expect(e.every).toBe(5);
        expect(e.counter).toBe(c);
    });
});
