// Real assembly, both backends (plan-b §5.3; Codex 1b review 중간2). This one file runs in BOTH Vitest projects:
// - default project: @/features/auth/client/privy-root is the direct ByUsPrivyProvider (PrivyProvider wraps the page);
// - island project: it is the island PrivyRoot with the production store and mirrors (no test device).
// The same assertions must hold in both: transition completed, navigation count, wallet synchronisation.
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- the real library (the island project aliases the root name to its test shim).
import * as realRtl from "@testing-library/react/dist/index.js";
import type * as RTL from "@testing-library/react";
import { LocaleProvider } from "@/components/locale-provider";
import { useByUsSession } from "@/components/byus-session-provider";
import { useLogin } from "@/features/auth/client/privy-backend";
import { PrivyRoot } from "@/features/auth/client/privy-root";

const { render, act, cleanup, waitFor, screen } = realRtl as typeof RTL;

const fake = vi.hoisted(() => {
  type State = { ready: boolean; authenticated: boolean; user: { id: string } | null };
  let state: State = { ready: true, authenticated: false, user: null };
  const listeners = new Set<() => void>();
  const loginSubscribers = new Set<{ current: { onComplete?: (value: unknown) => void } | undefined }>();
  const counts = { createWallet: 0, refreshUser: 0 };
  const wallets = new Set<string>();
  // The SDK's server-side user: refreshUser and createWallet answer for it even before its React state catches up.
  let serverUser: { id: string } | null = null;
  return {
    serverUser: () => serverUser,
    get: () => state,
    set(next: Partial<State>) { state = { ...state, ...next }; for (const listener of [...listeners]) listener(); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    emitLoginComplete(user: { id: string }) { serverUser = user; for (const subscriber of [...loginSubscribers]) subscriber.current?.onComplete?.({ user, isNewUser: false, wasAlreadyAuthenticated: false, loginMethod: "google" }); },
    loginSubscribers, counts, wallets,
    reset() { state = { ready: true, authenticated: false, user: null }; serverUser = null; counts.createWallet = 0; counts.refreshUser = 0; wallets.clear(); loginSubscribers.clear(); },
  };
});

vi.mock("@privy-io/react-auth", async () => {
  const React = await import("react");
  const useFakeState = () => React.useSyncExternalStore(fake.subscribe, fake.get, fake.get);
  const wallet = { type: "wallet", chainType: "ethereum", connectorType: "embedded", walletClientType: "privy" };
  return {
    PrivyProvider: ({ children }: { children: React.ReactNode }) => children, // direct tree only; the island uses its boundary
    usePrivy: () => ({ ...useFakeState(), login: vi.fn(), logout: vi.fn(async () => undefined), getAccessToken: async () => (fake.get().authenticated ? "token" : null) }),
    useUser: () => ({
      user: useFakeState().user,
      refreshUser: async () => { fake.counts.refreshUser += 1; const id = fake.serverUser()?.id ?? ""; return { id, linkedAccounts: fake.wallets.has(id) ? [wallet] : [] }; },
    }),
    // A new function on every call, like the SDK.
    useCreateWallet: () => ({ createWallet: async () => { fake.counts.createWallet += 1; const id = fake.serverUser()?.id; if (id) fake.wallets.add(id); return wallet; } }),
    useLogin: (callbacks?: { onComplete?: (value: unknown) => void }) => {
      const ref = React.useRef(callbacks); ref.current = callbacks;
      React.useEffect(() => { fake.loginSubscribers.add(ref); return () => { fake.loginSubscribers.delete(ref); }; }, []);
      return { login: vi.fn() };
    },
    useOAuthTokens: () => ({ reauthorize: vi.fn() }),
  };
});

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/login",
}));
vi.mock("@/features/analytics/client/signup-funnel-tracker", () => ({
  signupFunnelTracker: {
    resumeLogin: () => ({ nonce: "safe", provider: "unknown", trigger: "session_restore" }),
    result: vi.fn(), forgetLoginAttempt: vi.fn(), beginLogin: vi.fn(), stage: vi.fn(),
  },
}));

const fetchMock = vi.fn();
const sessionPosts = () => fetchMock.mock.calls.filter(call => String(call[0]) === "/api/auth/session" && (call[1] as RequestInit | undefined)?.method === "POST").length;
const context = { returnTo: "/live/kara-nualeaf", locale: "ko" as const, intent: "reserve", entity: null as string | null, authIntent: null };
let loginContext = context;

function Monitor() {
  const session = useByUsSession();
  return <output data-testid="session">{JSON.stringify({ ready: session.ready, pending: session.pending, ownerId: session.ownerId, error: session.error, destination: session.destination })}</output>;
}
const sessionState = () => JSON.parse(screen.getByTestId("session").textContent ?? "{}") as { ready: boolean; pending: boolean; ownerId: string | null; error: string | null; destination: string | null };

/** Like the login page: the SDK's onComplete starts the root-owned transition. */
function LoginCallbacks() {
  const session = useByUsSession();
  const [started, setStarted] = useState(0);
  useLogin({ onComplete: (value: unknown) => { const { user } = value as { user: { id: string } }; if (session.beginTransition({ ownerId: user.id, ...loginContext })) setStarted(count => count + 1); } });
  return <span data-testid="started">{started}</span>;
}

function app() {
  return <LocaleProvider initialLocale="ko"><PrivyRoot appId="app-id"><Monitor /><LoginCallbacks /></PrivyRoot></LocaleProvider>;
}

async function login(id: string) {
  await act(async () => {
    fake.emitLoginComplete({ id }); // SDK order: onComplete first,
    await Promise.resolve();
    fake.set({ authenticated: true, user: { id } }); // then its own state (Provider setState).
  });
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });

beforeEach(() => {
  fake.reset();
  loginContext = context;
  navigation.replace.mockReset().mockImplementation((path: string) => window.history.replaceState({}, "", path));
  window.history.replaceState({}, "", "/login");
  fetchMock.mockReset().mockImplementation(async () => Response.json({ profile: { completed: true } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe(`PrivyRoot + ByUsSessionProvider (${process.env.VITEST_ISLAND ? "island" : "direct"} backend)`, () => {
  it("completes a first login: one transition, one wallet creation, one session sync, no extra navigation", async () => {
    render(app());
    await login("fan-b");
    await waitFor(() => expect(sessionState()).toMatchObject({ ready: true, pending: false, ownerId: "fan-b", error: null }));
    await settle();
    expect(screen.getByTestId("started").textContent).toBe("1");
    expect(fake.counts.createWallet).toBe(1);
    expect(sessionPosts()).toBe(1);
    expect(navigation.replace).not.toHaveBeenCalled(); // the login page owns return navigation; the provider only redirects to onboarding
  });

  it("does not create a wallet that already exists", async () => {
    fake.wallets.add("fan-c");
    render(app());
    await login("fan-c");
    await waitFor(() => expect(sessionState()).toMatchObject({ ready: true, pending: false, ownerId: "fan-c", error: null }));
    await settle();
    expect(fake.counts.createWallet).toBe(0);
    expect(sessionPosts()).toBe(1);
  });

  it("navigates once to onboarding when an unfinished profile continues fan verification", async () => {
    fake.wallets.add("fan-d");
    loginContext = { ...context, returnTo: "/c/demo/verify", intent: "passport", entity: "demo" };
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { answer = resolve; }));
    render(app());
    await login("fan-d");
    await waitFor(() => expect(sessionState().pending).toBe(true));
    window.history.replaceState({}, "", sessionState().destination ?? "/"); // the login page has returned to the provisional destination
    await waitFor(() => expect(sessionPosts()).toBe(1));
    await act(async () => { answer(Response.json({ profile: { completed: false } })); });
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
    await settle();
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(navigation.replace.mock.calls[0][0]).toMatch(/^\/onboarding\/profile\?/);
    expect(sessionState()).toMatchObject({ ready: true, pending: false, ownerId: "fan-d", error: null });
  });

  it("switches from A to B: each finishes once and B ends as the owner", async () => {
    fake.wallets.add("fan-a"); fake.wallets.add("fan-b");
    render(app());
    await login("fan-a");
    await waitFor(() => expect(sessionState()).toMatchObject({ ready: true, ownerId: "fan-a" }));
    await act(async () => { fake.set({ authenticated: false, user: null }); await Promise.resolve(); }); // A logs out
    await login("fan-b");
    await waitFor(() => expect(sessionState()).toMatchObject({ ready: true, pending: false, ownerId: "fan-b", error: null }));
    await settle();
    expect(screen.getByTestId("started").textContent).toBe("2");
    expect(sessionPosts()).toBe(2);
    expect(fake.counts.createWallet).toBe(0);
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
