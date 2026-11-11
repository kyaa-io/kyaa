import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CreatorMediaPanel } from "./creator-media-panel";

vi.mock("next/navigation", () => ({ usePathname: () => "/elina", useSearchParams: () => new URLSearchParams("tab=board&section=media&locale=ko"), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/features/auth/client/auth-fallback", () => ({ usePrivy: () => ({ ready: true, authenticated: false }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
vi.mock("@/features/content-safety/ui/content-asset", () => ({ ContentAssetImage: ({ alt, href }: { alt: string; href?: string }) => href ? <a href={href}><img alt={alt} /></a> : <img alt={alt} /> }));
vi.mock("@/features/fanpage/ui/use-news-source", () => ({ useNewsSource: (url: string | null) => ({
  state: { status: "ready", data: url?.includes("/media?") ? [{ id: "photo", kind: "photos", title: "쿠킹 클래스", image: null, asset: { id: "a1", width: 4, height: 3 }, href: "/c/elina/notices/photo", date: "2026-10-18T00:00:00Z" }] : [], nextCursor: null, moreLoading: false, moreError: false },
  retry: vi.fn(), loadMore: vi.fn(),
}) }));
afterEach(cleanup);

it("gives an uploaded-photo tile one link named by its title, not a second image-only link", () => {
  render(<CreatorMediaPanel slug="elina" locale="ko" />);
  const links = screen.getAllByRole("link").filter(link => link.getAttribute("href")?.includes("/c/elina/notices/photo"));
  expect(links).toHaveLength(1);
  // 2026-11-10 production hotfix: the groups-off gallery is thumbnail-only, so the title is the accessible name only.
  expect(links[0]).toHaveAccessibleName("쿠킹 클래스");
  expect(links[0]).toHaveTextContent("");
  expect(links[0].querySelector("img")).toBeNull();
});
