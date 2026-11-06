import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MyScreen } from "./my-screen";
import { fanLoginHref } from "../../../components/login-href";
import { walletCopy } from "../../group-wallet/ui/copy";
import { resetDukjilCatalogCache } from "../../dukjil/ui/dukjil-provider";

vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: false, getAccessToken: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/my", useSearchParams: () => new URLSearchParams() }));

const catalog = { version: 1, rules: { quiz: { points: 20 }, checkin: { points: 2 } }, missionBook: { pages: [{ pageNo: 1, slots: [{ slot: 1, action: "quiz" }, { slot: 2, action: "checkin" }] }] } };
const fetcher = vi.fn(async (url: string) => String(url).startsWith("/api/dukjil/catalog") ? Response.json(catalog) : new Response(null, { status: 401 }));
beforeEach(() => { fetcher.mockClear(); resetDukjilCatalogCache(); vi.stubGlobal("fetch", fetcher); });
afterEach(() => vi.unstubAllGlobals());

it.each(["ko", "en", "ja", "zh-Hans", "zh-Hant", "es", "id", "vi", "th", "pt", "fr"] as const)("keeps the MY sections signed out and sends the single login action back to MY in %s", (locale) => {
  render(<MyScreen locale={locale} />);
  const login = screen.getByRole("link", { name: walletCopy(locale).login });
  expect(login).toHaveAttribute("href", fanLoginHref(locale, `/my?locale=${locale}`));
  expect(screen.getAllByRole("heading").length).toBeGreaterThanOrEqual(5);
});

it("shows locked balance cells and the public mission book, and never reads personal APIs", async () => {
  render(<MyScreen locale="ko" />);
  expect(screen.getAllByRole("img", { name: "로그인 후 확인" })).toHaveLength(2);
  expect(await screen.findByRole("heading", { name: "미션북" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));
  expect(screen.getAllByRole("checkbox").every(box => box.getAttribute("aria-checked") === "false")).toBe(true);
  expect(fetcher.mock.calls.map(([url]) => String(url)).filter(url => url.startsWith("/api/me/") || url.includes("/api/passports"))).toEqual([]);
});

it("sends each activity row to login with its own destination", () => {
  render(<MyScreen locale="ko" />);
  const row = screen.getByRole("link", { name: /활동 내역/ });
  expect(row).toHaveAttribute("href", fanLoginHref("ko", "/my/activity?locale=ko"));
});
