import type { ComponentProps, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { GroupPageHead, GroupPageFrame } from "./group-page-frame";
import { GroupPageProvider } from "./group-page-context";
import { groupsCopy, pageUnavailable } from "./copy";

const state = vi.hoisted(() => ({
  data: undefined as ComponentProps<typeof GroupPageFrame>["initialDetail"],
  query: "locale=ko&tab=board", error: false, loading: false,
  failure: undefined as { status: number } | undefined,
  ownerKey: "guest", retry: vi.fn(), preload: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query), usePathname: () => "/mina", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ prefetch, onNavigate: _onNavigate, scroll: _scroll, ...props }: any) => <a {...props} data-prefetch={prefetch === undefined ? "default" : String(prefetch)} /> }));
vi.mock("./use-group-resource", () => ({
  useGroupResource: () => ({ ...state, ready: true, authenticated: false, request: vi.fn() }),
}));
vi.mock("./use-linked-fanpage", () => ({ useLinkedFanpage: () => ({ data: undefined, error: false, retry: vi.fn() }) }));
vi.mock("./use-group-preload", () => ({ usePreloadGroupResource: () => state.preload }));
vi.mock("./use-group-presence", async importOriginal => ({ ...await importOriginal<typeof import("./use-group-presence")>(), useOwnGroupPresence: () => ({ error: false, retry: vi.fn() }) }));
vi.mock("./group-presence", () => ({ GroupPresence: ({ memberCount }: { memberCount?: number }) => <div>{memberCount}</div> }));
vi.mock("./group-page-menu", () => ({ GroupPageMenu: () => null }));
vi.mock("./group-shell", () => ({ GroupShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: false }) }));
vi.mock("@/components/fan-ui/use-owned-fan-resource", () => ({ useOwnedFanResource: () => ({ state: { status: "loading" }, retry: vi.fn() }) }));
vi.mock("@/features/content-safety/ui/use-automatic-translation", () => ({ TranslationControl: () => null, useAutomaticTranslation: ({ texts }: { texts: readonly string[] }) => ({ observeElement: () => {}, texts }) }));

const detail: NonNullable<ComponentProps<typeof GroupPageFrame>["initialDetail"]> = {
  page: { id: "page-id", kind: "hobby", celebrityId: null, slug: "example", name: "테스트 모임", description: "모임 소개", memberCount: 13, question: null, imageUrl: null },
  membership: null, bookmarked: false,
};
const tree = (props: Partial<ComponentProps<typeof GroupPageFrame>> = {}) => <GroupPageFrame pageId="page-id" locale="ko" {...props}><div>panel content</div></GroupPageFrame>;
const tabNav = () => document.querySelector("nav[data-fan-tabs]")!;
beforeEach(() => {
  Object.assign(state, { data: detail, query: "locale=ko&tab=board", error: false, loading: false, failure: undefined, ownerKey: "guest", retry: vi.fn(), preload: vi.fn() });
});

it("leaves prefetch to the shared Link for all five tabs: off until a pointer reaches one, then the default", () => {
  render(tree());
  const links = Array.from(tabNav().querySelectorAll("a"));
  expect(links).toHaveLength(5);
  for (const link of links) expect(link).toHaveAttribute("data-prefetch", "false");
  fireEvent.mouseEnter(links[1]!);
  expect(links[1]).toHaveAttribute("data-prefetch", "null");
  expect(links[2]).toHaveAttribute("data-prefetch", "false");
});

it("puts the room links in the header icon row, one icon per link, after any creator links", () => {
  Object.assign(state, { data: { ...detail, page: { ...detail.page, externalLinks: [
    { kind: "kakao-openchat", url: "https://open.kakao.com/o/abc" },
    { kind: "kakao-openchat", url: "https://open.kakao.com/o/def" },
    { kind: "discord", url: "https://discord.gg/abc" },
  ] } } });
  render(tree());
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[data-platform]"));
  expect(links.map(link => link.dataset.platform)).toEqual(["kakao-openchat", "kakao-openchat", "discord"]);
  expect(links.map(link => link.getAttribute("href"))).toEqual(["https://open.kakao.com/o/abc", "https://open.kakao.com/o/def", "https://discord.gg/abc"]);
  for (const link of links) { expect(link).toHaveAttribute("rel", "noopener noreferrer"); expect(link).toHaveAttribute("target", "_blank"); }
  expect(links[0]!.querySelector("img")).toHaveAttribute("src", "/images/guest-home/kakao-openchat.svg");
});

it("draws no icon row for a page without room links", () => {
  render(tree());
  expect(document.querySelector("a[data-platform]")).toBeNull();
});

it.each([500, 403, 404])("keeps the same header and nav after a detail-fetch %s while switching to rooms", status => {
  const view = render(tree());
  const heading = screen.getByRole("heading", { level: 1, name: "테스트 모임" });
  const nav = tabNav();
  // A failed explicit retry drops data in useGroupResource, unlike a background refresh.
  Object.assign(state, { data: undefined, error: true, failure: { status }, query: "locale=ko&tab=rooms" });
  view.rerender(tree());
  expect(screen.getByRole("heading", { level: 1, name: "테스트 모임" })).toBe(heading);
  expect(tabNav()).toBe(nav);
  expect(nav.querySelector('[aria-current="page"]')).toHaveAttribute("href", "/pages/groups/page-id?locale=ko&tab=rooms");
  expect(screen.getByRole("alert")).toHaveTextContent(status === 500 ? groupsCopy("ko").error : pageUnavailable.ko);
  expect(screen.queryByText("panel content")).not.toBeInTheDocument();
  // An unavailable page (403/404) offers exploration instead of a permanent retry; only other failures retry.
  if (status === 500) {
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(state.retry).toHaveBeenCalledOnce();
  } else {
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "페이지 둘러보기" })).toHaveAttribute("href", "/pages/groups?locale=ko");
  }
  Object.assign(state, { data: detail, error: false, failure: undefined });
  view.rerender(tree());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("panel content")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "테스트 모임" })).toBe(heading);
  expect(tabNav()).toBe(nav);
});

it("keeps the initial header skeleton and tabs when the first detail fetch fails", () => {
  Object.assign(state, { data: undefined, loading: true });
  const view = render(tree());
  const header = document.querySelector('[data-fan-page-header="loading"]');
  const nav = tabNav();
  expect(header).toHaveAttribute("aria-busy", "true");
  Object.assign(state, { loading: false, error: true });
  view.rerender(tree());
  expect(document.querySelector('[data-fan-page-header="loading"]')).toBe(header);
  expect(tabNav()).toBe(nav);
  expect(screen.getByRole("alert")).toHaveTextContent(groupsCopy("ko").error);
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(state.retry).toHaveBeenCalledOnce();
});

it("keeps the server-provided header if the first client detail read fails", () => {
  Object.assign(state, { data: undefined, loading: true });
  const view = render(tree({ initialDetail: detail }));
  const heading = screen.getByRole("heading", { level: 1, name: "테스트 모임" });
  Object.assign(state, { loading: false, error: true });
  view.rerender(tree({ initialDetail: detail }));
  expect(screen.getByRole("heading", { level: 1, name: "테스트 모임" })).toBe(heading);
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

it.each(["page", "owner", "locale"])("does not retain another %s's header on error", changed => {
  const view = render(tree());
  Object.assign(state, { data: undefined, error: true });
  if (changed === "owner") state.ownerKey = "other-viewer";
  view.rerender(tree(changed === "page" ? { pageId: "other-page" } : changed === "locale" ? { locale: "en" } : {}));
  expect(screen.queryByRole("heading", { level: 1, name: "테스트 모임" })).not.toBeInTheDocument();
  expect(document.querySelector('[data-fan-page-header="loading"]')).toBeInTheDocument();
  expect(tabNav()).toBeInTheDocument();
});

it("places the proof tab immediately after the board on a fanpage route", () => {
  render(<GroupPageProvider slug="mina" locale="ko" celebrity={{ slug: "mina", locale: "ko", name: "Mina", summary: "", image: { url: "/mina.webp", alt: "Mina", position: "center" }, roles: ["idol"], themes: [], socialLinks: [], displayOrder: 0, fanCount: 0 }}><GroupPageHead /></GroupPageProvider>);
  const links = [...document.querySelectorAll("nav[data-fan-tabs]")].at(-1)!.querySelectorAll("a");
  expect([...links].slice(0, 3).map(link => link.textContent)).toEqual(["홈", "게시판", "인증"]);
  expect(links[2].getAttribute("href")).toContain("tab=proofs");
});
