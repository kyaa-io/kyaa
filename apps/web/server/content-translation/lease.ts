import { z } from "zod";

const claimSchema = z.union([z.object({ status: z.literal("busy") }).strict(), z.object({ status: z.literal("claimed"), token: z.uuid() }).strict()]);

/**
 * Wait budget, not a response limit: a waiter starts no new claim, and keeps no lease it wins, once 22 s have passed since it first asked. A holder
 * that has not saved within the database lease (20 s) loses it. Each RPC can itself take up to the 60 s fetch limit of the service client, so the
 * whole request can still last longer than 22 s; the budget only guarantees that no lease obtained after it is used (no quota, no provider call).
 */
export const TRANSLATION_WAIT_MS = 22_000;
const POLL_MS = 750;
/**
 * After the provider fails for a cache key, this server answers every request for that key with the same failure for this long, without a claim, a
 * quota record or a provider call. Short, so a recovered provider is used again soon (the provider call itself is cut off after 8 s). The hold lives
 * in this server's memory: other servers still call the provider once each, because the database lease is released on failure.
 */
export const TRANSLATION_FAILURE_HOLD_MS = 10_000;
const MAX_HELD_KEYS = 500;
type HeldFailure = { until: number; message: string };
export type FailureHold = {
  /** Same text, source revision and languages for every user; never contains the user or the source text. */
  key: string;
  /** True only for errors that came from the provider call. Quota, access and source changes must not be shared between users. */
  applies: (error: unknown) => boolean;
  store?: Map<string, HeldFailure>;
};
const heldFailures = new Map<string, HeldFailure>();
/** For tests that reuse one cache key across cases. */
export function resetTranslationFailureHold(): void { heldFailures.clear(); }

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type LeaseClock = { now(): number; sleep(ms: number): Promise<void> };
const realClock: LeaseClock = { now: () => Date.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) };

/**
 * Runs `work` only for the one caller that holds the lease on this cache key; everyone else polls `read` until the holder's row appears.
 * `read` is checked again after the lease is won, so a caller that missed just before the holder finished never calls the provider.
 * `work` must store through a leased save function, which also ends the lease; on any failure or hit here the lease is released.
 * No database lock is held while `work` runs; a crashed holder is replaced when its lease expires.
 */
export async function withTranslationLease<T>(rpc: Rpc, claimArgs: Record<string, unknown>, read: () => Promise<T | null>,
  work: (token: string) => Promise<T>, clock: LeaseClock = realClock, hold?: FailureHold): Promise<{ value: T; cached: boolean }> {
  const deadline = clock.now() + TRANSLATION_WAIT_MS;
  const held = hold?.store ?? heldFailures;
  for (let attempt = 0; ; attempt++) {
    if (hold) {
      const failure = held.get(hold.key);
      if (failure && failure.until > clock.now()) throw new Error(failure.message);
      if (failure) held.delete(hold.key);
    }
    if (attempt > 0 && clock.now() >= deadline) throw new Error("TRANSLATION_UNAVAILABLE");
    const claim = claimSchema.safeParse(await rpc("claim_content_translation_lease", claimArgs));
    if (!claim.success) throw new Error("FAN_WEB_UNAVAILABLE");
    if (claim.data.status === "claimed") {
      const { token } = claim.data;
      if (clock.now() >= deadline) {
        // The answer arrived after the budget: give the lease back and do nothing with it.
        await rpc("release_content_translation_lease", { p_lease_token: token }).catch(() => undefined);
        throw new Error("TRANSLATION_UNAVAILABLE");
      }
      try {
        const hit = await read();
        if (hit !== null) { await rpc("release_content_translation_lease", { p_lease_token: token }); return { value: hit, cached: true }; }
        const value = await work(token);
        if (hold) held.delete(hold.key);
        return { value, cached: false };
      } catch (error) {
        if (hold?.applies(error) && error instanceof Error) {
          const now = clock.now();
          for (const [key, failure] of held) if (failure.until <= now) held.delete(key);
          if (held.size >= MAX_HELD_KEYS) held.delete(held.keys().next().value as string);
          held.set(hold.key, { until: now + TRANSLATION_FAILURE_HOLD_MS, message: error.message });
        }
        await rpc("release_content_translation_lease", { p_lease_token: token }).catch(() => undefined);
        throw error;
      }
    }
    if (clock.now() >= deadline) throw new Error("TRANSLATION_UNAVAILABLE");
    await clock.sleep(POLL_MS);
    const hit = await read();
    if (hit !== null) return { value: hit, cached: true };
  }
}
