import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";

const state = vi.hoisted(() => ({ status: "ready" as "ready" | "loading" | "error", likeCount: 1, urls: [] as Array<{ url: string; anonymous: unknown }> }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({
  useCommunityResource: (url: string, _parse: unknown, _keep: unknown, _invalidate: unknown, anonymous: unknown) => {
    state.urls.push({ url, anonymous });
    return { state: state.status === "ready" ? { status: "ready", data: { reaction: null, likeCount: state.likeCount, dislikeCount: null, commentCount: 0 } } : { status: state.status, code: "UNAVAILABLE" }, retry: vi.fn() };
  },
}));
import { MissionbookLikeCount, missionbookLikeCopy } from "./missionbook-like-count";

afterEach(() => { cleanup(); state.status = "ready"; state.likeCount = 1; state.urls = []; });

describe("MissionbookLikeCount", () => {
  it("reads the mission book notice anonymously and shows the real likes plus 10", () => {
    render(<MissionbookLikeCount locale="ko" />);
    expect(state.urls[0]).toEqual({ url: "/api/notices/dukjil-missionbook/participation", anonymous: true });
    expect(screen.getByText("좋아요 11명")).toBeInTheDocument();
    expect(document.querySelector("[data-missionbook-likes]")).toHaveAttribute("data-missionbook-likes", "ready");
  });
  it("words the English count as likes", () => {
    state.likeCount = 340;
    render(<MissionbookLikeCount locale="en" tone="banner" />);
    expect(screen.getByText("350 likes")).toBeInTheDocument();
    expect(document.querySelector('[data-tone="banner"]')).not.toBeNull();
  });
  it.each(["loading", "error"] as const)("keeps the line but shows no number while %s", status => {
    state.status = status;
    render(<MissionbookLikeCount locale="ko" />);
    const line = document.querySelector("[data-missionbook-likes]");
    expect(line).toHaveAttribute("data-missionbook-likes", "loading");
    expect(line?.textContent).toBe("");
  });
  it("has one number slot in every locale", () => {
    for (const locale of APP_LOCALES) expect(missionbookLikeCopy[locale].split("{0}"), locale).toHaveLength(2);
  });
});
