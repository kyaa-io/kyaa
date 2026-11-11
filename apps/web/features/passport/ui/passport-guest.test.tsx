import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PassportCollectionScreen, PassportDetailScreen } from "./passport-screens";
import { fanLoginHref } from "../../../components/login-href";
import { resetDukjilCatalogCache } from "../../dukjil/ui/dukjil-provider";

vi.mock("@/features/auth/client/auth-fallback", () => ({ usePrivy: () => ({ ready: true, authenticated: false, getAccessToken: vi.fn() }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/passports", useRouter: () => ({ push: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams("locale=ko") }));

const catalog = { version: 1, rules: { quiz: { points: 20 }, checkin: { points: 2 }, post: { points: 20 } }, missionBook: { pages: [{ pageNo: 1, slots: [{ slot: 1, action: "quiz" }, { slot: 2, action: "checkin" }, { slot: 3, action: "post" }] }] } };
const fetcher = vi.fn(async (url: string) => String(url).startsWith("/api/dukjil/catalog") ? Response.json(catalog) : new Response(null, { status: 401 }));
beforeEach(() => { fetcher.mockClear(); resetDukjilCatalogCache(); vi.stubGlobal("fetch", fetcher); });
afterEach(() => vi.unstubAllGlobals());

it("keeps the passport card and locks the personal values on the list", () => {
  render(<PassportCollectionScreen />);
  expect(screen.getByRole("heading", { name: "내 패스포트", level: 1 })).toBeInTheDocument();
  expect(screen.getAllByRole("img", { name: "로그인 후 확인" })).toHaveLength(2);
  expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", fanLoginHref("ko", "/passports?locale=ko"));
  expect(screen.getByRole("link", { name: /최애 찾기/ })).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalledWith(expect.stringContaining("/api/passports"), expect.anything());
});

it("shows the public mission book as empty slots on the detail and never reads the passport", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  render(<PassportDetailScreen id={id} explorerBaseUrl="https://example.invalid" />);
  expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", fanLoginHref("ko", `/passports/${id}?locale=ko`));
  expect(await screen.findByRole("heading", { name: "덕질 기록" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(3));
  expect(screen.getAllByRole("checkbox").every(box => box.getAttribute("aria-checked") === "false")).toBe(true);
  expect(fetcher.mock.calls.map(([url]) => String(url)).filter(url => url.includes("/api/passports") || url.includes("/api/me/"))).toEqual([]);
});
