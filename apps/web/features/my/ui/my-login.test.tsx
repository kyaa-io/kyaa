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

it.each(["ko", "en", "ja", "zh-Hans", "zh-Hant", "es", "id", "vi", "th", "pt", "fr"] as const)("keeps the MY sections signed out and sends the wallet card login back to the 덕질 wallet in %s", (locale) => {
  render(<MyScreen locale={locale} />);
  // B13: the signed-out wallet card is itself the way to log in (locked numbers, the whole card is the link) and comes back to the 덕질 wallet.
  const login = document.querySelector('[data-wallet-card="my"]');
  expect(login).toHaveAttribute("href", fanLoginHref(locale, `/benefits?locale=${locale}#wallet`));
  expect(new URL(login!.getAttribute("href")!, "https://kyaa.invalid").searchParams.get("returnTo")).toBe(`/benefits?locale=${locale}#wallet`);
  expect(screen.getAllByRole("heading").length).toBeGreaterThanOrEqual(5);
});

it("shows locked balance cells and the public mission book, and never reads personal APIs", async () => {
  render(<MyScreen locale="ko" />);
  expect(screen.getAllByRole("img", { name: "로그인 후 확인" })).toHaveLength(5);
  expect(await screen.findByRole("heading", { name: "미션북", hidden: true })).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));
  expect(screen.getAllByRole("checkbox").every(box => box.getAttribute("aria-checked") === "false")).toBe(true);
  expect(fetcher.mock.calls.map(([url]) => String(url)).filter(url => url.startsWith("/api/me/") || url.includes("/api/passports"))).toEqual([]);
});

it("sends each activity row to login with its own destination", () => {
  render(<MyScreen locale="ko" />);
  const row = screen.getByRole("link", { name: /활동 내역/ });
  expect(row).toHaveAttribute("href", fanLoginHref("ko", "/my/activity?locale=ko"));
});

it("keeps the signed-in order signed out: passport, wallet, favorites, shortcuts, with the locked wallet card as the login link", () => {
  render(<MyScreen locale="ko" />);
  const sections = ["내 패스포트", "내 지갑", "내 최애", "바로가기"].map(name => screen.getByRole("heading", { name }));
  sections.reduce((previous, current) => { expect(Boolean(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true); return current; });
  expect(screen.queryByRole("heading", { name: "함께 모은 스탬프" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "래플 결과가 발표됐어요" })).toBeNull();
  const wallet = screen.getByRole("link", { name: "내 지갑" });
  expect(wallet).toHaveAttribute("href", fanLoginHref("ko", "/benefits?locale=ko#wallet"));
  expect(within(wallet).getAllByRole("img", { name: "로그인 후 확인" })).toHaveLength(3);
  expect(document.body.textContent).not.toContain("모은 포인트 사용하기");
  expect(screen.getByRole("link", { name: "내 응모 내역" })).toHaveAttribute("href", fanLoginHref("ko", "/my/raffles?locale=ko"));
  expect(screen.getByRole("link", { name: "문의 내역" })).toHaveAttribute("href", fanLoginHref("ko", "/my/inquiries?locale=ko"));
  expect(screen.getByRole("region", { name: "내 최애" })).toHaveTextContent("로그인 후 확인");
});
