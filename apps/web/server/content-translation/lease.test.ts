import { describe, expect, it, vi } from "vitest";
import { TRANSLATION_WAIT_MS, withTranslationLease, type LeaseClock } from "./lease";

const token = "b0000000-0000-4000-8000-000000000001";
function clock() {
  let now = 0; const sleeps: number[] = [];
  return { sleeps, clock: { now: () => now, async sleep(ms: number) { sleeps.push(ms); now += ms; } } satisfies LeaseClock };
}
const claimed = { status: "claimed", token }, busy = { status: "busy" };

describe("translation lease", () => {
  it("runs the work once for the holder and does not release (the leased save ends the lease)", async () => {
    const rpc = vi.fn().mockResolvedValue(claimed), read = vi.fn().mockResolvedValue(null), work = vi.fn().mockResolvedValue("stored");
    expect(await withTranslationLease(rpc, { k: 1 }, read, work, clock().clock)).toEqual({ value: "stored", cached: false });
    expect(work).toHaveBeenCalledWith(token); expect(rpc).toHaveBeenCalledTimes(1); expect(rpc).toHaveBeenCalledWith("claim_content_translation_lease", { k: 1 });
  });
  it("checks the cache again after winning the lease: a hit means no work and the lease is released", async () => {
    const rpc = vi.fn().mockResolvedValue(claimed), work = vi.fn();
    expect(await withTranslationLease(rpc, {}, async () => "hit", work, clock().clock)).toEqual({ value: "hit", cached: true });
    expect(work).not.toHaveBeenCalled(); expect(rpc).toHaveBeenLastCalledWith("release_content_translation_lease", { p_lease_token: token });
  });
  it("a waiter polls the cache, never works, and returns the holder's row", async () => {
    const c = clock(), rpc = vi.fn().mockResolvedValue(busy), work = vi.fn(); let reads = 0;
    expect(await withTranslationLease(rpc, {}, async () => ++reads === 3 ? "row" : null, work, c.clock)).toEqual({ value: "row", cached: true });
    expect(work).not.toHaveBeenCalled(); expect(c.sleeps).toHaveLength(3); expect(rpc).toHaveBeenCalledTimes(3);
  });
  it("takes over when the holder's lease expires without a row", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(busy).mockResolvedValueOnce(busy).mockResolvedValue(claimed), work = vi.fn().mockResolvedValue("mine");
    expect(await withTranslationLease(rpc, {}, async () => null, work, clock().clock)).toEqual({ value: "mine", cached: false });
    expect(work).toHaveBeenCalledOnce();
  });
  it("gives up with TRANSLATION_UNAVAILABLE after the wait limit instead of calling the provider", async () => {
    const c = clock(), work = vi.fn();
    await expect(withTranslationLease(vi.fn().mockResolvedValue(busy), {}, async () => null, work, c.clock)).rejects.toThrow("TRANSLATION_UNAVAILABLE");
    expect(work).not.toHaveBeenCalled(); expect(c.sleeps.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(TRANSLATION_WAIT_MS);
  });
  it("releases the lease and rethrows when the work fails; a release failure does not hide the error", async () => {
    const rpc = vi.fn(async (name: string) => { if (name === "release_content_translation_lease") throw new Error("down"); return claimed; });
    await expect(withTranslationLease(rpc, {}, async () => null, async () => { throw new Error("TRANSLATION_FAILED"); }, clock().clock)).rejects.toThrow("TRANSLATION_FAILED");
    expect(rpc).toHaveBeenLastCalledWith("release_content_translation_lease", { p_lease_token: token });
  });
  it("refuses an unexpected claim answer before any work", async () => {
    const work = vi.fn();
    await expect(withTranslationLease(vi.fn().mockResolvedValue({ status: "claimed" }), {}, async () => null, work, clock().clock)).rejects.toThrow("FAN_WEB_UNAVAILABLE");
    expect(work).not.toHaveBeenCalled();
  });
  it("a read that is refused (access lost) while waiting stops the wait", async () => {
    await expect(withTranslationLease(vi.fn().mockResolvedValue(busy), {}, async () => { throw new Error("FAN_WEB_NOT_FOUND"); }, vi.fn(), clock().clock)).rejects.toThrow("FAN_WEB_NOT_FOUND");
  });
  describe("wait budget", () => {
    /** A clock the rpc can advance, to model slow RPC answers. */
    function slowClock() { let now = 0; return { at: () => now, advance: (ms: number) => { now += ms; }, clock: { now: () => now, async sleep(ms: number) { now += ms; } } satisfies LeaseClock }; }
    function slowRpc(c: ReturnType<typeof slowClock>, answers: unknown[], latency: number) {
      const claims: string[] = []; let index = 0;
      const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
        if (name === "claim_content_translation_lease") { c.advance(latency); claims.push(`claim@${c.at()}`); return answers[Math.min(index++, answers.length - 1)]; }
        return args && null;
      });
      return { rpc, claims };
    }
    it.each([[TRANSLATION_WAIT_MS - 1, true], [TRANSLATION_WAIT_MS, false], [TRANSLATION_WAIT_MS + 8_000, false]])("a claim answered at %i ms %s", async (latency, works) => {
      const c = slowClock(), { rpc } = slowRpc(c, [claimed], latency), work = vi.fn().mockResolvedValue("stored");
      const run = withTranslationLease(rpc, {}, async () => null, work, c.clock);
      if (works) { await expect(run).resolves.toEqual({ value: "stored", cached: false }); expect(work).toHaveBeenCalledOnce(); expect(rpc).not.toHaveBeenCalledWith("release_content_translation_lease", expect.anything()); }
      else {
        await expect(run).rejects.toThrow("TRANSLATION_UNAVAILABLE");
        // No quota, no provider (both live inside work), no cache read for the late lease; the lease it got is released by its own token.
        expect(work).not.toHaveBeenCalled(); expect(rpc).toHaveBeenLastCalledWith("release_content_translation_lease", { p_lease_token: token });
      }
    });
    it("a late claim answered while the budget is spent releases only its own token and a later cache hit is unaffected", async () => {
      const c = slowClock(), other = "c0000000-0000-4000-8000-000000000002", rpc = vi.fn(async (name: string) => {
        if (name === "claim_content_translation_lease") { c.advance(TRANSLATION_WAIT_MS); return { status: "claimed", token }; }
        return null;
      }), work = vi.fn(), read = vi.fn().mockResolvedValue("hit");
      await expect(withTranslationLease(rpc, {}, read, work, c.clock)).rejects.toThrow("TRANSLATION_UNAVAILABLE");
      expect(rpc.mock.calls.filter(call => call[0] === "release_content_translation_lease")).toEqual([["release_content_translation_lease", { p_lease_token: token }]]);
      expect(JSON.stringify(rpc.mock.calls)).not.toContain(other); expect(read).not.toHaveBeenCalled(); expect(work).not.toHaveBeenCalled();
    });
    it("starts no retry claim once the budget is spent while waiting", async () => {
      const c = slowClock(), rpc = vi.fn().mockResolvedValue(busy), work = vi.fn();
      const clock: LeaseClock = { now: c.clock.now, async sleep() { c.advance(TRANSLATION_WAIT_MS); } };
      await expect(withTranslationLease(rpc, {}, async () => null, work, clock)).rejects.toThrow("TRANSLATION_UNAVAILABLE");
      expect(rpc).toHaveBeenCalledTimes(1); expect(work).not.toHaveBeenCalled();
    });
    it("a cache hit found while waiting is still returned after the budget (policy unchanged)", async () => {
      const c = slowClock(), rpc = vi.fn().mockResolvedValue(busy), clock: LeaseClock = { now: c.clock.now, async sleep() { c.advance(TRANSLATION_WAIT_MS + 1); } };
      expect(await withTranslationLease(rpc, {}, async () => "row", vi.fn(), clock)).toEqual({ value: "row", cached: true });
    });
    it("a retry claim answered after the budget releases and stops; one answered just inside works", async () => {
      for (const [latency, works] of [[TRANSLATION_WAIT_MS - 750 - 1, true], [TRANSLATION_WAIT_MS - 750, false]] as const) {
        const c = slowClock(), { rpc } = slowRpc(c, [busy, claimed], 0), work = vi.fn().mockResolvedValue("mine");
        let n = 0; const wrapped = vi.fn(async (name: string, args: Record<string, unknown>) => { if (name === "claim_content_translation_lease" && n++ === 1) c.advance(latency); return rpc(name, args); });
        const run = withTranslationLease(wrapped, {}, async () => null, work, c.clock);
        if (works) await expect(run).resolves.toEqual({ value: "mine", cached: false });
        else { await expect(run).rejects.toThrow("TRANSLATION_UNAVAILABLE"); expect(work).not.toHaveBeenCalled(); expect(wrapped).toHaveBeenLastCalledWith("release_content_translation_lease", { p_lease_token: token }); }
      }
    });
  });
});
