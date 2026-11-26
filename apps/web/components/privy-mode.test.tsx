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
let state: { ready: boolean; authenticated: boolean; userId: string | null; linkedAccounts?: Array<{ type: string }> };

function makeBridge(): PrivyBridge {
  return {
    auth: {
      ready: state.ready, authenticated: state.authenticated,
      user: state.authenticated && state.userId ? { id: state.userId, linkedAccounts: state.linkedAccounts ?? [] } : null,
      getAccessToken: vi.fn(async () => "privy-token"), getPrivyAccessToken: vi.fn(async () => "privy-token"), logout: vi.fn(async () => {}), login: vi.fn(),
    },
    oauthLoading: false,
    startOAuth: vi.fn(async () => {}),
    subscribeOAuth: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    loginMethodsAvailable: vi.fn(async () => ({ email: true, twitter: true })),
    openEmailLogin: vi.fn(),
    openEmailLink: vi.fn(),
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

  it.each([
    ["iPhone Instagram", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/22B83 Instagram 350.0.2.15.84"],
    ["iPhone X", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/22B83 Twitter for iPhone"],
    ["Android X", "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 TwitterAndroid"],
    ["Android TikTok", "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36 musical_ly_36.5.0"],
    ["Telegram", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/22B83 Telegram"],
  ])("puts email first, then X, then Apple, and no Google button inside %s", async (_name, ua) => {
      const agent = vi.spyOn(navigator,"userAgent","get").mockReturnValue(ua);
      try {
        render(withBridge(<ByUsSessionProvider><LoginPage appleLoginEnabled /></ByUsSessionProvider>));
        const apple = screen.getByRole("button",{name:/Apple로 계속하기/});
        const email = await screen.findByRole("button",{name:/이메일로 계속하기/});
        const x = screen.getByRole("button",{name:/X로 계속하기/});
        expect(Boolean(email.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(Boolean(x.compareDocumentPosition(apple) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(screen.queryByRole("button",{name:/Google로 계속하기/})).toBeNull();
        fireEvent.click(email);
        expect(bridge.openEmailLogin).toHaveBeenCalledOnce();
      } finally { agent.mockRestore(); }
    });
  it("keeps email and X off the in-app screen while Privy has them switched off (email answers 403 not allowed)", async () => {
    bridge.loginMethodsAvailable = vi.fn(async () => ({ email: false, twitter: false }));
    const agent = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/22B83 Twitter for iPhone");
    try {
      render(withBridge(<ByUsSessionProvider><LoginPage appleLoginEnabled /></ByUsSessionProvider>));
      await waitFor(() => expect(bridge.loginMethodsAvailable).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: /이메일로 계속하기/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /X로 계속하기/ })).toBeNull();
      expect(screen.getByRole("button", { name: /Apple로 계속하기/ })).toBeEnabled();
      expect(screen.getByRole("button", { name: "로그인 링크 복사" })).toBeEnabled();
    } finally { agent.mockRestore(); }
  });
  it("orders the ordinary browser Google, email, X, Apple with no browser hint, and starts X in Privy", async () => {
    const agent = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1");
    try {
      render(withBridge(<ByUsSessionProvider><LoginPage appleLoginEnabled /></ByUsSessionProvider>));
      const google = screen.getByRole("button", { name: /Google로 계속하기/ });
      const email = await screen.findByRole("button", { name: /이메일로 계속하기/ });
      const x = screen.getByRole("button", { name: /X로 계속하기/ });
      const apple = screen.getByRole("button", { name: /Apple로 계속하기/ });
      const order = [google, email, x, apple];
      for (let index = 1; index < order.length; index += 1) {
        expect(Boolean(order[index - 1]!.compareDocumentPosition(order[index]!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      }
      expect(screen.queryByRole("button", { name: "로그인 링크 복사" })).toBeNull();
      fireEvent.click(x);
      await waitFor(() => expect(bridge.startOAuth).toHaveBeenCalledWith("twitter"));
      fireEvent.click(email);
      expect(bridge.openEmailLogin).not.toHaveBeenCalled(); // the X start is under way
    } finally { agent.mockRestore(); }
  });
  it("asks an X account with no email for an email code, then retries the same sign-in once the address is linked", async () => {
    state = { ready: true, authenticated: true, userId: "did:privy:x-fan", linkedAccounts: [{ type: "twitter_oauth" }] };
    const refreshUser = vi.fn(async () => ({ id: "did:privy:x-fan", linkedAccounts: [wallet] }));
    bridge = { ...makeBridge(), refreshUser };
    fetchMock.mockImplementation(async (url: string) => url === "/api/auth/session"
      ? new Response(JSON.stringify({ error: { code: "VERIFIED_EMAIL_REQUIRED" } }), { status: 403 })
      : new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }));
    const view = render(withBridge(<ByUsSessionProvider><LoginPage appleLoginEnabled /></ByUsSessionProvider>));
    const link = await screen.findByRole("button", { name: "이메일로 계속하기" });
    expect(screen.getByText(/X 계정에는 이메일이 없어요/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다른 계정으로 로그인" })).toBeEnabled();
    fireEvent.click(link);
    expect(bridge.openEmailLink).toHaveBeenCalledOnce();
    const sessionCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/auth/session").length;
    const before = sessionCalls();
    fetchMock.mockImplementation(async (url: string) => url === "/api/auth/session"
      ? new Response(JSON.stringify({ profile: { completed: true } }), { status: 200 })
      : new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }));
    state = { ...state, linkedAccounts: [{ type: "twitter_oauth" }, { type: "email" }] };
    bridge = { ...makeBridge(), refreshUser, openEmailLink: bridge.openEmailLink };
    view.rerender(withBridge(<ByUsSessionProvider><LoginPage appleLoginEnabled /></ByUsSessionProvider>));
    await waitFor(() => expect(sessionCalls()).toBeGreaterThan(before));
  });
  // RAFFLE-FUNNEL-CHECK-1123: inside X the "Google · Safari ↗" link did nothing (X ignores x-safari-https://). It is replaced by
  // the copy-link notice, and the copied sign-in link keeps the raffle's ?enter=1 so entry continues in the browser.
  it("shows the open-in-browser notice and copy link in place of the dead Google link inside X", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, origin: "https://kyaa.io", href: "https://kyaa.io/login" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    navigation.query = "returnTo=%2Fs%2Fraffle%3Fenter%3D1&locale=en";
    const agent = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Twitter for iPhone");
    try {
      render(withBridge(<ByUsSessionProvider><LoginPage appleLoginEnabled /></ByUsSessionProvider>));
      expect(screen.queryByRole("button", { name: /Safari/ })).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent("Open in your browser to sign in with Google.");
      fireEvent.click(screen.getByRole("button", { name: "Copy sign-in link" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      const link = new URL(String(writeText.mock.calls[0]?.[0]));
      expect(link.origin + link.pathname).toBe("https://kyaa.io/login");
      const back = new URL(link.searchParams.get("returnTo") ?? "", "https://kyaa.io");
      expect(back.pathname).toBe("/s/raffle");
      expect(back.searchParams.get("enter")).toBe("1");
      expect(assign).not.toHaveBeenCalled();
    } finally { agent.mockRestore(); }
  });
  it("copies the raffle link with its campaign tag on the sign-in address too", async () => {
    vi.stubGlobal("location", { ...window.location, assign: vi.fn(), origin: "https://kyaa.io", href: "https://kyaa.io/login" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    navigation.query = new URLSearchParams({ returnTo: "/s/raffle?utm_source=x&utm_medium=paid&utm_campaign=raffle-1125&utm_content=x-ad-1&enter=1", locale: "en" }).toString();
    const agent = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Twitter for iPhone");
    try {
      render(withBridge(<ByUsSessionProvider><LoginPage appleLoginEnabled /></ByUsSessionProvider>));
      fireEvent.click(screen.getByRole("button", { name: "Copy sign-in link" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      const link = new URL(String(writeText.mock.calls[0]?.[0]));
      expect(Object.fromEntries([...link.searchParams].filter(([key]) => key.startsWith("utm_")))).toEqual({ utm_source: "x", utm_medium: "paid", utm_campaign: "raffle-1125", utm_content: "x-ad-1" });
      const back = new URL(link.searchParams.get("returnTo") ?? "", "https://kyaa.io");
      expect(back.searchParams.get("utm_campaign")).toBe("raffle-1125");
      expect(back.searchParams.get("enter")).toBe("1");
    } finally { agent.mockRestore(); }
  });
  it("keeps the Google hand-off link where it works and adds the notice after a tap", () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, origin: "https://kyaa.io", href: "https://kyaa.io/login" });
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const agent = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 KAKAOTALK 11.0.0");
    try {
      render(withBridge(<ByUsSessionProvider><LoginPage appleLoginEnabled /></ByUsSessionProvider>));
      expect(screen.getByRole("button", { name: "로그인 링크 복사" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: /Google · Safari/ }));
      expect(String(assign.mock.calls[0]?.[0])).toMatch(/^kakaotalk:\/\/web\/openExternal\?url=/);
      expect(screen.getByRole("button", { name: "로그인 링크 복사" })).toBeEnabled();
    } finally { agent.mockRestore(); }
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
