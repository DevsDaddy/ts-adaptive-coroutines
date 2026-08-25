# Welcome to Adaptive Coroutines
![Typescript Adaptive Coroutines](images/cover.png)

**A library of adaptive cooperative coroutines for TypeScript/JavaScript**
Provides high-level control over asynchronous execution, priorities, memory, and multithreading. Ideal for high-load applications, games, interactive interfaces, and data stream processing.

> Have a questions? <a href="mailto:devsdaddy@atomicmail.io">Contact me</a>

![TypeScript Adaptive Coroutines at NPM](https://badge.fury.io/js/ts-adaptive-coroutines.svg) ![TypeScript Adaptive Coroutines - MIT opensource](https://img.shields.io/badge/License-MIT-yellow.svg)

---

[About](#about-library) | [Installation](#installation) | [Get Started](#get-started) | [Examples](#examples) | [Comparison](#comparison-and-benchmarks) | [Help](mailto:devsdaddy@atomicmail.io)

---

## About Library
### General conception
The library implements **cooperative multitasking** using JavaScript generators.
A coroutine is a **generator function** (or asynchronous function, see below) that can `yield` special effects: declarative instructions for the scheduler.

The scheduler interprets these effects, manages queues of ready and sleeping coroutines, monitors priorities, and ensures cooperative yielding to the main thread.

### ❓ Key principles:
- **Deterministic execution** - coroutines are executed in turn, switching only at ``yield`` points.
- **Adaptive priorities** - the effective priority grows with wait time, preventing starvation.
- **Efficient memory management** - arenas and object pools reduce the load on the garbage collector.
- **Multithreading** - support for **Web Workers**, ``SharedArrayBuffer``, and **Work-Stealing**.
- **Observability** - built-in tracing and metrics.

### ⭐ Features
- ✅ **The only solution** with adaptive priorities and arenas
- ✅ **Full control** over execution and memory
- ✅ **Flexible scheduling** with priorities (fixed or adaptive)
- ✅ **Effects:** `yield`, `sleep`, `fork`, `cancel`, `all`, `race`, `call`, `await`, `yieldEvery`, `setPriority`
- ✅ **Memory arena** (`Arena`, `WasmArena`, `SharedArrayBuffer`)
- ✅ **Pools of objects** for reuse
- ✅ **Channels** with multiple buffering strategies
- ✅ **Semaphores**
- ✅ **Support of `async/await`:** you can run regular asynchronous functions as coroutines
- ✅ **High-level helpers:** `takeEvery`, `takeLatest`, `throttle`, `debounce`, `runAll`, `runRace`
- ✅ **React integration** (optional)
- ✅ **Multithreaded execution** via workers (safe factory transfer)
- ✅ **Tracing and exporting metrics** in OpenTelemetry

### Where to use this library?
- **High-load servers**: request priority control, task isolation.
- **Game engines powered by JS**: control of multiple agents, particles, AI with cooperative multitasking.
- **Interactive UI**: background tasks, polls, complex animations with pause/resume.
- **Stream data processing**: conveyors with backpressure on channels.
- **Scientific simulations**: splitting computations into cooperative parts, distributing them among workers.

---

## Installation
**Install from NPM:**
```bash
npm install ts-adaptive-coroutines
```

**Or from git:**
```bash
git clone https://github.com/devsdaddy/ts-adaptive-coroutines
cd ./ts-adaptive-coroutines
```

**For React support (optional) (>=18.0.0):**
```bash
npm install react react-dom
```

---

## Get Started
**Simple coroutine creation:**
```typescript
import { createScheduler, sleep } from 'ts-adaptive-coroutines';

const scheduler = createScheduler();

// Launch simple coroutine
scheduler.run(function* () {
  console.log('Start coroutine');
  yield sleep(1000);
  console.log('Second elapsed');
  return 'Ready';
}).then(result => console.log(result));

// Or using async/await
scheduler.run(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return 'Launched from async';
}).then(console.log);
```

### Work with Coroutines and Effects
**A coroutine is a generator that returns effects via yield**. The library provides effect constructor functions:
```typescript
import { yieldMain, sleep, fork, cancel, all, race, call, awaitPromise, yieldEvery, setPriority } from 'ts-adaptive-coroutines';

// Create coroutine function
function* myCoroutine() {
    yield sleep(100);                                   // sleep with 100ms
    const result = yield call(() => fetch('/api'));     // call some function (support Promise)
    yield yieldMain();                                  // give way to other Coroutines
    const child = yield fork(() => anotherCoroutine()); // launch child coroutine
    yield cancel(child.id);                             // cancel child coroutine
    const results = yield all([                         // parallel coroutines
        () => task1(),
        () => task2()
    ]);
}
```

### Work with Priority
**Each coroutine has a base priority** (a number from ``min`` to ``max``, 0-10 by default, 5 by default). The scheduler uses an effective priority that can increase with wait time (``decay`` strategy) to prevent starvation.

**Priority example:**
```typescript
scheduler.spawn(() => task(), { priority: 8 }); // high priority

// Change priority inside coroutine
function* task() {
  yield setPriority(10);
  // ...
}
```

### Understanding Memory Arena
Arenas (``Arena``, ``WasmArena``) allocate large blocks of memory for temporary data, reducing the load on the GC.
Standard ``ArrayBuffers``, ``SharedArrayBuffers`` (for multithreading), and ``WebAssembly`` are supported.

**Let's look at Arena example:**
```typescript
import { Arena } from 'ts-adaptive-coroutines';

const arena = new Arena(1024 * 1024);       // Create 1 MB Arena
const offset = arena.allocAligned(256);     // Allocate 256 bytes
const view = arena.view(offset, 256);       // View arena data
view.setFloat64(0, 3.14);                   // Set arena data
// ...
arena.reset(0);                             // release all memory
```

### Work with Channels and Semaphores
**For data exchange and synchronization may be used channels and semaphores:**
```typescript
import { Channel, fixedBuffer, Semaphore } from 'ts-adaptive-coroutines';

// Create channel
const channel = new Channel<number>(fixedBuffer(10));
await channel.put(42);                                  // Put data in channel
const value = await channel.take();                     // Take data from channel

// Create semaphore
const sem = new Semaphore(3);
await sem.acquire();

// Release semaphore
sem.release();
```

### Work with Multithreading
**The library supports running coroutines in workers**. A ``factory`` registry, rather than ``eval``, is used for safe task transfer.

**Usage example:**
```typescript
// Register your task using factory:
registerFactory('myTask', (arg) => function* () { /* ... */ });             // Coroutine to run in worker

// Now you can use in main thread:
const distSched = new DistributedScheduler({ useWorkers: true, size: 4 });
const handle = distSched.spawnOnWorkerByName('myTask', [42]);               // Will be started inside worker
const result = await handle.promise;                                        // Get result
```

### Async / Await support
You can run **regular asynchronous functions** as **coroutines**, they are automatically wrapped in a generator:
```typescript
// Use async as coroutine
const result = await scheduler.run(async () => {
  await fetch('...');
  return 'ok';
});
```

### React integration
**Provides hooks for managing coroutines within components:**
```typescript
import { useCoroutine, SchedulerProvider } from 'ts-adaptive-coroutines/react';

// Component with coroutine inside
function MyComponent() {
  const { status, result, start, cancel } = useCoroutine(
    () => function* () {
      yield sleep(1000);
      return 'Hello, world!';
    },
    { autoStart: true }
  );
  return <div>{status}: {result}</div>;
}
```

### High-level helpers
- ``takeEvery(channel, worker)``: starts a worker for each message.
- ``takeLatest(channel, worker)``: cancels the previous worker when a new message is sent.
- ``throttle(ms, fn)`` / ``debounce(ms, fn)``: limits the call rate.
- ``runAll``, ``runRace``: analogs of all and race as effects.

---

## Examples
> In this section you can find examples of frequently used cases where the TypeScript Adaptive Coroutines library may be useful to you.

### Example 1: Processing an Event Stream with Priority
```typescript
// Create new channel
const channel = new Channel<string>(slidingBuffer(100));

// Create high priority handler for notifications
scheduler.spawn(takeEvery(channel, function* (msg) {
  yield setPriority(8);
  console.log('Important message:', msg);
}), { priority: 8 });

// Send new event
channel.put('My event 1');
```

### Example 2: Parallel execution with a limit
```typescript
// Use semaphore
import { Semaphore } from 'ts-adaptive-coroutines';

// Create limiter for semaphore
const limiter = new Semaphore(3);
const urls = ["https://example.com/", "https://google.com/", "https://fb.com/", "https://someurl.com/"];

/**
 * Fetch all datas
 * Have an internal coroutine limit, because limiter is setup for 3
 * @param urls {string[]} Urls to process
 */
function* fetchAll(urls: string[]) {
  const tasks = urls.map(url => () => function* () {
    yield limiter.acquire();
    try {
      const data = yield call(() => fetch(url));
      return data;
    } finally {
      limiter.release();
    }
  });
  return yield all(tasks);
}
```

### Example 3: Canceling a long operation
```typescript
// Long-running operation
function* longRunning() {
  try {
    yield sleep(60000);
  } finally {
    console.log('Cleanup here');
  }
}

// Run coroutine and cancel after 5 seconds
const handle = scheduler.spawn(longRunning);
setTimeout(() => handle.cancel(), 5000);
```

### Best Practices
- Use ``yieldEvery`` in long loops to avoid blocking the thread.
- For CPU-intensive tasks, allocate memory in an ``Arena`` and use ``yieldMain()`` for yielding.
- When working with workers, register ``factories`` in advance and do not pass closures.
- **Enable tracing only when debugging** to avoid performance degradation.
- For high-load systems, adjust priority parameters (lambda, boost, agingIntervalMs).

---

## Comparison and Benchmarks
**See a comparison with popular libraries and approaches:**

| Feature           | ts-adaptive-coroutines                      | async / await   | redux-saga              | effection              | RxJs           |
|-------------------|---------------------------------------------|-----------------|-------------------------|------------------------|----------------|
| Model             | Generators + Effects + Scheduler + Promises | Promises        | Generators + Middleware | Generators + Hierarchy | Reactive flows |
| Priority control  | Adaptive priority                           | ❌               | ❌                       | ❌                      | Scheduler only |
| Memory management | Arenas + Pools                              | ❌ GC            | ❌ GC                    | ❌ GC                   | ❌ GC           |
| Multithreading    | Workers, SharedArray Buffer, Work-Stealing  | Manual          | ❌                       | ❌                      | ❌              |
| Cancellation      | Hierarchy based                             | AbortController | cancelled effect        | ❌                      | Unsubscribe    |
| Observability     | Tracing with export to Open-Telemetry       | Manual          | DevTools                | Partial                | Manual         |
| React integration | Optional hooks                              | No              | react-redux-saga        | ❌                      | rxjs-hooks     |

**Benchmark results:**

| Name                                      | Hz       | min    | max    | mean   | p75    | samples |
|-------------------------------------------|----------|--------|--------|--------|--------|---------|
| sync switch 1000 coroutines (manual loop) | 1,601.27 | 0.3790 | 3.6914 | 0.6245 | 0.5686 | 801     |
| yieldMain 100 iterations                  | 2,331.15 | 0.0762 | 3.8351 | 0.4290 | 0.3832 | 1166    |


> ``ts-adaptive-coroutines`` is a powerful tool for those who need high performance, predictability, and control over asynchronous code. The library is actively being developed, and we welcome community contributions.

---

## Licensing
**TypeScript Adaptive Coroutines** library is distributed under the MIT license. You can use it however you like. I would appreciate any feedback and suggestions for improvement.
Full license text [can be found here](https://github.com/devsdaddy/ts-adaptive-coroutines/blob/main/LICENSE)

---

[About](#about-library) | [Installation](#installation) | [Get Started](#get-started) | [Examples](#examples) | [Comparison](#comparison-and-benchmarks) | [Help](mailto:devsdaddy@atomicmail.io)