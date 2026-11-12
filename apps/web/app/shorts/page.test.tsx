import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ list: vi.fn(), redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("@/server/home-gallery/home-gallery-dependencies", () => ({ createPublicHomeGalleryRepository: () => ({ listShortsCatalog: mock.list }) }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>, FanContentContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/features/home/ui/shorts-catalog", () => ({ ShortsCatalog: ({ catalog }: { catalog: { items: unknown[] } }) => <div data-testid="shorts">{catalog.items.length}</div> }));
import ShortsPage from "./page";

it("loads the public shorts catalog for sorting and filtering", async () => {
  mock.list.mockResolvedValue({ items: [{ id: "one" }], likes: {} });
  render(await ShortsPage({ searchParams: Promise.resolve({ locale: "ko", offset: "12" }) }));
  expect(mock.list).toHaveBeenCalledWith("ko");
  expect(screen.getByTestId("shorts")).toHaveTextContent("1");
  expect(screen.queryByRole("link", { name: "더 보기" })).toBeNull();
});
it("rejects invalid offsets before reading", async () => {
  mock.list.mockClear();
  await expect(ShortsPage({ searchParams: Promise.resolve({ offset: "-1" }) })).rejects.toThrow("redirect");
  expect(mock.list).not.toHaveBeenCalled();
});
