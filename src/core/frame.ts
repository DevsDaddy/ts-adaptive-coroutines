/**
 * TypeScript Coroutines Frame Stack Implementation
 *
 * This code implements data structures for managing the execution
 * stack of coroutines. In cooperative multitasking, each coroutine
 * can spawn other coroutines (via fork, call, all, and race), and
 * to correctly manage nesting, returns, errors, and local data, a
 * stack similar to the call stack in regular programs is required.
 *
 * Here are the following:
 * 1) FrameState: an enumeration of possible frame states.
 * 2) StackFrame: a description of a single frame of a coroutine.
 * 3) FrameStack: an efficient stack of frames with object reuse.
 *
 * @git             https://github.com/devsdaddy/quarkdash
 * @version         1.2.0
 * @author          Elijah Rastorguev
 * @build           1024
 * @website         https://dev.to/devsdaddy
 * @updated         24.08.2026
 */
/**
 * Frame state enumerator
 */
export const enum FrameState {
    Idle = 0,
    Active = 1,
    Suspended = 2,
    Completed = 3,
}

/**
 * Stack Frame Implementation
 * to describe a single frame of coroutine
 */
export class StackFrame {
    // Stack frame information
    state: FrameState = FrameState.Idle;
    arenaOffset = -1;
    arenaSize = 0;
    depth = 0;
    value: unknown = undefined;
    error: unknown = undefined;

    /**
     * Reset stack frame
     */
    public reset(): void {
        this.state = FrameState.Idle;
        this.arenaOffset = -1;
        this.arenaSize = 0;
        this.depth = 0;
        this.value = undefined;
        this.error = undefined;
    }
}

/**
 * Frame Stack Implementation:
 * an efficient stack of frames with object reuse.
 */
export class FrameStack {
    // Frames
    private frames: StackFrame[] = [];
    private top = -1;

    /**
     * Push new frame
     * @param frame {StackFrame} Stack frame
     */
    public push(frame: StackFrame): void {
        this.top++;
        if (this.top < this.frames.length) {
            this.frames[this.top] = frame as StackFrame;
        } else {
            this.frames.push(frame);
        }
    }

    /**
     * Pop frame from stack and return it if exists
     */
    public pop(): StackFrame | undefined {
        if (this.top < 0) return undefined;
        const f = this.frames[this.top];
        this.top--;
        return f;
    }

    /**
     * Peek frame
     */
    public peek(): StackFrame | undefined {
        if (this.top < 0) return undefined;
        return this.frames[this.top];
    }

    /**
     * Return current stack depth
     */
    public get depth(): number {
        return this.top + 1;
    }

    /**
     * Clear current stack
     */
    public clear(): void {
        this.top = -1;
    }
}
