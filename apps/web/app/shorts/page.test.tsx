import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ list: vi.fn(), redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("@/server/home-gallery/home-gallery-dependencies", () => ({ createPublicHomeGalleryRepository: () => ({ listShortsPage: mock.list }) }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>, FanContentContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/features/home/ui/home-shorts", () => ({ HomeShorts: ({ items, hasMore }: { items: unknown[]; hasMore?: boolean }) => <div data-testid="shorts" data-has-more={String(hasMore)}>{items.length}</div> }));
import ShortsPage from "./page";

it("loads later pages from the public feed and hands the rest to scroll loading instead of a button", async () => {
  mock.list.mockResolvedValue({ items: [{ id: "one" }], hasMore: true });
  render(await ShortsPage({ searchParams: Promise.resolve({ locale: "ko", offset: "12" }) }));
  expect(mock.list).toHaveBeenCalledWith("ko", { offset: 12, limit: 12 });
  expect(screen.getByTestId("shorts")).toHaveTextContent("1");
  expect(screen.getByTestId("shorts")).toHaveAttribute("data-has-more", "true");
  expect(screen.queryByRole("link", { name: "더 보기" })).toBeNull();
});
it("rejects invalid offsets before reading", async () => {
  mock.list.mockClear();
  await expect(ShortsPage({ searchParams: Promise.resolve({ offset: "-1" }) })).rejects.toThrow("redirect");
  expect(mock.list).not.toHaveBeenCalled();
});
