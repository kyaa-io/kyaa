import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ list: vi.fn(), redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("@/server/home-gallery/home-gallery-dependencies", () => ({ createPublicHomeGalleryRepository: () => ({ listShortsPage: mock.list }) }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>, FanContentContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/features/home/ui/home-shorts", () => ({ HomeShorts: ({ items }: { items: unknown[] }) => <div data-testid="shorts">{items.length}</div> }));
import ShortsPage from "./page";

it("loads later pages from the public feed and preserves the next-page link", async () => {
  mock.list.mockResolvedValue({ items: [{ id: "one" }], hasMore: true });
  render(await ShortsPage({ searchParams: Promise.resolve({ locale: "ko", offset: "12" }) }));
  expect(mock.list).toHaveBeenCalledWith("ko", { offset: 12, limit: 12 });
  expect(screen.getByTestId("shorts")).toHaveTextContent("1");
  expect(screen.getByRole("link", { name: "더 보기" })).toHaveAttribute("href", "/shorts?locale=ko&offset=24");
});
it("rejects invalid offsets before reading", async () => {
  mock.list.mockClear();
  await expect(ShortsPage({ searchParams: Promise.resolve({ offset: "-1" }) })).rejects.toThrow("redirect");
  expect(mock.list).not.toHaveBeenCalled();
});
