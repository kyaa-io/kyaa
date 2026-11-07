import { GroupsReleaseProvider } from "@/features/groups/ui/groups-release";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CreatorMediaPanel } from "./creator-media-panel";

const instagram = { items: [
  { id: "1001", mediaType: "IMAGE", mediaProductType: null, caption: "", imageUrl: "https://example.com/ig1.jpg", permalink: "https://www.instagram.com/p/ig1/", timestamp: "2026-11-03T00:00:00Z", sourceAccount: { id: "2001", username: "mmnoo.s" } },
  { id: "1002", mediaType: "VIDEO", mediaProductType: null, caption: "", imageUrl: "https://example.com/ig2.jpg", permalink: "https://www.instagram.com/reel/ig2/", timestamp: "2026-11-02T00:00:00Z", sourceAccount: { id: "2001", username: "mmnoo.s" } },
] };
vi.mock("next/navigation", () => ({ usePathname: () => "/creator", useSearchParams: () => new URLSearchParams("tab=board&section=media&locale=ko"), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: false }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
vi.mock("@/features/content-safety/ui/content-asset", () => ({ ContentAssetImage: ({ alt }: { alt: string }) => <img alt={alt} /> }));
vi.mock("@/features/fanpage/ui/use-news-source", () => ({ useNewsSource: (url: string | null, parse: (value: unknown) => { items: unknown[] }) => ({
  state: { status: "ready", data: url?.includes("/media?") ? [
    { id: "bare", kind: "photos", title: "", image: null, asset: { id: "a1", width: 4, height: 3 }, href: "/c/creator/notices/bare", date: "2026-11-06T00:00:00Z" },
    { id: "public", kind: "photos", title: "", image: "/public.jpg", asset: null, href: "/c/creator/notices/public", date: "2026-11-05T00:00:00Z" },
    { id: "kept", kind: "photos", title: "진짜 연말 •• ♥", image: "/kept.jpg", asset: null, href: "/c/creator/notices/kept", date: "2026-11-04T00:00:00Z" },
  ] : url?.includes("/instagram") ? parse(instagram).items : [], nextCursor: null, moreLoading: false, moreError: false },
  retry: vi.fn(), loadMore: vi.fn(),
}) }));
afterEach(cleanup);
const panel = (compact = false) => render(<GroupsReleaseProvider enabled={compact}><CreatorMediaPanel slug="creator" locale="ko" socialLinks={[{ platform: "instagram", url: "https://www.instagram.com/mmnoo.s/" }]} /></GroupsReleaseProvider>);
const card = (href: string) => screen.getAllByRole("link").find(link => link.getAttribute("href")?.includes(href))!.closest("li")!;

for (const compact of [false, true]) it(`draws a photo without a caption with no title or meta line, compact=${compact}`, () => {
  panel(compact);
  for (const href of ["/notices/bare", "/notices/public", "/p/ig1/"]) {
    expect(card(href).querySelector("strong")).toBeNull();
    expect(card(href).querySelector("time")).toBeNull();
    expect(card(href)).not.toHaveTextContent("사진");
    expect(card(href)).not.toHaveTextContent("mmnoo.s");
  }
});

it("still opens the post from a photo without a caption, under a link with a name", () => {
  panel();
  for (const href of ["/notices/bare", "/notices/public", "/p/ig1/"]) {
    const link = screen.getAllByRole("link").find(item => item.getAttribute("href")?.includes(href))!;
    expect(link).toHaveAccessibleName(expect.stringMatching(/^사진 · /));
  }
});

it("keeps the original caption and the meta line on other cards", () => {
  panel();
  expect(card("/notices/kept").querySelector("strong")).toHaveTextContent("진짜 연말 •• ♥");
  expect(card("/notices/kept").querySelector("time")).not.toBeNull();
});

it("keeps the account name on a video without a caption", () => {
  panel();
  expect(card("/reel/ig2/")).toHaveTextContent("@mmnoo.s");
});
