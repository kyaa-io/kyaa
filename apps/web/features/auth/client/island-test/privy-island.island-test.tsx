// Island-only tests (plan-b §5.2, §5.3, §0-7). Run by vitest.island.config.ts. They use the PRODUCTION store and mirrors:
// no Profiler tick, no data comparison, no forced publish (those belong to the 14-file device only, plan-b §7.2).
// The SDK fake keeps its own state like a Provider (useSyncExternalStore) and counts instances and side effects.
import { StrictMode, useEffect, useRef, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- the real library (the island project aliases the root name to its test shim).
import * as realRtl from "@testing-library/react/dist/index.js";
import type * as RTL from "@testing-library/react";
import * as direct from "../privy-backend";
import * as island from "@/features/auth/client/privy-backend";
import { AuthBootProvider, PrivyIslandStore } from "../privy-backend.island";
import { PrivyIsland } from "../privy-root.island";
import { PrivyLeaseReleasedError, isPrivyLeaseReleased } from "../privy-lease";

const { render, act, cleanup, waitFor, screen } = realRtl as typeof RTL;

const fake = vi.hoisted(() => {
  type State = { ready: boolean; authenticated: boolean; user: { id: string } | null };
  let state: State = { ready: true, authenticated: false, user: null };
  const listeners = new Set<() => void>();
  const loginSubscribers = new Set<{ current: { onComplete?: (value: unknown) => void } | undefined }>();
  const counts = { loginWithOAuth: 0, linkWithOAuth: 0, jwt: 0, loginReturn: 0, linkReturn: 0, createWallet: 0, initOAuth: 0 };
  const calls = { loginWithOAuthArgs: [] as unknown[][], jwtArgs: [] as unknown[] };
  const initOAuth = vi.fn(async () => { counts.initOAuth += 1; });
  return {
    get: () => state,
    set(next: Partial<State>) { state = { ...state, ...next }; for (const listener of [...listeners]) listener(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    emitLoginComplete(user: { id: string }) { for (const subscriber of [...loginSubscribers]) subscriber.current?.onComplete?.({ user }); },
    loginSubscribers, counts, calls, initOAuth,
    reset() { state = { ready: true, authenticated: false, user: null }; for (const key of Object.keys(counts) as (keyof typeof counts)[]) counts[key] = 0; calls.loginWithOAuthArgs = []; calls.jwtArgs = []; initOAuth.mockClear(); },
  };
});

vi.mock("@privy-io/react-auth", async () => {
  const React = await import("react");
  const useState = () => React.useSyncExternalStore(fake.subscribe, fake.get, fake.get);
  return {
    usePrivy: () => ({ ...useState(), login: vi.fn(), logout: vi.fn(async () => undefined), getAccessToken: vi.fn(async () => (fake.get().authenticated ? "token" : null)) }),
    useUser: () => ({ user: useState().user, refreshUser: vi.fn(async () => fake.get().user) }),
    useLogin: (callbacks?: { onComplete?: (value: unknown) => void }) => {
      const ref = React.useRef(callbacks); ref.current = callbacks;
      React.useEffect(() => { fake.loginSubscribers.add(ref); return () => { fake.loginSubscribers.delete(ref); }; }, []);
      return { login: vi.fn() };
    },
    useLoginWithOAuth: (...args: unknown[]) => {
      fake.calls.loginWithOAuthArgs.push(args);
      React.useEffect(() => {
        fake.counts.loginWithOAuth += 1;
        if (new URLSearchParams(location.search).has("privy_oauth_code")) fake.counts.loginReturn += 1;
        return () => { fake.counts.loginWithOAuth -= 1; };
      }, []);
      return { initOAuth: fake.initOAuth, loading: false, state: { status: "initial" } };
    },
    useLinkWithOAuth: () => {
      React.useEffect(() => {
        fake.counts.linkWithOAuth += 1;
        if (new URLSearchParams(location.search).has("privy_oauth_code")) fake.counts.linkReturn += 1;
        return () => { fake.counts.linkWithOAuth -= 1; };
      }, []);
      return { initOAuth: vi.fn(), loading: false, state: { status: "initial" } };
    },
    // A new function on every call, like the SDK (plan-b §0-6 중간2).
    useCreateWallet: () => ({ createWallet: async () => { fake.counts.createWallet += 1; return {}; } }),
    useSubscribeToJwtAuthWithFlag: (options: unknown) => {
      fake.calls.jwtArgs.push(options);
      React.useEffect(() => { fake.counts.jwt += 1; return () => { fake.counts.jwt -= 1; }; }, []);
    },
    useLinkEmail: () => ({ sendCode: vi.fn(), linkWithCode: vi.fn(), state: { status: "initial" } }),
    useLinkJwtAccount: () => ({ linkWithCustomJwt: vi.fn(), state: { status: "initial" } }),
    useOAuthTokens: () => ({ reauthorize: vi.fn() }),
  };
});

// For the real CognitoWalletLink (StrictMode test): enrollment "new" with Google, no marker yet.
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/locale-provider", () => ({ usePageLocale: () => "ko", useAppLocale: () => ({ locale: "ko", setLocale: () => undefined }) }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useCognitoAuth: () => ({ loading: false, session: { authenticated: true, walletLinked: false, enrollment: { mode: "new", provider: "google" } }, refresh: vi.fn() }) }));
import { CognitoWalletLink } from "../cognito-wallet-link";

type Hooks = typeof direct;
const BACKENDS: [string, Hooks][] = [["direct", direct], ["island", island as Hooks]];

function Root({ store, children }: { store: PrivyIslandStore; children: ReactNode }) {
  return <AuthBootProvider store={store}><PrivyIsland appId="test" config={{}} /><main data-app="">{children}</main></AuthBootProvider>;
}
/** Direct needs no root here (the fake reads module state); the island needs its root with the production store. */
function mount(name: string, ui: ReactNode, store = new PrivyIslandStore()) {
  return { store, ...render(name === "island" ? <Root store={store}>{ui}</Root> : <>{ui}</>) };
}

beforeEach(() => { fake.reset(); window.history.replaceState({}, "", "/"); });
afterEach(() => { cleanup(); });

describe("Privy island tree", () => {
  it("keeps the page beside the Privy Provider, with exactly one Provider", () => {
    const { container } = mount("island", <span data-page="" />);
    expect(container.querySelectorAll("[data-island-privy-provider]")).toHaveLength(1);
    expect(container.querySelector("[data-island-privy-provider] [data-page]")).toBeNull();
    expect(container.querySelector("main [data-page]")).not.toBeNull();
  });
});

describe("leases mirror the app's hook instances (plan-b §5.2, §5.3)", () => {
  function Login({ hooks }: { hooks: Hooks }) { hooks.useLoginWithOAuth(); return null; }
  function Link({ hooks }: { hooks: Hooks }) { hooks.useLinkWithOAuth(); return null; }
  function Jwt({ hooks, enabled }: { hooks: Hooks; enabled: boolean }) { hooks.useSubscribeToJwtAuthWithFlag({ enabled, isAuthenticated: true, isLoading: false, getExternalJwt: async () => "jwt" }); return null; }

  it.each(BACKENDS)("%s: an OAuth return is processed only by a screen that uses the hook", (name, hooks) => {
    window.history.replaceState({}, "", "/c/demo?privy_oauth_code=x&privy_oauth_state=y&privy_oauth_provider=google");
    const { rerender } = mount(name, <span />);
    expect([fake.counts.loginReturn, fake.counts.linkReturn, fake.counts.loginWithOAuth, fake.counts.linkWithOAuth]).toEqual([0, 0, 0, 0]);
    const wrap = (ui: ReactNode) => (name === "island" ? <Root store={new PrivyIslandStore()}>{ui}</Root> : ui);
    cleanup();
    const second = render(wrap(<Link hooks={hooks} />));
    expect([fake.counts.loginReturn, fake.counts.linkReturn, fake.counts.loginWithOAuth, fake.counts.linkWithOAuth]).toEqual([0, 1, 0, 1]);
    second.unmount();
    expect(fake.counts.linkWithOAuth).toBe(0);
    void rerender;
  });

  it.each(BACKENDS)("%s: one SDK instance per app instance, gone when the app instance goes", (name, hooks) => {
    const { rerender } = mount(name, <><Login hooks={hooks} /><Login hooks={hooks} /></>);
    expect(fake.counts.loginWithOAuth).toBe(2);
    rerender(name === "island" ? <Root store={new PrivyIslandStore()}><Login hooks={hooks} /></Root> : <Login hooks={hooks} />);
    expect(fake.counts.loginWithOAuth).toBe(name === "island" ? 1 : 1);
  });

  it.each(BACKENDS)("%s: the JWT hook has one instance only where the app calls it, with the app's values", async (name, hooks) => {
    const store = new PrivyIslandStore();
    const ui = (enabled: boolean) => (name === "island" ? <Root store={store}><Jwt hooks={hooks} enabled={enabled} /></Root> : <Jwt hooks={hooks} enabled={enabled} />);
    const { rerender, unmount } = render(ui(false));
    expect(fake.counts.jwt).toBe(1);
    expect((fake.calls.jwtArgs.at(-1) as { enabled: boolean }).enabled).toBe(false);
    rerender(ui(true));
    await waitFor(() => expect((fake.calls.jwtArgs.at(-1) as { enabled: boolean }).enabled).toBe(true));
    unmount();
    expect(fake.counts.jwt).toBe(0);
  });

  it("passes the app's callback key set unchanged, and no argument when the app passes none", () => {
    function Both() { island.useLoginWithOAuth(); island.useLoginWithOAuth({ onComplete: () => undefined }); return null; }
    mount("island", <Both />);
    const shapes = fake.calls.loginWithOAuthArgs.map(args => (args.length === 0 ? "none" : Object.keys(args[0] as object).join(",")));
    expect(new Set(shapes)).toEqual(new Set(["none", "onComplete"]));
  });

  it("hands the app the SDK's own object once attached", () => {
    let seen: unknown;
    function Reader() { seen = island.useLinkEmail(); return null; }
    const { store } = mount("island", <Reader />);
    const published = store.result(store.getIslandSnapshot().leases[0].id);
    expect(seen).toBe(published);
    expect(published).toEqual(expect.objectContaining({ state: { status: "initial" } }));
  });
});

describe("callback order and identity on a self-updating SDK (plan-b §5.3, production store)", () => {
  const log = { atCallback: [] as unknown[], users: [] as (string | null)[], callbacks: 0, walletEffect: 0 };
  function Session({ hooks }: { hooks: Hooks }) {
    const { user } = hooks.usePrivy();
    const { createWallet } = hooks.useCreateWallet();
    const latest = useRef(user);
    const created = useRef(false);
    useEffect(() => { latest.current = user; log.users.push(user?.id ?? null); });
    hooks.useLogin({ onComplete: () => { log.callbacks += 1; log.atCallback.push(latest.current?.id ?? null); } });
    useEffect(() => {
      log.walletEffect += 1; // Runs whenever createWallet's identity changes (counts may differ: allowed diff ③).
      if (user && !created.current) { created.current = true; void createWallet(); }
    }, [createWallet, user]);
    return <span>{user?.id ?? "guest"}</span>;
  }

  it.each(BACKENDS)("%s: the callback sees the old owner, the state arrives after, and the wallet is created once", async (name, hooks) => {
    Object.assign(log, { atCallback: [], users: [], callbacks: 0, walletEffect: 0 });
    mount(name, <Session hooks={hooks} />);
    await act(async () => {
      fake.emitLoginComplete({ id: "B" }); // SDK order: onComplete first,
      await Promise.resolve();
      fake.set({ authenticated: true, user: { id: "B" } }); // then its own state.
    });
    await screen.findByText("B");
    expect(log.atCallback).toEqual([null]);
    expect(log.callbacks).toBe(1);
    expect(fake.counts.createWallet).toBe(1);
    const firstB = log.users.indexOf("B");
    expect(log.users.slice(firstB).every(id => id === "B")).toBe(true); // never back to null after B
  });
});

describe("lease generations (plan-b §0-7)", () => {
  it("rejects a call still waiting when its lease is released, and keeps nothing for it", async () => {
    const store = new PrivyIslandStore();
    const ref = { current: [] as unknown[] };
    const generation = store.register("lease-a", "useLoginWithOAuth", ref);
    const waiting = store.call("lease-a", "initOAuth", [{ provider: "google" }]) as Promise<unknown>;
    store.unregister("lease-a", "useLoginWithOAuth", generation);
    await expect(waiting).rejects.toBeInstanceOf(PrivyLeaseReleasedError);
    expect(store.held("lease-a")).toEqual({ lease: false, waiting: 0, listeners: 0 });
  });

  it("decides attach-versus-release by which reaches the store first, every time", async () => {
    for (let run = 0; run < 10; run += 1) {
      const initOAuth = vi.fn(async () => "started");
      const first = new PrivyIslandStore();
      const g1 = first.register("x", "useLoginWithOAuth", { current: [] });
      const attachedFirst = first.call("x", "initOAuth", []) as Promise<unknown>;
      first.publish("x", g1, { initOAuth });
      first.unregister("x", "useLoginWithOAuth", g1);
      await expect(attachedFirst).resolves.toBe("started");
      expect(initOAuth).toHaveBeenCalledTimes(1);

      const second = new PrivyIslandStore();
      const g2 = second.register("x", "useLoginWithOAuth", { current: [] });
      const releasedFirst = second.call("x", "initOAuth", []) as Promise<unknown>;
      second.unregister("x", "useLoginWithOAuth", g2);
      second.publish("x", g2, { initOAuth }); // stale: ignored
      await expect(releasedFirst).rejects.toSatisfy(isPrivyLeaseReleased);
      expect(initOAuth).toHaveBeenCalledTimes(1);
    }
  });

  it("does not carry a released generation's waiting call into the next one", async () => {
    const store = new PrivyIslandStore();
    const initOAuth = vi.fn();
    const g1 = store.register("y", "useLoginWithOAuth", { current: [] });
    const old = store.call("y", "initOAuth", ["old"]) as Promise<unknown>;
    store.unregister("y", "useLoginWithOAuth", g1);
    const g2 = store.register("y", "useLoginWithOAuth", { current: [] });
    const fresh = store.call("y", "initOAuth", ["new"]) as Promise<unknown>;
    store.publish("y", g2, { initOAuth });
    await expect(old).rejects.toBeInstanceOf(PrivyLeaseReleasedError);
    await fresh;
    expect(initOAuth.mock.calls).toEqual([["new"]]);
  });

  it("starts the wallet-link enrollment once under StrictMode, with no error left behind (real CognitoWalletLink)", async () => {
    sessionStorage.clear();
    const store = new PrivyIslandStore();
    // The shared usePrivy mirror is already ready (client navigation into the page, plan-b §0-5 M-2).
    function Already() { island.usePrivy(); return null; }
    function Page({ open }: { open: boolean }) {
      return <Root store={store}><Already />{open && <StrictMode><CognitoWalletLink appleLoginEnabled={false} /></StrictMode>}</Root>;
    }
    const view = render(<Page open={false} />);
    view.rerender(<Page open />);
    await waitFor(() => expect(fake.initOAuth).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(fake.initOAuth).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("kyaa-cognito-wallet-reauth")).not.toBe("failed");
    expect(view.container.querySelector("[role=alert]")).toBeNull();
    expect(store.getIslandSnapshot().leases.filter(entry => entry.kind === "useLoginWithOAuth")).toHaveLength(1);
  });
});

describe("pre-attach calls (plan-b §5.1 M-2)", () => {
  it("waits for the mirror, then calls the SDK function once", async () => {
    function Starter() {
      const { initOAuth } = island.useLoginWithOAuth();
      const [done, setDone] = useState(false);
      useEffect(() => { void Promise.resolve(initOAuth({ provider: "google" })).then(() => setDone(true)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return done ? <span>started</span> : null;
    }
    function Already() { island.usePrivy(); return null; }
    const store = new PrivyIslandStore();
    const view = render(<Root store={store}><Already /></Root>);
    view.rerender(<Root store={store}><Already /><Starter /></Root>);
    await screen.findByText("started");
    expect(fake.initOAuth).toHaveBeenCalledTimes(1);
  });
});
