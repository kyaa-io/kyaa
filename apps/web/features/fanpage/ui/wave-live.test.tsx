import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
const retry = vi.hoisted(() => vi.fn());
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: false }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true }) }));
vi.mock("./use-community-resource", () => ({ useCommunityResource: () => ({ state: { status: "ready", data: { total: 0, comments: [], nextCursor: null } }, retry }) }));
vi.mock("@/features/content-safety/ui/content-actions", () => ({ ContentActions: () => null, ContentTranslation: () => null }));
import { WaveLivePanel } from "./wave-live";
import { CheerComments } from "./cheer-comments";
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); retry.mockClear(); });
describe("Wave LIVE", () => {
  it.each(APP_LOCALES)("keeps both TikTok LIVE links and the cheer login return path in %s", locale => {
    render(<WaveLivePanel locale={locale} />);
    const links = screen.getAllByRole("link");
    expect(links.map(link => link.getAttribute("href"))).toContain("https://www.tiktok.com/@chang._.a/live");
    expect(links.map(link => link.getAttribute("href"))).toContain("https://www.tiktok.com/@wena_official_/live");
    expect(links.at(-1)?.getAttribute("href")).toContain(encodeURIComponent(`?tab=board&section=live&locale=${locale}`));
  });
  it("refreshes every five seconds only while visible and stops on unmount", () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const view = render(<WaveLivePanel locale="ko" />);
    act(() => vi.advanceTimersByTime(5000)); expect(retry).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue("hidden");
    act(() => vi.advanceTimersByTime(10000)); expect(retry).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue("visible");
    act(() => vi.advanceTimersByTime(5000)); expect(retry).toHaveBeenCalledTimes(2);
    view.unmount();
    act(() => vi.advanceTimersByTime(5000)); expect(retry).toHaveBeenCalledTimes(2);
  });
  it("preserves the non-LIVE cheer refresh behavior", () => {
    vi.useFakeTimers();
    render(<CheerComments slug="changha" name="창하" locale="ko" />);
    act(() => vi.advanceTimersByTime(15000)); expect(retry).not.toHaveBeenCalled();
  });
});
