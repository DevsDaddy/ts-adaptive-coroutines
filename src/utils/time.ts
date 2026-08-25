/**
 * TypeScript Coroutines Timing Utils
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/**
 * Get now milliseconds time
 */
export function nowMs(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
    return Date.now();
}

/**
 * Get hrtime milliseconds
 */
export function hrtimeMs(): number {
    try {
        const g: unknown = globalThis as unknown;
        const proc = (g as { process?: { hrtime?: { bigint?: () => bigint } } }).process;
        if (proc?.hrtime?.bigint) return Number(proc.hrtime.bigint()) / 1e6;
    } catch {
    }
    return nowMs();
}
