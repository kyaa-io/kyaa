import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CreatorMediaPanel } from "./creator-media-panel";

vi.mock("next/navigation", () => ({ usePathname: () => "/elina", useSearchParams: () => new URLSearchParams("tab=board&section=media&locale=ko"), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: false }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
vi.mock("@/features/content-safety/ui/content-asset", () => ({ ContentAssetImage: ({ alt, href }: { alt: string; href?: string }) => href ? <a href={href}><img alt={alt} /></a> : <img alt={alt} /> }));
vi.mock("@/features/fanpage/ui/use-news-source", () => ({ useNewsSource: (url: string | null) => ({
  state: { status: "ready", data: url?.includes("/media?") ? [{ id: "photo", kind: "photos", title: "쿠킹 클래스", image: null, asset: { id: "a1", width: 4, height: 3 }, href: "/c/elina/notices/photo", date: "2026-10-18T00:00:00Z" }] : [], nextCursor: null, moreLoading: false, moreError: false },
  retry: vi.fn(), loadMore: vi.fn(),
}) }));
afterEach(cleanup);

it("gives an uploaded-photo card one link named by its text, not a second image-only link", () => {
  render(<CreatorMediaPanel slug="elina" locale="ko" />);
  const links = screen.getAllByRole("link").filter(link => link.getAttribute("href")?.includes("/c/elina/notices/photo"));
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveTextContent("쿠킹 클래스");
  expect(links[0].querySelector("img")).toBeNull();
});
