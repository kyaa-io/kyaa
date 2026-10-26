import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranslatedText } from "./use-automatic-translation";

const context = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true, user: { id: "reader" }, getAccessToken: vi.fn(async () => "token") },
  session: { ready: true, ownerId: "reader", generation: 100 },
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => context.auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => context.session }));
beforeEach(() => {
  context.auth.authenticated = true; context.auth.user = { id: "reader" }; context.auth.getAccessToken.mockResolvedValue("token");
  context.session.ownerId = "reader"; context.session.generation += 1;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("automatic display translation", () => {
  it("keeps manual translation available when visibility cannot be observed", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const fetcher = vi.fn().mockResolvedValue(Response.json({ translatedText: "Manual fallback", cached: false })); vi.stubGlobal("fetch", fetcher);
    render(<TranslatedText text="수동 번역 대상" locale="en" />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    await screen.findByText("Manual fallback");
  });
  it("waits for visibility and rechecks visibility after a source change", async () => {
    const observers: Array<IntersectionObserverCallback> = [];
    vi.stubGlobal("IntersectionObserver", class { constructor(callback: IntersectionObserverCallback) { observers.push(callback); } observe() {} disconnect() {} });
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ translatedText: "Translated", cached: false })); vi.stubGlobal("fetch", fetcher);
    const { rerender } = render(<TranslatedText text="한국어 게시글" locale="en" />);
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => observers.at(-1)!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    await screen.findByText("Translated"); expect(fetcher).toHaveBeenCalledTimes(1);
    rerender(<TranslatedText text="새로운 한국어 게시글" locale="en" />);
    await act(async () => {}); expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => observers.at(-1)!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });
  it("coalesces identical visible requests and keeps original view selected", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ translatedText: "Translated caption", cached: true })); vi.stubGlobal("fetch", fetcher);
    const view = () => <><TranslatedText text="같은 외부 캡션" locale="en" /><TranslatedText text="같은 외부 캡션" locale="en" /></>;
    const { rerender } = render(view());
    await screen.findAllByText("Translated caption"); expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Show original" })[0]); rerender(view());
    await act(async () => {}); expect(screen.getByText("같은 외부 캡션")).toBeInTheDocument(); expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(screen.getAllByText("Translated caption")).toHaveLength(2); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not apply a previous account response to the next account", async () => {
    let resolveOld!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
      .mockResolvedValue(Response.json({ translatedText: "Current account result", cached: false })); vi.stubGlobal("fetch", fetcher);
    const view = () => <TranslatedText text="계정 전환 중의 게시글" locale="en" />;
    const { rerender } = render(view()); await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    context.auth.user = { id: "reader-2" }; context.session.ownerId = "reader-2"; context.session.generation += 1;
    context.auth.getAccessToken.mockResolvedValue("new-token"); rerender(view());
    await screen.findByText("Current account result");
    await act(async () => resolveOld(Response.json({ translatedText: "Previous private result", cached: false })));
    expect(screen.queryByText("Previous private result")).not.toBeInTheDocument();
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer new-token");
  });
  it("allows a guest to translate already displayed text without a bearer", async () => {
    context.auth.authenticated = false;
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ translatedText: "Public translation", cached: true })); vi.stubGlobal("fetch", fetcher);
    render(<TranslatedText text="공개된 외부 소식" locale="en" />);
    await screen.findByText("Public translation");
    expect(fetcher.mock.calls[0][0]).toBe("/api/display-translations");
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ text: "공개된 외부 소식", targetLocale: "en" });
  });
  it("renders a linked title without a nested translation button", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ translatedText: "Translated title", cached: true })));
    const { container } = render(<a href="/original"><TranslatedText text="번역할 제목" locale="en" controls={false} /></a>);
    await screen.findByText("Translated title"); expect(container.querySelector("a button")).toBeNull();
    expect(screen.getByText("Translated title")).toHaveAttribute("title", "번역할 제목");
  });
});
