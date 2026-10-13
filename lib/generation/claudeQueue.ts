/** Global Claude generation queue: at most 2 jobs at once. */

const MAX_CONCURRENT = 2;

type QueueItem = {
  fn: () => Promise<unknown>;
  priority: number;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  enqueuedAt: number;
};

const queue: QueueItem[] = [];
let active = 0;

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    queue.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);
    const job = queue.shift()!;
    active += 1;
    Promise.resolve()
      .then(() => job.fn())
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

export function enqueueClaudeJob<T>(
  fn: () => Promise<T>,
  opts: { priority?: number } = {},
): Promise<T> {
  const priority = opts.priority == null ? 10 : opts.priority;
  return new Promise<T>((resolve, reject) => {
    queue.push({
      fn: fn as () => Promise<unknown>,
      priority,
      resolve: resolve as (v: unknown) => void,
      reject,
      enqueuedAt: Date.now(),
    });
    pump();
  });
}

export function queueStats() {
  return { active, queued: queue.length, max: MAX_CONCURRENT };
}

export function _resetQueueForTests() {
  queue.length = 0;
  active = 0;
}

export { MAX_CONCURRENT };
