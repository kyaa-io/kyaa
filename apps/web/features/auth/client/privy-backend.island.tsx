"use client";
// Island backend (PERF-r8 B step 1b, plan-b §5.1). Same hooks as ./privy-backend, but the SDK hooks run in a sibling
// "island" (privy-mirrors.tsx inside the PrivyProvider boundary) instead of above the page. The production build and the
// island Vitest project swap @/features/auth/client/privy-backend for this file. It imports no SDK code at run time.
//
// Contract (plan-b §5.1, §0-5..§0-7):
// - An SDK hook runs in the island only while an app component uses the matching hook here (a "lease"). usePrivy and
//   useUser share one mirror each; every other hook gets one mirror per app hook instance.
// - The mirror publishes the object the SDK returned, unchanged. When new objects appear differs from the direct tree.
// - Before its mirror attaches, a lease answers with fixed first-commit values; calls made then wait for the attach of
//   the lease generation current at call time. A released generation rejects its waiting calls with
//   PrivyLeaseReleasedError and drops every reference it held.
import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type * as Direct from "./privy-backend";
import { PrivyLeaseReleasedError } from "./privy-lease";

export type { User } from "./privy-backend";

export type HookKind =
  | "usePrivy" | "useUser" | "useCreateWallet" | "useLogin" | "useLoginWithOAuth" | "useLinkWithOAuth"
  | "useLinkEmail" | "useLinkJwtAccount" | "useOAuthTokens" | "useSubscribeToJwtAuthWithFlag";
export type SharedKind = "usePrivy" | "useUser";
const isShared = (kind: HookKind): kind is SharedKind => kind === "usePrivy" || kind === "useUser";

type Waiting = { name: string; args: unknown[]; resolve: (value: unknown) => void; reject: (error: unknown) => void };
type Slot = { kind: HookKind; generation: number; attached: boolean; result: unknown; waiting: Waiting[] };
type Lease = Slot & { id: string; argsRef: { current: readonly unknown[] }; argsKey: string; argsVersion: number; forwarded?: { version: number; args: unknown[] } };
type Shared = Slot & { count: number };
export type MirrorEntry = Readonly<{ id: string; kind: HookKind; generation: number; argsVersion: number }>;
export type IslandSnapshot = Readonly<{ shared: readonly SharedKind[]; leases: readonly MirrorEntry[]; sharedGeneration: Readonly<Record<SharedKind, number>> }>;

/** Structural key of hook arguments; functions count as present, not by identity (they are forwarded through a ref). */
function argumentsKey(args: readonly unknown[]): string {
  return JSON.stringify(args, (_key, value: unknown) => (typeof value === "function" ? "ƒ" : value === undefined ? "∅" : value));
}

export class PrivyIslandStore {
  private readonly leases = new Map<string, Lease>();
  private readonly shared = new Map<SharedKind, Shared>();
  private readonly resultListeners = new Map<string, Set<() => void>>();
  private readonly islandListeners = new Set<() => void>();
  private readonly tickListeners = new Set<() => void>();
  private generations = 0;
  private tick = 0;
  private snapshot: IslandSnapshot = { shared: [], leases: [], sharedGeneration: { usePrivy: 0, useUser: 0 } };

  // ---- island side -------------------------------------------------------------------------------------------
  subscribeIsland = (listener: () => void) => { this.islandListeners.add(listener); return () => { this.islandListeners.delete(listener); }; };
  getIslandSnapshot = () => this.snapshot;
  /** Test devices only bump this (plan-b §7.2); the production store never does, so mirrors re-render only on SDK changes. */
  subscribeTick = (listener: () => void) => { this.tickListeners.add(listener); return () => { this.tickListeners.delete(listener); }; };
  getTick = () => this.tick;
  protected bumpTick() { this.tick += 1; for (const listener of [...this.tickListeners]) listener(); }

  /** Arguments for the SDK call: the app's own key set, callbacks forwarded to the app's latest ones. */
  mirrorArgs(id: string): unknown[] {
    const lease = this.leases.get(id);
    if (!lease) return [];
    if (lease.forwarded?.version === lease.argsVersion) return lease.forwarded.args;
    // Late-callback policy (plan-b §5.1): a callback the SDK already holds keeps calling the app's LAST callback for that
    // key, also after the lease is released (in the direct tree the SDK holds the app's own function the same way). The
    // forwarder keeps the app's ref object; a key the app no longer provides is a quiet no-op, never a TypeError.
    const appRef = lease.argsRef;
    const forward = (value: unknown, read: () => unknown): unknown => {
      if (typeof value === "function") return (...args: unknown[]) => {
        const latest = read();
        return typeof latest === "function" ? (latest as (...a: unknown[]) => unknown)(...args) : undefined;
      };
      if (value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, forward(inner, () => {
          const container = read();
          return container && typeof container === "object" ? (container as Record<string, unknown>)[key] : undefined;
        })]));
      }
      return value;
    };
    const args = appRef.current.map((value, index) => forward(value, () => appRef.current[index]));
    lease.forwarded = { version: lease.argsVersion, args };
    return args;
  }

  /** Called by a mirror's layout effect with exactly what the SDK hook returned. Stale generations are ignored. */
  publish(id: string, generation: number, result: unknown) {
    const lease = this.leases.get(id);
    if (!lease || lease.generation !== generation) return;
    this.settle(lease, result, id);
  }
  publishShared(kind: SharedKind, generation: number, result: unknown) {
    const slot = this.shared.get(kind);
    if (!slot || slot.generation !== generation) return;
    this.settle(slot, result, `shared:${kind}`);
  }
  /** Whether a mirror's new value replaces the published one. Production: always (the SDK object, unchanged). */
  protected accepts(_previous: unknown, _next: unknown, _target: string): boolean { return true; }

  private settle(slot: Slot, result: unknown, target: string) {
    const first = !slot.attached;
    if (!first && !this.accepts(slot.result, result, target)) return;
    const changed = first || !Object.is(slot.result, result);
    slot.result = result;
    slot.attached = true;
    if (first) {
      const waiting = slot.waiting.splice(0);
      for (const call of waiting) {
        try { call.resolve((result as Record<string, (...a: unknown[]) => unknown>)[call.name](...call.args)); }
        catch (error) { call.reject(error); }
      }
    }
    if (changed) for (const listener of [...(this.resultListeners.get(target) ?? [])]) listener();
  }

  // ---- app side ----------------------------------------------------------------------------------------------
  register(id: string, kind: HookKind, argsRef: { current: readonly unknown[] }): number {
    const generation = ++this.generations;
    if (isShared(kind)) {
      let slot = this.shared.get(kind);
      if (!slot) { slot = { kind, generation, attached: false, result: undefined, waiting: [], count: 0 }; this.shared.set(kind, slot); }
      slot.count += 1;
      if (slot.count === 1) this.rebuild();
      return slot.generation;
    }
    this.release(this.leases.get(id), id); // A re-register of the same id replaces the old generation (StrictMode).
    this.leases.set(id, { id, kind, generation, attached: false, result: undefined, waiting: [], argsRef, argsKey: argumentsKey(argsRef.current), argsVersion: 0 });
    this.rebuild();
    return generation;
  }

  unregister(id: string, kind: HookKind, generation: number) {
    if (isShared(kind)) {
      const slot = this.shared.get(kind);
      if (!slot || slot.generation !== generation) return;
      slot.count -= 1;
      if (slot.count > 0) return;
      this.shared.delete(kind);
      this.rejectWaiting(slot);
      this.rebuild();
      return;
    }
    const lease = this.leases.get(id);
    if (!lease || lease.generation !== generation) return;
    this.release(lease, id);
    this.rebuild();
  }

  private release(lease: Lease | undefined, id: string) {
    if (!lease) return;
    this.leases.delete(id);
    this.rejectWaiting(lease);
    // Drop the references the store held for this generation (plan-b §0-7). The app's own args ref is not cleared:
    // forwarders the SDK already holds still reach the app's last callbacks (late-callback policy, mirrorArgs).
    lease.result = undefined;
    lease.forwarded = undefined;
  }

  private rejectWaiting(slot: Slot) {
    const waiting = slot.waiting.splice(0);
    slot.result = undefined;
    for (const call of waiting) call.reject(new PrivyLeaseReleasedError(slot.kind));
  }

  /** Value arguments that change (not callback identity) re-render that mirror; callbacks are read through the ref. */
  updateArgs(id: string, argsRef: { current: readonly unknown[] }) {
    const lease = this.leases.get(id);
    if (!lease) return;
    lease.argsRef = argsRef;
    const key = argumentsKey(argsRef.current);
    if (key === lease.argsKey) return;
    lease.argsKey = key;
    lease.argsVersion += 1;
    this.rebuild();
  }

  subscribeResult(target: string, listener: () => void) {
    let listeners = this.resultListeners.get(target);
    if (!listeners) { listeners = new Set(); this.resultListeners.set(target, listeners); }
    listeners.add(listener);
    return () => { listeners.delete(listener); if (!listeners.size) this.resultListeners.delete(target); };
  }
  result(target: string): unknown {
    const slot = target.startsWith("shared:") ? this.shared.get(target.slice(7) as SharedKind) : this.leases.get(target);
    return slot?.attached ? slot.result : undefined;
  }

  /** A function value used before its mirror attached: runs against the generation current now (plan-b §0-7). */
  call(target: string, name: string, args: unknown[]): unknown {
    const slot = target.startsWith("shared:") ? this.shared.get(target.slice(7) as SharedKind) : this.leases.get(target);
    if (!slot) return Promise.reject(new PrivyLeaseReleasedError(target));
    if (slot.attached) return (slot.result as Record<string, (...a: unknown[]) => unknown>)[name](...args);
    return new Promise((resolve, reject) => { slot.waiting.push({ name, args, resolve, reject }); });
  }

  /** For tests: what this store still holds for an id (plan-b §0-7 reference release). */
  held(id: string) {
    const lease = this.leases.get(id);
    return { lease: Boolean(lease), waiting: lease?.waiting.length ?? 0, listeners: this.resultListeners.get(id)?.size ?? 0 };
  }

  private rebuild() {
    this.snapshot = {
      shared: (["usePrivy", "useUser"] as const).filter(kind => this.shared.has(kind)),
      leases: [...this.leases.values()].map(({ id, kind, generation, argsVersion }) => ({ id, kind, generation, argsVersion })),
      sharedGeneration: { usePrivy: this.shared.get("usePrivy")?.generation ?? 0, useUser: this.shared.get("useUser")?.generation ?? 0 },
    };
    for (const listener of [...this.islandListeners]) listener();
  }
}

const StoreContext = createContext<PrivyIslandStore | null>(null);

/** Holds the island store for one root. A test may hand in its own store (plan-b §7.2); production makes the default. */
export function AuthBootProvider({ store, children }: { store?: PrivyIslandStore; children: ReactNode }) {
  const [own] = useState(() => store ?? new PrivyIslandStore());
  return <StoreContext.Provider value={store ?? own}>{children}</StoreContext.Provider>;
}

export function useIslandStore(): PrivyIslandStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("Privy island hooks need AuthBootProvider (PrivyRoot) above them.");
  return store;
}

// ---- first-commit values (plan-b §5.1 table) -------------------------------------------------------------------
const INITIAL = { status: "initial" } as const;
function firstValue(kind: HookKind, call: (name: string) => (...args: unknown[]) => unknown): unknown {
  switch (kind) {
    case "usePrivy": return { ready: false, authenticated: false, user: null, login: call("login"), logout: call("logout"), getAccessToken: call("getAccessToken") };
    case "useUser": return { user: null, refreshUser: call("refreshUser") };
    case "useCreateWallet": return { createWallet: call("createWallet") };
    case "useLogin": return { login: call("login") };
    case "useLoginWithOAuth":
    case "useLinkWithOAuth": return { initOAuth: call("initOAuth"), loading: false, state: INITIAL };
    case "useLinkEmail": return { sendCode: call("sendCode"), linkWithCode: call("linkWithCode"), state: INITIAL };
    case "useLinkJwtAccount": return { linkWithCustomJwt: call("linkWithCustomJwt"), state: INITIAL };
    case "useOAuthTokens": return { reauthorize: call("reauthorize") };
    case "useSubscribeToJwtAuthWithFlag": return undefined;
  }
}

function useLease(kind: HookKind, args: readonly unknown[]): unknown {
  const store = useIslandStore();
  const id = useId();
  const target = isShared(kind) ? `shared:${kind}` : id;
  const argsRef = useRef<readonly unknown[]>(args);
  useLayoutEffect(() => {
    argsRef.current = args; // Latest callbacks for the mirror's forwarders, every commit.
    if (!isShared(kind)) store.updateArgs(id, argsRef);
  });
  useLayoutEffect(() => {
    const generation = store.register(id, kind, argsRef);
    return () => store.unregister(id, kind, generation);
  }, [store, id, kind]);
  const result = useSyncExternalStore(
    listener => store.subscribeResult(target, listener),
    () => store.result(target),
    () => undefined,
  );
  const placeholder = useMemo(() => firstValue(kind, name => (...callArgs: unknown[]) => store.call(target, name, callArgs)), [kind, store, target]);
  return result === undefined ? placeholder : result;
}

export const usePrivy: typeof Direct.usePrivy = () => useLease("usePrivy", []) as ReturnType<typeof Direct.usePrivy>;
export const useUser: typeof Direct.useUser = () => useLease("useUser", []) as ReturnType<typeof Direct.useUser>;
export const useCreateWallet: typeof Direct.useCreateWallet = (...args) => useLease("useCreateWallet", args) as ReturnType<typeof Direct.useCreateWallet>;
export const useLogin: typeof Direct.useLogin = (...args) => useLease("useLogin", args) as ReturnType<typeof Direct.useLogin>;
export const useLoginWithOAuth: typeof Direct.useLoginWithOAuth = (...args) => useLease("useLoginWithOAuth", args) as ReturnType<typeof Direct.useLoginWithOAuth>;
export const useLinkWithOAuth: typeof Direct.useLinkWithOAuth = (...args) => useLease("useLinkWithOAuth", args) as ReturnType<typeof Direct.useLinkWithOAuth>;
export const useLinkEmail: typeof Direct.useLinkEmail = (...args) => useLease("useLinkEmail", args) as ReturnType<typeof Direct.useLinkEmail>;
export const useLinkJwtAccount: typeof Direct.useLinkJwtAccount = (...args) => useLease("useLinkJwtAccount", args) as ReturnType<typeof Direct.useLinkJwtAccount>;
export const useOAuthTokens: typeof Direct.useOAuthTokens = (...args) => useLease("useOAuthTokens", args) as ReturnType<typeof Direct.useOAuthTokens>;
export const useSubscribeToJwtAuthWithFlag: typeof Direct.useSubscribeToJwtAuthWithFlag = (...args) => { useLease("useSubscribeToJwtAuthWithFlag", args); };
