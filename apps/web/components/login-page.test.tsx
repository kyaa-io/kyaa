import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { StrictMode, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./login-page";
import { signupFunnelTracker } from "../features/analytics/client/signup-funnel-tracker";
import { ByUsSessionProvider, SDK_WAIT_ROUNDS } from "./byus-session-provider";
import * as sessionModule from "./byus-session-provider";
import { CognitoAuthProvider } from "../features/auth/client/cognito-auth";

const replace = vi.fn();
const back = vi.fn();
const assign = vi.fn();
const getAccessToken = vi.fn();
let currentUserId = "restored-fan";
const logout = vi.fn();
let authenticated = false;
let ready = true;
let query = "returnTo=%2Flive%2Fkara-nualeaf&intent=reserve";
const markAvatarSessionReady = vi.fn();

vi.mock("./avatar-session-bridge", () => ({
  useAvatarSessionReady: () => markAvatarSessionReady,
  useAvatarSessionReset: () => vi.fn(),
}));

// The login page reads kyaa's server session through useByUsAuth; without CognitoAuthProvider that is the fallback hook.
vi.mock("@/features/auth/client/auth-fallback", () => ({
  usePrivy: () => ({ ready, authenticated, getAccessToken, logout, login: vi.fn(), user: authenticated ? { id: currentUserId, linkedAccounts: [] } : null }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace }),
  useSearchParams: () => new URLSearchParams(query),
}));

function render(ui: ReactElement) {
  const view = rtlRender(<ByUsSessionProvider>{ui}</ByUsSessionProvider>);
  return {
    ...view,
    rerender(next: ReactElement) {
      view.rerender(<ByUsSessionProvider>{next}</ByUsSessionProvider>);
    },
  };
}

describe("login page (Cognito)", () => {
  it("keeps the shared header language switch on the standalone login page (N19)", () => {
    render(<LoginPage />);
    const switches = document.querySelectorAll("[data-language-switch]");
    expect(switches).toHaveLength(1);
    expect(switches[0]).toHaveAccessibleName("언어 선택, 현재 한국어");
  });
  it("keeps the first screen for sign-in with the compact footer (login-space-1113)", () => {
    render(<LoginPage />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveAttribute("data-footer-variant", "compact");
    expect(within(footer).queryByRole("navigation")).not.toBeInTheDocument();
    expect(within(footer).getByRole("link", { name: "이용약관 열기" })).toBeInTheDocument();
  });
  it("keeps the language switch beside Close in the login overlay", () => {
    render(<LoginPage presentation="overlay" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll("[data-language-switch]")).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "로그인 창 닫기" })).toBeInTheDocument();
  });
  it("offers only Google by default, with Apple and Kakao behind their settings and no Privy-only method", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /Google로 계속하기/ })).toBeEnabled();
    for (const name of ["카카오로 계속하기", "위챗으로 계속하기", /Apple로 계속하기/, /Test Account/]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  });

  it.each([
    ["google", /Google로 계속하기/, {}],
    ["apple", /Apple로 계속하기/, { appleLoginEnabled: true }],
    ["kakao", "카카오로 계속하기", { cognitoKakaoEnabled: true }],
  ] as const)("starts %s through the Cognito start route with the sanitized return and locale, once", async (provider, name, props) => {
    const begin = vi.spyOn(signupFunnelTracker, "beginLogin");
    query = "returnTo=%2Fmy%3Ftab%3Dstamps&locale=ko";
    render(<LoginPage {...props} />);
    const button = screen.getByRole("button", { name });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(assign).toHaveBeenCalledOnce();
    const destination = new URL(String(assign.mock.calls[0]![0]));
    expect(destination.pathname).toBe("/api/auth/cognito/start");
    expect(Object.fromEntries(destination.searchParams)).toEqual({ provider, returnTo: "/my?tab=stamps&locale=ko", locale: "ko" });
    expect(begin).toHaveBeenCalledWith(provider, "provider", "ko");
    expect(button).toBeDisabled();
    begin.mockRestore();
  });

  it.each([
    ["returnTo=%2Fc%2Fkara%2Fverify&intent=passport&entity=kara&locale=ko", false, "/onboarding/profile"],
    ["returnTo=%2Fc%2Fkara%2Fverify&intent=passport&entity=kara&locale=ko", true, "/c/kara/verify?locale=ko"],
    ["returnTo=%2Fmy&intent=reserve&locale=ko", false, "/my?locale=ko"],
  ])("after a Cognito sign-in returns to the page or to profile onboarding only for fan verification (%s, completed=%s)", async (nextQuery, completed, path) => {
    query = nextQuery;
    authenticated = true;
    currentUserId = "kyaa:7c9e6679-7425-40de-944b-e07fc1f90ae7";
    vi.mocked(globalThis.fetch).mockResolvedValue(Response.json({ profile: { completed } }));
    render(<LoginPage />);
    await waitFor(() => expect(replace.mock.calls.some(([value]) => String(value).startsWith(path))).toBe(true));
    if (path === "/onboarding/profile") expect(replace).toHaveBeenCalledWith("/onboarding/profile?returnTo=%2Fc%2Fkara%2Fverify%3Flocale%3Dko&locale=ko&intent=passport&entity=kara");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer privy-access-token" }) }));
    expect(markAvatarSessionReady).toHaveBeenCalledWith("kyaa:7c9e6679-7425-40de-944b-e07fc1f90ae7");
  });

  it("keeps a failed session sync recoverable and retries it", async () => {
    authenticated = true;
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValue(Response.json({ profile: { completed: true } }));
    render(<LoginPage />);
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/live/kara-nualeaf?locale=ko"));
  });

  afterEach(() => {
    vi.spyOn(window.navigator, "userAgent", "get").mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal("location", { ...window.location, assign, origin: window.location.origin, href: window.location.href });
    assign.mockClear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    replace.mockClear(); back.mockClear();
    markAvatarSessionReady.mockClear();
    currentUserId = "restored-fan";
    authenticated = false;
    ready = true;
    query = "returnTo=%2Flive%2Fkara-nualeaf&intent=reserve";
    getAccessToken.mockReset().mockResolvedValue("privy-access-token");
    logout.mockResolvedValue(undefined);
    logout.mockClear();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ profile: { completed: true, nickname: "John" } }));
    vi.mocked(globalThis.fetch).mockClear();
  });

  it.each([
    ["email_in_use", "이 이메일을 쓰는 kyaa 계정이 이미 있어요. 처음 가입할 때 쓴 방법으로 로그인해 주세요."],
    ["inactive", "이용이 중지된 계정이에요."],
    ["ambiguous", "계정을 확인하지 못했어요. 이용 안내의 문의하기로 kyaa 운영팀에 알려 주세요."],
    ["callback_failed", "로그인을 마치지 못했어요. 다시 시도해 주세요."],
  ])("explains a sign-in the server refused (%s)", async (reason, message) => {
    authenticated = false;
    query = `returnTo=%2Fmy&locale=ko&authError=${reason}`;
    render(<LoginPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("starts Kakao through Cognito only when Cognito Kakao login is enabled", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async () => new Response(null, { status: 401 }));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign, origin: window.location.origin, href: window.location.href });
    const view = rtlRender(<CognitoAuthProvider><ByUsSessionProvider><LoginPage /></ByUsSessionProvider></CognitoAuthProvider>);
    expect(screen.queryByRole("button", { name: /카카오/ })).toBeNull();
    view.unmount();
    rtlRender(<CognitoAuthProvider><ByUsSessionProvider><LoginPage cognitoKakaoEnabled /></ByUsSessionProvider></CognitoAuthProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /카카오/ }));
    expect(String(assign.mock.calls[0]?.[0])).toContain("/api/auth/cognito/start?provider=kakao");
  });

  it("synchronizes normally through the Strict Mode setup-cleanup-setup cycle", async () => {
    authenticated = true;
    render(<StrictMode><LoginPage /></StrictMode>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/live/kara-nualeaf?locale=ko"));
    expect(markAvatarSessionReady).toHaveBeenCalledWith("restored-fan");
  });

  it("releases the session state when token retrieval stalls", async () => {
    vi.useFakeTimers();
    authenticated = true;
    getAccessToken.mockImplementation(() => new Promise(() => {}));
    render(<LoginPage />);

    await act(async () => { await vi.advanceTimersByTimeAsync(SDK_WAIT_ROUNDS * 30_000 + 1_000); });

    expect(screen.getByRole("alert")).toHaveTextContent("로그인 연결이 오래 걸리고 있어요.");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts and releases a stalled session request", async () => {
    vi.useFakeTimers();
    authenticated = true;
    let requestSignal: AbortSignal | undefined;
    vi.mocked(globalThis.fetch).mockImplementation((_input, init) => {
      requestSignal = init?.signal as AbortSignal;
      return new Promise(() => {});
    });
    render(<LoginPage />);
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

    expect(requestSignal?.aborted).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("로그인 연결이 오래 걸리고 있어요.");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeEnabled();
  });

  it("shows safe reauthentication recovery to a signed-out English user", () => {
    query = "locale=en&reauth=failed";
    render(<LoginPage appleLoginEnabled />);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't verify your account. Please sign in again.");
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeEnabled();
  });

  it("uses the official English Google and Apple labels", () => {
    query = "locale=en";
    render(<LoginPage appleLoginEnabled />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeInTheDocument();
  });

  it("returns an English direct sign-in to the English home", async () => {
    query = "locale=en";
    authenticated = true;
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/?locale=en"));
  });

  it("starts a fresh transition when the same signed-in owner opens login with a new destination", async () => {
    authenticated = true;
    query = "returnTo=%2Fmy&locale=ko";
    const view = rtlRender(<ByUsSessionProvider><LoginPage /></ByUsSessionProvider>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    query = "returnTo=%2Fpassports&locale=ko";
    view.rerender(<ByUsSessionProvider><LoginPage /></ByUsSessionProvider>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(replace).toHaveBeenCalledWith("/passports?locale=ko");
  });

  it("shows only a neutral loading state while Privy restores authentication", () => {
    ready = false;
    render(<LoginPage />);

    expect(screen.getByText("로그인 상태를 확인하고 있어요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Google로 계속하기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "최애와 함께한 순간을 기록하세요." })).not.toBeInTheDocument();
  });

  it("turns a stalled login readiness check into an actionable state", async () => {
    vi.useFakeTimers();
    ready = false;
    render(<LoginPage />);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

    expect(screen.getByRole("alert")).toHaveTextContent("로그인 준비가 오래 걸리고 있어요.");
    expect(screen.getByRole("button", { name: "다시 확인" })).toBeEnabled();
  });

  it("renders an accessible contextual overlay and closes back to its preserved background", async () => {
    render(<LoginPage presentation="overlay" />);

    const dialog = await screen.findByRole("dialog", { name: "최애와 함께한 순간을 기록하세요." });
    expect(dialog).not.toHaveAttribute("aria-describedby");
    expect(screen.getByRole("heading", { name: "최애와 함께한 순간을 기록하세요." }).closest("[data-fan-surface]")).toHaveAttribute("lang", "ko");
    const closeButton = screen.getByRole("button", { name: "로그인 창 닫기" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });
    expect(back).toHaveBeenCalledOnce();
    expect(screen.queryByText("© 2026 kyaa. All rights reserved.")).not.toBeInTheDocument();
    expect(document.querySelector("picture")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "펼쳐진 팬 패스포트" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-login-layout='passport-gateway']")).not.toBeInTheDocument();
  });

  it("uses the shared bottom-sheet presentation on mobile viewports", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<LoginPage presentation="overlay" />);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("data-variant", "bottom-sheet"));
  });

  it("syncs an existing authenticated Privy session before redirecting", async () => {
    let finishSync: ((response: Response) => void) | undefined;
    vi.mocked(globalThis.fetch).mockImplementation(() => new Promise((resolve) => { finishSync = resolve; }));
    authenticated = true;
    render(<LoginPage />);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByText("로그인 상태를 연결하고 있어요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Google로 계속하기/ })).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/live/kara-nualeaf?locale=ko");
    finishSync?.(Response.json({ profile: { completed: true, nickname: "John" } }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/live/kara-nualeaf?locale=ko"));
    expect(fetch).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({
      method: "POST",
      headers: {
        authorization: "Bearer privy-access-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ locale: "ko" }),
    }));
  });

  it("keeps an authenticated session error recoverable without showing Google login", async () => {
    authenticated = true;
    vi.mocked(globalThis.fetch)
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(Response.json({ profile: { completed: true, nickname: "John" } }));

    render(<LoginPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("로그인 정보를 안전하게 연결하지 못했어요.");
    expect(screen.queryByRole("button", { name: /Google로 계속하기/ })).not.toBeInTheDocument();
    await waitFor(() => expect(alert.parentElement).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/live/kara-nualeaf?locale=ko"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("lets an authenticated Apple user without email log out and reselect an account", async () => {
    authenticated = true;
    query = "returnTo=%2Fc%2Fkara%2Fverify&intent=passport&entity=kara&authIntent=11111111-1111-4111-8111-111111111111";
    vi.mocked(globalThis.fetch).mockImplementation(async () => Response.json(
      { error: { code: "VERIFIED_EMAIL_REQUIRED" } },
      { status: 403 },
    ));

    render(<LoginPage appleLoginEnabled />);

    expect(await screen.findByText("이 계정에서 확인된 이메일을 찾을 수 없어요.")).toBeInTheDocument();
    expect(screen.getByText(/이메일 공유가 가능한 계정으로 다시 로그인/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenNthCalledWith(1, "/c/kara/verify?locale=ko");
    expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?returnTo=%2Fc%2Fkara%2Fverify/));
    expect(query).toContain("authIntent=11111111-1111-4111-8111-111111111111");
  });

  it("keeps failed reauthentication recoverable and prevents duplicate requests", async () => {
    authenticated = true;
    let finish: ((response: Response) => void) | undefined;
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({
      error: { code: "APPLE_REAUTHENTICATION_REQUIRED", providers: ["apple"] },
    }, { status: 403 })).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<LoginPage appleLoginEnabled />);
    const button = await screen.findByRole("button", { name: "Apple로 인증" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => finish?.(Response.json({ error: { code: "REAUTHENTICATION_UNAVAILABLE" } }, { status: 503 })));
    expect(await screen.findByText("인증을 완료하지 못했어요. 기존 계정으로 다시 인증해 주세요.")).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(logout).not.toHaveBeenCalled();
  });

  describe("in-app browser hand-off on an https page", () => {
    const iosInstagram = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 350.0.2.15.84 (iPhone15,2; iOS 18_1; ko_KR; ko; scale=3.00)";
    const iosThreads = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Barcelona 350.0.0.10.80 (iPhone15,2; iOS 18_1)";
    const androidInstagram = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 Instagram 350.0.0.46.108 Android (34/14; 480dpi)";
    const iosSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
    const androidChrome = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
    const assign = vi.fn();
    const stubHttps = (agent: string) => {
      vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(agent);
      assign.mockClear();
      vi.stubGlobal("location", { ...window.location, origin: "https://kyaa.io", href: "https://kyaa.io/login", assign });
    };
    const loginPath = "/login?returnTo=%2Flive%2Fkara-nualeaf%3Flocale%3Dko&locale=ko&intent=reserve";

    it.each([["iOS Instagram", iosInstagram], ["iOS Threads", iosThreads], ["Android Instagram", androidInstagram]])("shows the copy notice before any click in %s", (_name, agent) => {
      stubHttps(agent);
      render(<LoginPage />);
      expect(screen.getByRole("status")).toHaveTextContent("브라우저에서");
      expect(screen.getByRole("button", { name: "로그인 링크 복사" })).toBeEnabled();
      expect(assign).not.toHaveBeenCalled();
    });

    it("never shows the internal timeout code in iOS Instagram after the SDK stays unready for 30 seconds", () => {
      vi.useFakeTimers();
      try {
        ready = false;
        stubHttps(iosInstagram);
        render(<LoginPage />);
        act(() => { vi.advanceTimersByTime(31_000); });
        expect(document.body).not.toHaveTextContent("LOGIN_READINESS_TIMEOUT");
        expect(screen.getByRole("button", { name: "Google로 계속하기" })).toBeEnabled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not copy automatically on iOS Instagram's sibling apps or Android, and keeps the unready screen", () => {
      for (const agent of [iosThreads, androidInstagram, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/22B83 KAKAOTALK 11.0", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/22B83 [FBAN/FBIOS;FBAV/500.0]"]) {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
        ready = true;
        stubHttps(agent);
        const first = render(<LoginPage />);
        fireEvent.click(screen.getByRole("button", { name: "Google로 계속하기" }));
        expect(writeText).not.toHaveBeenCalled();
        first.unmount();
        ready = false;
        stubHttps(agent);
        const second = render(<LoginPage />);
        expect(screen.queryByRole("button", { name: "Google로 계속하기" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "로그인 준비 중" })).not.toBeInTheDocument();
        second.unmount();
      }
    });

    it("tries Safari on iOS Threads", () => {
      stubHttps(iosThreads);
      render(<LoginPage />);
      fireEvent.click(screen.getByRole("button", { name: "Google로 계속하기" }));
      expect(assign).toHaveBeenCalledWith(`x-safari-https://kyaa.io${loginPath}`);
    });

    it("branches before the Cognito redirect in Cognito mode", async () => {
      stubHttps(iosInstagram);
      rtlRender(<CognitoAuthProvider><ByUsSessionProvider><LoginPage /></ByUsSessionProvider></CognitoAuthProvider>);
      fireEvent.click(await screen.findByRole("button", { name: "Google로 계속하기" }));
      expect(assign).toHaveBeenCalledTimes(1);
      expect(assign.mock.calls[0][0]).toMatch(/^instagram:\/\/extbrowser\/\?url=/);
      expect(assign.mock.calls[0][0]).not.toContain("/api/auth/cognito/start");
      expect(screen.getByRole("button", { name: "로그인 링크 복사" })).toBeEnabled();
    });

  });

  it("copies only the sanitized login context and keeps a selectable fallback on clipboard failure", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Instagram");
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    query = new URLSearchParams({ returnTo: "/live/ifew?locale=ja#join", locale: "ja", intent: "reserve", entity: "ifew", authIntent: "11111111-1111-4111-8111-111111111111", code: "secret-code", access_token: "secret-token" }).toString();
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /Google/ }));
    fireEvent.click(screen.getByRole("button", { name: "ログインリンクをコピー" }));
    const field = await screen.findByRole("textbox", { name: "ログインリンク" });
    const link = new URL((field as HTMLInputElement).value);
    expect(writeText).toHaveBeenCalledWith(link.href);
    expect(link.origin).toBe(window.location.origin);
    expect(link.pathname).toBe("/login");
    expect(Object.fromEntries(link.searchParams)).toEqual({ returnTo: "/live/ifew?locale=ja#join", locale: "ja", intent: "reserve", entity: "ifew", authIntent: "11111111-1111-4111-8111-111111111111" });
    expect(link.href).not.toMatch(/secret|access_token|code=/);
    expect(field).toHaveAttribute("readonly");
    field.focus();
    fireEvent.focus(field);
    expect((field as HTMLInputElement).selectionEnd).toBe(link.href.length);
  });


});
