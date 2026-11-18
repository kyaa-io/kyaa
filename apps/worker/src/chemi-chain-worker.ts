// Transport adapters classify only confirmed record-specific reverts as splittable.
// An unknown broadcast outcome must stay sent until reconciliation.
export interface ChemiBatchStore {
  acquireWriter(): Promise<boolean>;
  releaseWriter(): Promise<void>;
  reconcile(): Promise<void>;
  lease(limit: number): Promise<readonly bigint[]>;
  submit(ids: readonly bigint[]): Promise<'confirmed' | 'record-reverted' | 'unknown'>;
  retry(id: bigint): Promise<void>;
}

export async function runChemiBatch(store: ChemiBatchStore, now = Date.now) {
  const deadline = now() + 240_000;
  if (!(await store.acquireWriter())) return;
  async function send(ids: readonly bigint[]): Promise<boolean> {
    if (now() >= deadline) return false;
    const outcome = await store.submit(ids);
    if (outcome === 'unknown') return false;
    if (outcome === 'confirmed') return true;
    if (ids.length === 1) {
      await store.retry(ids[0]!);
      return true;
    }
    const half = Math.floor(ids.length / 2);
    return await send(ids.slice(0, half)) && await send(ids.slice(half));
  }
  try {
    await store.reconcile();
    while (now() < deadline) {
      const ids = await store.lease(100);
      if (!ids.length || !(await send(ids))) break;
    }
  } finally {
    await store.releaseWriter();
  }
}
