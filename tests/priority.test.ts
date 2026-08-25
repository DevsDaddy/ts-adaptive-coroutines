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
    clampPriority,
    DecayPriorityStrategy,
    FixedPriorityStrategy,
    PriorityEntry,
    DEFAULT_DECAY_OPTIONS
} from "../src";

describe("Priority", () => {
    it("clampPriority", () => {
        expect(clampPriority(-5)).toBe(0);
        expect(clampPriority(15)).toBe(10);
        expect(clampPriority(5)).toBe(5);
    });

    it("Fixed strategy returns base", () => {
        const s = new FixedPriorityStrategy();
        // @ts-ignore
        expect(s.effectivePriority(5, 1000, 0)).toBe(5);
    });

    it("Decay strategy boosts with wait time", () => {
        const s = new DecayPriorityStrategy({...DEFAULT_DECAY_OPTIONS, lambda: 0.01, boost: 5});
        const p0 = s.effectivePriority(2, 0, 0);
        const p1 = s.effectivePriority(2, 500, 500);
        expect(p1).toBeGreaterThan(p0);
        expect(p1).toBeLessThanOrEqual(7);
    });

    it("Decay saturates near base+boost", () => {
        const s = new DecayPriorityStrategy({lambda: 0.1, boost: 10, agingIntervalMs: 100, agingStep: 1});
        const p = s.effectivePriority(0, 10000, 10000);
        expect(p).toBeCloseTo(10, 0);
    });

    it("PriorityEntry recompute", () => {
        const s = new DecayPriorityStrategy(DEFAULT_DECAY_OPTIONS);
        const e = new PriorityEntry(3, 0, 3);
        e.recompute(s, 1000);
        expect(e.effective).toBeGreaterThan(3);
    });
});
