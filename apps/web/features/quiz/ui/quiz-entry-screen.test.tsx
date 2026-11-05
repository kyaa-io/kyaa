import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuizEntryScreen } from "./quiz-entry-screen";
import { createAuthIntent, persistAuthIntent } from "@/components/auth-intent";

const getAccessToken = vi.fn();
const push = vi.fn();
const replace = vi.fn();
const router = { push, replace };
let privyState = { ready: true, authenticated: true };

vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ...privyState, getAccessToken }) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const attemptId = "11111111-1111-4111-8111-111111111111";
const intro = { celebrity: { slug: "kara", name: "KARA" }, quiz: { availability: "available", totalQuestions: 3, passThreshold: 2 } };
const questions = [1, 2, 3].map((position) => ({
  id: `${position}0000000-0000-4000-8000-00000000000${position}`,
  position,
  prompt: `문항 ${position}`,
  responseKind: "choice",
  freeText: null,
  selectedOptionId: null,
  options: [1, 2].map((optionPosition) => ({ id: `${position}${optionPosition}000000-0000-4000-8000-00000000000${optionPosition}`, position: optionPosition, label: `보기 ${optionPosition}` })),
}));

describe("QuizEntryScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    privyState = { ready: true, authenticated: true };
    getAccessToken.mockResolvedValue("privy-token");
    push.mockReset();
    replace.mockReset();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/c/kara/verify");
  });

  it("loads the public intro and starts the server-owned attempt before navigating", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/me/profile") return Response.json({ profile: { completed: true } });
      if (url.includes("/api/public/")) return Response.json({ intro });
      return Response.json({ result: { kind: "attempt", attempt: { id: attemptId, status: "open", score: null, submittedAt: null }, questions } });
    });

    render(<QuizEntryScreen locale="ko" slug="kara" />);
    expect(await screen.findByRole("heading", { name: "KARA 나의 팬심을 확인해 보세요." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "KARA 나의 팬심을 확인해 보세요." })
      .closest('[data-content-alignment="top"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "KARA 팬페이지로 돌아가기" })).toHaveAttribute("href", "/kara?locale=ko");
    const home = screen.getByRole("link", { name: "kyaa 홈" });
    expect(within(home).getByRole("img", { name: "kyaa" })).toHaveAttribute("src", "/images/guest-home/kyaa-wordmark.svg");
    fireEvent.click(screen.getByRole("button", { name: "팬 인증 시작하기" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/c/kara/verify/questions?attempt=${attemptId}&locale=ko`));
    expect(fetchMock).toHaveBeenCalledWith("/api/public/celebrities/kara/quiz?locale=ko", expect.objectContaining({ method: "GET", cache: "no-store" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/celebrities/kara/quiz/attempts?locale=ko", expect.objectContaining({ method: "POST", headers: { authorization: "Bearer privy-token" } }));
  });

  it("carries a validated LIVE reservation return through a successful start", async () => {
    const liveReturnTo = "/live/kara-seoul?locale=ko&authIntent=abcdefab-1234-4123-8123-abcdefabcdef";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/me/profile") return Response.json({ profile: { completed: true } });
      if (url.includes("/api/public/")) return Response.json({ intro });
      return Response.json({ result: { kind: "attempt", attempt: { id: attemptId, status: "open", score: null, submittedAt: null }, questions } });
    });

    render(<QuizEntryScreen locale="ko" slug="kara" returnTo={liveReturnTo} />);
    fireEvent.click(await screen.findByRole("button", { name: "팬 인증 시작하기" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(
      `/c/kara/verify/questions?attempt=${attemptId}&locale=ko&returnTo=${encodeURIComponent(liveReturnTo)}`,
    ));
  });

  it("returns an existing Passport holder directly to the validated LIVE", async () => {
    const liveReturnTo = "/live/kara-seoul?locale=ko";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/me/profile") return Response.json({ profile: { completed: true } });
      if (url.includes("/api/public/")) return Response.json({ intro });
      return Response.json({ result: { kind: "holder", passportId: "22222222-2222-4222-8222-222222222222" } });
    });

    render(<QuizEntryScreen locale="ko" slug="kara" returnTo={liveReturnTo} />);
    fireEvent.click(await screen.findByRole("button", { name: "팬 인증 시작하기" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(liveReturnTo));
  });

  it.each(["creator_page", "live", "benefit", "reaction"] as const)(
    "forwards canonical %s attribution to the server-owned attempt",
    async (source) => {
      const sourceId = "88888888-8888-4888-8888-888888888888";
      window.history.replaceState({}, "", `/c/kara/verify?source=${source}&sourceId=${sourceId}`);
      const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/api/me/profile") return Response.json({ profile: { completed: true } });
        if (url.includes("/api/public/")) return Response.json({ intro });
        return Response.json({ result: { kind: "attempt", attempt: { id: attemptId, status: "open", score: null, submittedAt: null }, questions } });
      });

      render(<QuizEntryScreen locale="ko" slug="kara" />);
      fireEvent.click(await screen.findByRole("button", { name: "팬 인증 시작하기" }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
        `/api/celebrities/kara/quiz/attempts?locale=ko&source=${source}&sourceId=${sourceId}`,
        expect.objectContaining({ method: "POST" }),
      ));
    },
  );

  it("preserves the canonical entry route through login", async () => {
    privyState = { ready: true, authenticated: false };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ intro }));
    render(<QuizEntryScreen locale="ko" slug="kara" />);
    expect(await screen.findByRole("link", { name: "로그인하고 시작하기" })).toHaveAttribute("href", `/login?returnTo=${encodeURIComponent("/c/kara/verify?locale=ko")}&locale=ko&intent=passport&entity=kara`);
  });

  it("preserves a validated LIVE return through login and drops an unsafe one", async () => {
    privyState = { ready: true, authenticated: false };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ intro }));
    const liveReturnTo = "/live/kara-seoul?locale=ko";
    const { rerender } = render(<QuizEntryScreen locale="ko" slug="kara" returnTo={liveReturnTo} />);

    expect(await screen.findByRole("link", { name: "로그인하고 시작하기" })).toHaveAttribute(
      "href",
      `/login?returnTo=${encodeURIComponent(`/c/kara/verify?locale=ko&returnTo=${encodeURIComponent(liveReturnTo)}`)}&locale=ko&intent=passport&entity=kara`,
    );

    rerender(<QuizEntryScreen locale="ko" slug="kara" returnTo="https://evil.example/live/kara?locale=ko" />);
    expect(screen.getByRole("link", { name: "로그인하고 시작하기" })).toHaveAttribute(
      "href",
      `/login?returnTo=${encodeURIComponent("/c/kara/verify?locale=ko")}&locale=ko&intent=passport&entity=kara`,
    );
  });

  it("resumes a matching durable verification action once and consumes it after the server projection", async () => {
    const intent = createAuthIntent({ sourcePath: "/c/kara/verify", sourceQuery: "", actionType: "START_FAN_VERIFICATION", targetType: "celebrity", targetId: "kara" });
    persistAuthIntent(sessionStorage, intent);
    window.history.replaceState({}, "", `/c/kara/verify?authIntent=${intent.id}`);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/me/profile") return Response.json({ profile: { completed: true } });
      if (url.includes("/api/public/")) return Response.json({ intro });
      return Response.json({ result: { kind: "holder", passportId: "22222222-2222-4222-8222-222222222222" } });
    });

    render(<QuizEntryScreen locale="ko" slug="kara" />);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/passports/22222222-2222-4222-8222-222222222222?locale=ko"));
    expect(sessionStorage.getItem(`byus:auth-intent:v1:${intent.id}`)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("renders an honest unavailable state without starting an attempt", async () => {
    privyState = { ready: true, authenticated: false };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ intro: { ...intro, quiz: { ...intro.quiz, availability: "unavailable" } } }));
    render(<QuizEntryScreen locale="ko" slug="kara" />);
    expect(await screen.findByRole("heading", { name: "아직 팬 인증 퀴즈가 준비되지 않았어요." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "아직 팬 인증 퀴즈가 준비되지 않았어요." })
      .closest('[data-content-alignment="center"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "인증 목록" })).toHaveAttribute("href", "/community?creator=kara&tab=certifications&locale=ko");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("redirects an authenticated user without a profile to contextual onboarding", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/me/profile") return Response.json({ profile: { completed: false } });
      return Response.json({ intro });
    });
    render(<QuizEntryScreen locale="ko" slug="kara" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(
      "/onboarding/profile?returnTo=%2Fc%2Fkara%2Fverify%3Flocale%3Dko&locale=ko&intent=passport&entity=kara",
    ));
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/quiz/attempts"), expect.anything());
  });

  it("preserves verification attribution through contextual profile onboarding", async () => {
    const sourceId = "88888888-8888-4888-8888-888888888888";
    window.history.replaceState({}, "", `/c/kara/verify?source=live&sourceId=${sourceId}`);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/me/profile") return Response.json({ profile: { completed: false } });
      return Response.json({ intro });
    });

    render(<QuizEntryScreen locale="ko" slug="kara" />);

    const returnTo = `/c/kara/verify?locale=ko&source=live&sourceId=${sourceId}`;
    await waitFor(() => expect(replace).toHaveBeenCalledWith(
      `/onboarding/profile?returnTo=${encodeURIComponent(returnTo)}&locale=ko&intent=passport&entity=kara`,
    ));
  });

  it("preserves the LIVE return while profile onboarding repairs an incomplete profile", async () => {
    const liveReturnTo = "/live/kara-seoul?locale=ko&authIntent=abcdefab-1234-4123-8123-abcdefabcdef";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/me/profile") return Response.json({ profile: { completed: false } });
      return Response.json({ intro });
    });

    render(<QuizEntryScreen locale="ko" slug="kara" returnTo={liveReturnTo} />);

    const verificationReturnTo = `/c/kara/verify?locale=ko&returnTo=${encodeURIComponent(liveReturnTo)}`;
    await waitFor(() => expect(replace).toHaveBeenCalledWith(
      `/onboarding/profile?returnTo=${encodeURIComponent(verificationReturnTo)}&locale=ko&intent=passport&entity=kara`,
    ));
  });

  it("shows a retryable error when the public contract cannot be loaded", async () => {
    privyState = { ready: true, authenticated: false };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 }));
    render(<QuizEntryScreen locale="ko" slug="kara" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("현재 참여할 수 있는 팬 인증 퀴즈가 없어요.");
    expect(screen.getByRole("alert")
      .closest('[data-content-alignment="center"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("threads English locale through copy, APIs, auth intent, and fan-page links", async () => {
    privyState = { ready: true, authenticated: false };
    const englishIntro = {
      celebrity: { slug: "katseye", name: "KATSEYE" },
      quiz: { availability: "available", totalQuestions: 3, passThreshold: 2 },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ intro: englishIntro }));

    render(<QuizEntryScreen locale="en" slug="katseye" />);

    expect(await screen.findByRole("heading", { name: /See how well you know KATSEYE/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to KATSEYE fan page" })).toHaveAttribute(
      "href",
      "/katseye?locale=en",
    );
    expect(screen.getByRole("link", { name: "Sign in to start" })).toHaveAttribute(
      "href",
      `/login?returnTo=${encodeURIComponent("/c/katseye/verify?locale=en")}&locale=en&intent=passport&entity=katseye`,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/celebrities/katseye/quiz?locale=en",
      expect.objectContaining({ method: "GET" }),
    );
  });
  it("opens the start screen as a modal dialog that takes focus and closes with Escape", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/me/profile") return Response.json({ profile: { completed: true } });
      return Response.json({ intro });
    });
    render(<QuizEntryScreen locale="ko" slug="kara" />);
    const dialog = await screen.findByRole("dialog", { name: "KARA 나의 팬심을 확인해 보세요." });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(dialog).toHaveFocus());
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(replace).toHaveBeenCalledWith("/community?creator=kara&tab=certifications&locale=ko");
  });
  it("closes with Escape while the intro is still loading or has failed, and offers the fan page on failure", async () => {
    privyState = { ready: true, authenticated: false };
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>(() => {}));
    const first = render(<QuizEntryScreen locale="ko" slug="kara" />);
    expect(await screen.findByRole("status")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(replace).toHaveBeenCalledWith("/community?creator=kara&tab=certifications&locale=ko");
    first.unmount();
    push.mockReset();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 }));
    render(<QuizEntryScreen locale="ko" slug="kara" />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "인증 목록" })).toHaveAttribute("href", "/community?creator=kara&tab=certifications&locale=ko");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(replace).toHaveBeenCalledWith("/community?creator=kara&tab=certifications&locale=ko");
  });
  it("returns to the certification list it was opened from, and ignores unsafe or other-creator origins", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/me/profile") return Response.json({ profile: { completed: true } });
      return Response.json({ intro });
    });
    sessionStorage.setItem("byus:quiz-close-return", JSON.stringify({ slug: "kara", href: "/community?creator=kara&tab=certifications&locale=en", itemId: "i1", at: Date.now() }));
    const { unmount } = render(<QuizEntryScreen locale="en" slug="kara" />);
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    expect(replace).toHaveBeenCalledWith("/community?creator=kara&tab=certifications&locale=en");
    expect(push).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("byus:quiz-focus-return")!)).toMatchObject({ slug: "kara", itemId: "i1" });
    unmount();
    sessionStorage.setItem("byus:quiz-close-return", JSON.stringify({ slug: "kara", href: "https://evil.example/", itemId: "i1", at: Date.now() }));
    render(<QuizEntryScreen locale="en" slug="kara" />);
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    expect(replace).toHaveBeenCalledWith("/community?creator=kara&tab=certifications&locale=en");
  });

  it("keeps the list click through a reload and clears it once the dialog is closed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/me/profile") return Response.json({ profile: { completed: true } });
      return Response.json({ intro });
    });
    sessionStorage.setItem("byus:quiz-close-return", JSON.stringify({ slug: "kara", href: "/c/kara/certifications?locale=en", itemId: "i1", at: Date.now() }));
    const first = render(<QuizEntryScreen locale="en" slug="kara" />);
    await screen.findByRole("dialog");
    first.unmount(); // reload: the dialog mounts again
    expect(sessionStorage.getItem("byus:quiz-close-return")).not.toBeNull();
    render(<QuizEntryScreen locale="en" slug="kara" />);
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    expect(replace).toHaveBeenCalledWith("/c/kara/certifications?locale=en");
    expect(push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("byus:quiz-close-return")).toBeNull();
  });

  it.each([
    ["token", async () => { getAccessToken.mockResolvedValue(null); return Response.json({ intro }); }, "로그인 상태를 확인하지 못했어요"],
    ["network", async (url: string) => { if (url === "/api/me/profile") throw new TypeError("offline"); return Response.json({ intro }); }, "네트워크 연결을 확인하지 못했어요"],
    ["server", async (url: string) => url === "/api/me/profile" ? Response.json({ error: { code: "PROFILE_UNAVAILABLE" } }, { status: 503 }) : Response.json({ intro }), "서버에서 프로필을 불러오지 못했어요"],
  ] as const)("separates the %s profile failure instead of one message", async (_name, handler, text) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => handler(String(input)));
    render(<QuizEntryScreen locale="ko" slug="kara" />);
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
  });
});
