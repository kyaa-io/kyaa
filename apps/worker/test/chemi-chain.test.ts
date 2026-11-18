import { expect, it, vi } from "vitest";
import { runScheduledChemiChain } from "../src/chemi-chain-runtime.js";
import { runChemiBatch } from "../src/chemi-chain-worker.js";

it("keeps the signer in DEV and leaves queued records alone without the key", async () => {
  const load = vi.fn(async () => "{}");
  await runScheduledChemiChain("prod", load);
  expect(load).not.toHaveBeenCalled();
  await runScheduledChemiChain("dev", load);
  expect(load).toHaveBeenCalledExactlyOnceWith("byus/worker/dev-chemi-chain");
  await expect(
    runScheduledChemiChain("dev", async () =>
      JSON.stringify({
        CHEMI_CHAIN_SIGNER_PRIVATE_KEY: "0x" + "1".repeat(64),
        CHEMI_CHAIN_SIGNER_ADDRESS: "0x" + "2".repeat(40),
      }),
    ),
  ).rejects.toThrow("CHEMI_SIGNER_MISMATCH");
});
it("isolates a record failure and stops sending on an unknown outcome", async () => {
  const retry = vi.fn(),
    releaseWriter = vi.fn();
  const submit = vi.fn(async (ids: readonly bigint[]) =>
    ids.includes(2n)
      ? ("record-reverted" as const)
      : ids.includes(3n)
        ? ("unknown" as const)
        : ("confirmed" as const),
  );
  await runChemiBatch({
    acquireWriter: async () => true,
    releaseWriter,
    reconcile: async () => {},
    lease: async () => [1n, 2n, 3n],
    submit,
    retry,
  });
  expect(retry).toHaveBeenCalledExactlyOnceWith(2n);
  expect(submit.mock.calls.at(-1)).toEqual([[3n]]);
  expect(releaseWriter).toHaveBeenCalledOnce();
});
