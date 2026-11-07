import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { BannerSlot } from "./banner-slot";
import { resetBannerSlotRequests } from "./banner-slot-source";

const asset = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", url: "https://example.invalid/a.webp", width: 1440, height: 720, mimeType: "image/webp", revision: 1 };
const banner = (placement: string, extra: Record<string, unknown> = {}) => ({ id: "11111111-1111-4111-8111-111111111111", kind: "announcement", celebrityId: null, placement, category: "event", title: "찐팬100 챌린지", description: "엘리나 응원", ctaLabel: "응원하기", href: "/elina", alt: "찐팬100 챌린지", desktopImage: asset, mobileImage: null, ...extra });
const fetchMock = vi.fn();

beforeEach(() => { resetBannerSlotRequests(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const answer = (slots: unknown) => fetchMock.mockResolvedValue(new Response(JSON.stringify({ slots }), { status: 200 }));

it("draws nothing for an empty slot, while loading, or when the request fails", async () => {
  answer({});
  const { container } = render(<BannerSlot slot="home_below_board" locale="ko"/>);
  expect(container.innerHTML).toBe("");
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(container.innerHTML).toBe("");
  resetBannerSlotRequests();
  fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
  const failed = render(<BannerSlot slot="fanpage_second" locale="ko"/>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(failed.container.innerHTML).toBe("");
});

it("shares one request per area and shows an internal banner with the language kept", async () => {
  answer({ home_below_board: banner("home_below_board"), home_between_events: banner("home_between_events", { id: "22222222-2222-4222-8222-222222222222", title: "두 번째" }) });
  render(<><BannerSlot slot="home_below_board" locale="ja"/><BannerSlot slot="home_between_events" locale="ja"/></>);
  expect(await screen.findByText("찐팬100 챌린지")).toBeTruthy();
  expect(screen.getByText("두 번째")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/public/banner-slots?area=home&locale=ja");
  expect(screen.getAllByRole("link")[0].getAttribute("href")).toBe("/elina?locale=ja");
  expect(screen.queryByText("広告")).toBeNull();
});

it("labels an external ad and sends it through the shared outbound tracking", async () => {
  answer({ fanpage_below_gallery: banner("fanpage_below_gallery", { category: "ad", href: "https://partner.example.com/x?utm_source=partner" }) });
  render(<BannerSlot slot="fanpage_below_gallery" locale="ko"/>);
  expect(await screen.findByText("광고")).toBeTruthy();
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("https://partner.example.com/x?utm_source=partner");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toContain("noopener");
  expect(link.getAttribute("data-outbound-placement")).toBe("content");
});

it("refuses a banner sent for another slot", async () => {
  answer({ home_below_board: banner("fanpage_second") });
  const { container } = render(<BannerSlot slot="home_below_board" locale="ko"/>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(container.innerHTML).toBe("");
});
