import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrivyBridgeContext, type PrivyBridge, type PrivyOAuthListener } from "@/features/auth/client/privy-bridge";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { LoginPage } from "./login-page";
import { ByUsSessionProvider } from "./byus-session-provider";
import { AdminLogin } from "./admin/admin-login";

// Privy mode (AUTH_PROVIDER=privy, PRIVY-RESTORE-1115): the page reads Privy only through PrivyBridgeContext.
const navigation = vi.hoisted(() => ({ replace: vi.fn(), back: vi.fn(), query: "returnTo=%2Fmy&locale=ko" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace, back: navigation.back }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

const wallet = { type: "wallet", chainType: "ethereum", connectorType: "embedded", walletClientType: "privy" };
let listeners: Set<PrivyOAuthListener>;
let bridge: PrivyBridge;
let state: { ready: boolean; authenticated: boolean; userId: string | null };

function makeBridge(): PrivyBridge {
  return {
    auth: {
      ready: state.ready, authenticated: state.authenticated,
      user: state.authenticated && state.userId ? { id: state.userId, linkedAccounts: [] } : null,
      getAccessToken: vi.fn(async () => "privy-token"), getPrivyAccessToken: vi.fn(async () => "privy-token"), logout: vi.fn(async () => {}), login: vi.fn(),
    },
    oauthLoading: false,
    startOAuth: vi.fn(async () => {}),
    subscribeOAuth: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    openGoogleLogin: vi.fn(),
    refreshUser: vi.fn(async () => ({ id: "did:privy:fan", linkedAccounts: [] })),
    createWallet: vi.fn(async () => ({ address: "0x1" })),
  };
}

const withBridge = (children: ReactNode) => <PrivyBridgeContext.Provider value={bridge}>{children}</PrivyBridgeContext.Provider>;
const fetchMock = vi.fn();

beforeEach(() => {
  listeners = new Set();
  state = { ready: true, authenticated: false, userId: null };
  bridge = makeBridge();
  navigation.query = "returnTo=%2Fmy&locale=ko";
  navigation.replace.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/auth/session") return new Response(JSON.stringify({ profile: { completed: true } }), { status: 200 });
    return new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

function AuthProbe() {
  const auth = useByUsAuth();
  return <output>{JSON.stringify({ ready: auth.ready, authenticated: auth.authenticated, user: auth.user?.id ?? null })}</output>;
}

describe("privy mode", () => {
  it("useByUsAuth reads the Privy bridge when no Cognito provider is mounted", () => {
    state = { ready: true, authenticated: true, userId: "did:privy:fan" };
    bridge = makeBridge();
    render(withBridge(<AuthProbe />));
    expect(screen.getByRole("status")).toHaveTextContent('{"ready":true,"authenticated":true,"user":"did:privy:fan"}');
  });

  it("starts Google and Apple in Privy, never through the Cognito route, and hides the Cognito-only methods", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, origin: "http://localhost", href: "http://localhost/login" });
    render(withBridge(<ByUsSessionProvider><LoginPage appleLoginEnabled cognitoKakaoEnabled /></ByUsSessionProvider>));
    expect(screen.queryByRole("button", { name: "카카오로 계속하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /이메일/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Google로 계속하기/ }));
    await waitFor(() => expect(bridge.startOAuth).toHaveBeenCalledWith("google"));
    // The browser is leaving for Google: a second tap starts nothing.
    expect(screen.getByRole("button", { name: /Apple로 계속하기/ })).toBeDisabled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("starts Apple in Privy", async () => {
    render(withBridge(<ByUsSessionProvider><LoginPage appleLoginEnabled /></ByUsSessionProvider>));
    fireEvent.click(screen.getByRole("button", { name: /Apple로 계속하기/ }));
    await waitFor(() => expect(bridge.startOAuth).toHaveBeenCalledWith("apple"));
  });

  it("shows the sign-in error when Privy reports an OAuth failure", async () => {
    render(withBridge(<ByUsSessionProvider><LoginPage /></ByUsSessionProvider>));
    await waitFor(() => expect(listeners.size).toBe(1));
    act(() => { for (const listener of listeners) listener.onError(); });
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인을 완료하지 못했어요. Google 계정을 확인한 뒤 다시 시도해 주세요.");
  });

  it("on the OAuth return confirms the Privy user, creates the missing embedded wallet, then syncs the session with the Privy token", async () => {
    render(withBridge(<ByUsSessionProvider><LoginPage /></ByUsSessionProvider>));
    await waitFor(() => expect(listeners.size).toBe(1));
    act(() => { for (const listener of listeners) listener.onComplete("did:privy:fan"); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer privy-token" }) })));
    expect(bridge.refreshUser).toHaveBeenCalled();
    expect(bridge.createWallet).toHaveBeenCalledTimes(1);
  });

  it("does not create a wallet the Privy user already has", async () => {
    bridge = { ...makeBridge(), refreshUser: vi.fn(async () => ({ id: "did:privy:fan", linkedAccounts: [wallet] })) };
    render(withBridge(<ByUsSessionProvider><LoginPage /></ByUsSessionProvider>));
    await waitFor(() => expect(listeners.size).toBe(1));
    act(() => { for (const listener of listeners) listener.onComplete("did:privy:fan"); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.anything()));
    expect(bridge.createWallet).not.toHaveBeenCalled();
  });

  it("waits for Privy to clean its OAuth return parameters before navigating away", async () => {
    navigation.query = "returnTo=%2Fmy&locale=ko&privy_oauth_code=c&privy_oauth_state=s&privy_oauth_provider=google";
    state = { ready: true, authenticated: true, userId: "did:privy:fan" };
    bridge = { ...makeBridge(), refreshUser: vi.fn(async () => ({ id: "did:privy:fan", linkedAccounts: [wallet] })) };
    const view = render(withBridge(<ByUsSessionProvider><LoginPage /></ByUsSessionProvider>));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", expect.anything()));
    await act(async () => {});
    expect(navigation.replace).not.toHaveBeenCalled();
    navigation.query = "returnTo=%2Fmy&locale=ko";
    view.rerender(withBridge(<ByUsSessionProvider><LoginPage /></ByUsSessionProvider>));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/my?locale=ko"));
  });

  it("opens Privy's Google sign-in for the operator login", () => {
    render(withBridge(<AdminLogin />));
    fireEvent.click(screen.getByRole("button", { name: /Google로 관리자 로그인/ }));
    expect(bridge.openGoogleLogin).toHaveBeenCalledTimes(1);
  });
});
