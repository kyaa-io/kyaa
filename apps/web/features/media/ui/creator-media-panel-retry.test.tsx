import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CreatorMediaPanel } from "./creator-media-panel";

vi.mock("next/navigation", () => ({ usePathname: () => "/elina", useSearchParams: () => new URLSearchParams("tab=board&section=media&locale=ko"), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: false, user: null, getAccessToken: async () => null }) }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: false }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
vi.mock("@/features/fanpage/ui/use-news-source", () => ({ useNewsSource: (url: string | null) => ({
  state: { status: "ready", data: url?.includes("/media?") ? [{ id: "photo", kind: "photos", title: "쿠킹 클래스", image: null, asset: { id: "11111111-1111-4111-8111-111111111111", width: 4, height: 3 }, href: "/c/elina/notices/photo", date: "2026-10-18T00:00:00Z" }] : [], nextCursor: null, moreLoading: false, moreError: false },
  retry: vi.fn(), loadMore: vi.fn(),
}) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows a failed uploaded photo as an icon-only status outside the tile link", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
  render(<CreatorMediaPanel slug="elina" locale="ko" />);
  // 2026-11-10 production hotfix: the groups-off gallery tile shows the icon alone and names the failure.
  const failed = await screen.findByRole("status", { name: "사진을 불러오지 못했어요." });
  expect(failed.closest("a")).toBeNull();
  expect(failed).toHaveTextContent("");
  expect(screen.getByRole("link", { name: "쿠킹 클래스" })).toBeInTheDocument();
});
