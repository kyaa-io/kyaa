import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { jjinfanBannerCopy } from "./jjinfan-banner-copy";
import { JjinfanChallengeEntry } from "./jjinfan-challenge-entry";
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), query: new URLSearchParams("challenge=jjinfan100") }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks, useSearchParams: () => mocks.query }));
vi.mock("@/components/fan-ui/fan-dialog", () => ({ FanDialog: ({open,title,primary,onOpenChange}: any) => open ? <div role="dialog"><h2>{title}</h2><button onClick={primary.onClick}>{primary.label}</button><button onClick={()=>onOpenChange(false)}>닫기</button></div> : null }));
describe("challenge entry", () => {
  it.each([{ ready: false, verified: false }, { ready: true, verified: true }])("waits for ownership and hides for verified fans: %j", props => {
    render(<JjinfanChallengeEntry slug="yuna" locale="ko" {...props} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it.each(["yuna", "hiroro", "mmnoo-s"])("sends %s to its own fan verification and preserves return", slug => {
    render(<JjinfanChallengeEntry slug={slug} locale="ko" ready verified={false} />);
    fireEvent.click(screen.getByRole("button", { name: "동참하기" }));
    expect(mocks.push).toHaveBeenLastCalledWith(`/c/${slug}/verify?locale=ko&returnTo=${encodeURIComponent(`/${slug}?locale=ko`)}`);
  });
  it("dismisses without losing other query values or hash", () => {
    window.history.replaceState(null, "", "/yuna?locale=ja&challenge=jjinfan100&tab=home#fans");
    render(<JjinfanChallengeEntry slug="yuna" locale="ko" ready verified={false} />);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(mocks.replace).toHaveBeenLastCalledWith("/yuna?locale=ja&tab=home#fans", { scroll: false });
  });
  it("ignores unrelated pages and missing campaign query", () => {
    const v=render(<JjinfanChallengeEntry slug="elina" locale="ko" ready verified={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    mocks.query = new URLSearchParams();
    v.rerender(<JjinfanChallengeEntry slug="yuna" locale="ko" ready verified={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    mocks.query = new URLSearchParams("challenge=jjinfan100");
  });
  it("has complete copy in every supported language", () => {
    for(const locale of APP_LOCALES) for(const value of Object.values(jjinfanBannerCopy[locale])) expect(value.trim()).not.toBe("");
  });
});
