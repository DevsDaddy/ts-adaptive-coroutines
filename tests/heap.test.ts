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
import {BinaryHeap} from "../src";

describe("BinaryHeap", () => {
    it("orders by comparator (min-heap)", () => {
        const heap = new BinaryHeap<number>((a, b) => a - b);
        heap.push(5);
        heap.push(2);
        heap.push(8);
        heap.push(1);
        expect(heap.pop()).toBe(1);
        expect(heap.pop()).toBe(2);
        expect(heap.pop()).toBe(5);
        expect(heap.pop()).toBe(8);
    });

    it("peek/size/isEmpty", () => {
        const heap = new BinaryHeap<number>((a, b) => a - b);
        expect(heap.isEmpty).toBe(true);
        heap.push(10);
        expect(heap.peek()).toBe(10);
        expect(heap.size).toBe(1);
        heap.clear();
        expect(heap.isEmpty).toBe(true);
    });

    it("remove by predicate", () => {
        const heap = new BinaryHeap<{ id: number; v: number }>((a, b) => a.v - b.v);
        heap.push({id: 1, v: 10});
        heap.push({id: 2, v: 5});
        heap.push({id: 3, v: 15});
        const removed = heap.remove((x) => x.id === 2);
        expect(removed?.id).toBe(2);
        expect(heap.pop()?.id).toBe(1);
    });

    it("handles 1000 random inserts", () => {
        const heap = new BinaryHeap<number>((a, b) => a - b);
        const vals = Array.from({length: 1000}, () => Math.floor(Math.random() * 10000));
        for (const v of vals) heap.push(v);
        const sorted = [...vals].sort((a, b) => a - b);
        for (const s of sorted) expect(heap.pop()).toBe(s);
    });
});
