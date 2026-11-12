import { setImmediate } from 'node:timers/promises';

// Keep the same verifier for synchronous consumers and cooperatively scheduled refreshes.
export function finishOnchainWork<T>(steps: Generator<void, T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
export async function runOnchainWork<T>(steps: Generator<void, T>, signal?: AbortSignal): Promise<T> {
  let deadline = performance.now() + 8;
  try {
    signal?.throwIfAborted();
    for (;;) {
      const step = steps.next();
      if (step.done) return step.value;
      if (performance.now() >= deadline) {
        await setImmediate(undefined, { signal });
        signal?.throwIfAborted();
        deadline = performance.now() + 8;
      }
    }
  } finally { steps.return(undefined as T); }
}
export function* mapOnchainWork<T, U>(items: readonly T[], map: (item: T) => U): Generator<void, U[]> {
  const result: U[] = [];
  for (const item of items) { result.push(map(item)); yield; }
  return result;
}
