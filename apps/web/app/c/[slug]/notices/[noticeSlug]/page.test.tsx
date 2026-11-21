import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/server/fan-posts/dependencies", () => ({ createContentDependencies: () => ({ rpc: mocks.rpc, authorize: mocks.authorize }) }));
vi.mock("@/server/seo/public-content", () => ({ loadSeoCreator: vi.fn(async () => ({ name: "RUN&MUSIC", summary: "s", roles: ["brand"], image: { url: "/creator.png", alt: "RUN&MUSIC" } })) }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not-found"); }) }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: ({ children }: { children: ReactNode }) => <>{children}</>, FanContentContainer: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/notice/notice-detail", () => ({ NoticeDetail: ({ officialPostLabel, initialNotice }: { officialPostLabel?: string; initialNotice?: { title: string } }) => <span>{officialPostLabel}<b>{initialNotice?.title ?? "none"}</b></span> }));

import NoticeDetailPage, { generateMetadata } from "./page";

const notice = (over: object = {}) => ({ id: "4a401460-52ad-45d8-b5a6-6641a5079140", slug: "winners-2026", title: "당첨자 발표", pinned: true, kind: "standard", postType: "notice", visibility: "public", revision: 1,
  publishedAt: "2026-11-06T07:11:34Z", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "본문" }] }] }, ...over });
const props = (slug = "runmusic", noticeSlug = "winners-2026", locale = "ko") => ({ params: Promise.resolve({ slug, noticeSlug }), searchParams: Promise.resolve({ locale }) });

beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue(null); });

describe("brand notice detail route", () => {
  it("passes localized brand copy to the public notice renderer", async () => {
    render(await NoticeDetailPage({ params: Promise.resolve({ slug: "runmusic", noticeSlug: "update" }), searchParams: Promise.resolve({ locale: "ja" }) }));
    expect(screen.getByText("ブランド情報")).toBeInTheDocument();
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("puts a public notice, read without a sign-in, in the server HTML and names its own canonical address", async () => {
    mocks.rpc.mockResolvedValue(notice());
    render(await NoticeDetailPage(props()));
    expect(screen.getByText("당첨자 발표")).toBeInTheDocument();
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls[0]).toEqual(["read_fan_notice", { p_app_user_id: null, p_slug: "runmusic", p_notice_slug: "winners-2026", p_locale: "ko" }]);
    const metadata = await generateMetadata(props("runmusic", "winners-2026", "ja"));
    expect(metadata.title).toBe("당첨자 발표 | RUN&MUSIC | kyaa");
    expect(metadata.alternates?.canonical).toBe("https://kyaa.io/c/runmusic/notices/winners-2026?locale=en");
  });

  it("keeps a members-only notice and the check-in-only event page out of the server HTML", async () => {
    mocks.rpc.mockResolvedValue(notice({ visibility: "members" }));
    render(await NoticeDetailPage(props()));
    expect(screen.getByText("none")).toBeInTheDocument();
    expect(await generateMetadata(props())).toEqual({});
    mocks.rpc.mockClear().mockResolvedValue(notice());
    expect(await generateMetadata(props("kyaa-wave-fanpage"))).toEqual({});
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([["welcome-byus", { kind: "welcome" }], ["instagram-abc", {}]])("leaves %s followable but out of search", async (slug, over) => {
    mocks.rpc.mockResolvedValue(notice({ slug, ...over }));
    expect((await generateMetadata(props("runmusic", slug))).robots).toEqual({ index: false, follow: true });
  });
});
