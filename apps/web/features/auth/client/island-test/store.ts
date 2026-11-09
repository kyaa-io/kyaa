// Island test device only (plan-b §7.2): used by the island Vitest project to run the existing 14 Privy test files.
// Production never uses this store. The order and identity tests (*.island-test.tsx) use the production store.
import { PrivyIslandStore } from "../privy-backend.island";

/** Same data, functions counted as equal (tests' fakes hand out new vi.fn() on every call). */
export function sameData(a: unknown, b: unknown): boolean {
  if (typeof a === "function" && typeof b === "function") return true;
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameData((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

export class IslandTestStore extends PrivyIslandStore {
  private forceRequested = false;
  private forcedTick = -1;
  /** Every app commit re-reads the fakes (Profiler onRender); nothing is suppressed, so an app update is never dropped. */
  appCommitted() {
    if (this.forceRequested) { this.forceRequested = false; this.forcedTick = this.getTick() + 1; }
    this.bumpTick();
  }
  /** After RTL rerender the first mirror pass publishes even if only functions changed (a test swapped a mock). */
  forceNextPublish() { this.forceRequested = true; }
  protected override accepts(previous: unknown, next: unknown): boolean {
    return this.getTick() === this.forcedTick || !sameData(previous, next);
  }
}
