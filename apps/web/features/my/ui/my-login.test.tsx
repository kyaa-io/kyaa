import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MyScreen } from "./my-screen";
import { fanLoginHref } from "../../../components/login-href";
import { resetDukjilCatalogCache } from "../../dukjil/ui/dukjil-provider";

vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: false, getAccessToken: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/my", useSearchParams: () => new URLSearchParams() }));

const catalog = { version: 1, rules: { quiz: { points: 20 }, checkin: { points: 2 } }, missionBook: { pages: [{ pageNo: 1, slots: [{ slot: 1, action: "quiz" }, { slot: 2, action: "checkin" }] }] } };
const fetcher = vi.fn(async (url: string) => String(url).startsWith("/api/dukjil/catalog") ? Response.json(catalog) : new Response(null, { status: 401 }));
beforeEach(() => { fetcher.mockClear(); resetDukjilCatalogCache(); vi.stubGlobal("fetch", fetcher); });
afterEach(() => vi.unstubAllGlobals());

it.each(["ko", "en", "ja", "zh-Hans", "zh-Hant", "es", "id", "vi", "th", "pt", "fr"] as const)("shows the login scene instead of locked values in the signed-out passport card in %s", (locale) => {
  render(<MyScreen locale={locale} />);
  const scene = document.querySelector("[data-login-scene]");
  expect(scene).not.toBeNull();
  const login = within(scene as HTMLElement).getByRole("link");
  expect(new URL(login.getAttribute("href")!, "https://kyaa.invalid").searchParams.get("returnTo")).toBe(`/my?locale=${locale}`);
  expect(screen.queryAllByRole("img", { name: /로그인 후 확인|Sign in to view/ })).toHaveLength(0);
  expect(screen.getAllByRole("heading").length).toBeGreaterThanOrEqual(3);
});

it("shows locked balance cells and the public mission book, and never reads personal APIs", async () => {
  render(<MyScreen locale="ko" />);
  expect(document.querySelector("[data-login-scene]")).not.toBeNull();
  expect(await screen.findByRole("heading", { name: "덕질 기록", hidden: true })).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));
  expect(screen.getAllByRole("checkbox").every(box => box.getAttribute("aria-checked") === "false")).toBe(true);
  expect(fetcher.mock.calls.map(([url]) => String(url)).filter(url => url.startsWith("/api/me/") || url.includes("/api/passports"))).toEqual([]);
});

it("sends each activity row to login with its own destination", () => {
  render(<MyScreen locale="ko" />);
  const row = screen.getByRole("link", { name: /활동 내역/ });
  expect(row).toHaveAttribute("href", fanLoginHref("ko", "/my/activity?locale=ko"));
});

it("keeps the signed-in order signed out: passport, shortcuts, with the login scene as the passport's login", () => {
  render(<MyScreen locale="ko" />);
  const sections = ["내 패스포트", "바로가기"].map(name => screen.getByRole("heading", { name }));
  sections.reduce((previous, current) => { expect(Boolean(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true); return current; });
  expect(screen.queryByRole("heading", { name: "함께 모은 스탬프" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "래플 결과가 발표됐어요" })).toBeNull();
  expect(document.body.textContent).not.toContain("모은 포인트 사용하기");
  expect(screen.getByRole("link", { name: "내 응모 내역" })).toHaveAttribute("href", fanLoginHref("ko", "/my/raffles?locale=ko"));
  expect(screen.getByRole("link", { name: "문의 내역" })).toHaveAttribute("href", fanLoginHref("ko", "/my/inquiries?locale=ko"));
  expect(screen.getByRole("link", { name: "내 최애" })).toHaveAttribute("href", fanLoginHref("ko", "/celebrities?locale=ko"));
});
