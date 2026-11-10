import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { giftCopy } from "@/i18n/catalogs/features__gifts__ui__gift-copy";
import type { Gift } from "../domain/gift";
import { GiftGlowIcon } from "./gift-glow";
import { GiftNotice } from "./gift-notice";
import { GiftStages, giftTrack } from "./gift-stages";
import { giftText } from "./gift-text";
import { GiftViewedMarker } from "./gift-viewed-marker";
import { giftStatusKey, groupGifts } from "./gifts-screen";

const result = (overrides: Partial<Gift["result"]> = {}): Gift["result"] => ({
  benefitId: "10000000-0000-4000-8000-000000000001", campaignId: "10000000-0000-4000-8000-000000000002", title: "전시 관람권", imageUrl: null,
  benefitHref: "/benefits/10000000-0000-4000-8000-000000000001", state: "won", enteredTickets: 1, entryClosesAt: null, publishedAt: "2026-11-10T00:00:00+09:00",
  winnerId: "10000000-0000-4000-8000-000000000003", method: "physical_shipping", fulfillmentStatus: "information_required", claimDisposition: "active",
  recipientDeadlineAt: null, recipientSubmitted: false, recipientEditable: true, policy: null, ...overrides,
});
const gift = (id: string, unread: boolean, overrides: Partial<Gift["result"]> = {}): Gift => ({ rewardResultId: `20000000-0000-4000-8000-00000000000${id}`, unread, updatedAt: "2026-11-10T00:00:00+09:00", result: result(overrides) });

describe("gift tab", () => {
  it("has every label in every locale", () => {
    for (const locale of APP_LOCALES) for (const key of Object.keys(giftCopy.ko) as (keyof typeof giftCopy.ko)[]) expect(giftText(locale, key, 3).length, `${locale}.${key}`).toBeGreaterThan(0);
    expect(giftText("ko", "iconLabelUnread", 2)).toBe("선물, 안 읽은 선물 2개");
  });

  it("places a win on the delivery track of its own method", () => {
    expect(giftTrack(result())).toEqual({ steps: ["stageInfo", "stageShipPrep", "stageTransit", "stageDelivered"], at: 0 });
    expect(giftTrack(result({ fulfillmentStatus: "shipping_in_transit" }))?.at).toBe(2);
    expect(giftTrack(result({ method: "on_site_pickup", fulfillmentStatus: "pickup_available" }))).toEqual({ steps: ["stageInfo", "stageReady", "stagePickup", "stagePickedUp"], at: 2 });
    expect(giftTrack(result({ method: "digital", fulfillmentStatus: "digital_delivered" }))).toEqual({ steps: ["stageDigitalWait", "stageDigitalDone"], at: 1 });
  });

  it("marks only the current step and checks the finished ones", () => {
    render(<GiftStages result={result({ fulfillmentStatus: "shipping_in_transit" })} locale="ko" />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("data-state"))).toEqual(["done", "done", "current", "next"]);
    expect(items.filter((item) => item.getAttribute("aria-current") === "step")).toHaveLength(1);
  });

  it("sorts gifts into new, in progress and received, and names the row state", () => {
    const gifts = [gift("1", true), gift("2", false, { fulfillmentStatus: "shipping_in_transit" }), gift("3", false, { fulfillmentStatus: "shipping_completed" })];
    const groups = groupGifts(gifts);
    expect(groups.fresh).toHaveLength(1);
    expect(groups.progress.map((item) => item.rewardResultId)).toEqual([gifts[1].rewardResultId]);
    expect(groups.received.map((item) => item.rewardResultId)).toEqual([gifts[2].rewardResultId]);
    expect(giftStatusKey(gifts[0])).toBe("tagInfo");
    expect(giftStatusKey(gifts[1])).toBe("stageTransit");
  });

  it("draws the glow only for unread gifts", () => {
    const { container, rerender } = render(<GiftGlowIcon unread={false} />);
    expect(container.querySelector("[data-gift-glow]")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    rerender(<GiftGlowIcon unread />);
    expect(container.querySelector("[data-gift-glow]")).not.toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("shows no notice without unread gifts", () => {
    const { container } = render(<GiftNotice locale="ko" unreadCount={0} singleUnreadId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("gift glow motion", () => {
  const css = readFileSync(resolve(process.cwd(), "features/gifts/ui/gift-glow.module.css"), "utf8");
  it("never repeats forever and animates only opacity and transform", () => {
    expect(css).not.toMatch(/infinite/);
    const properties = new Set<string>();
    for (const start of css.matchAll(/@keyframes [\w-]+ \{/g)) {
      let depth = 1, end = start.index! + start[0].length;
      while (depth > 0) { depth += css[end] === "{" ? 1 : css[end] === "}" ? -1 : 0; end += 1; }
      for (const declaration of css.slice(start.index! + start[0].length, end - 1).matchAll(/([a-z-]+)\s*:/g)) properties.add(declaration[1]);
    }
    expect([...properties].sort()).toEqual(["opacity", "transform"]);
    expect(css).not.toMatch(/filter|box-shadow|gradient|backdrop/);
  });
  it("stops moving under reduced motion and swaps the glow for a dot in forced colors", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
    expect(css).toMatch(/@media \(forced-colors: active\)[\s\S]*\.forcedDot \{ display: block/);
  });
  it("starts the entrance inside 600ms", () => {
    expect(css).toMatch(/gift-halo-in 400ms/);
    expect(css).toMatch(/gift-shine 4000ms[^;]* 100ms 3/);
  });
});

describe("GiftViewedMarker", () => {
  const getAccessToken = vi.fn(async () => "token");
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ unreadCount: 0, singleUnreadId: null }), { status: 200 }));
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("fetch", fetcher); fetcher.mockClear(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); Object.defineProperty(document, "hidden", { configurable: true, value: false }); });

  it("tells the server only after the gift has been on screen for 0.8 seconds", async () => {
    render(<GiftViewedMarker rewardResultId="20000000-0000-4000-8000-000000000001" ownerId="owner" getAccessToken={getAccessToken} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/me/gifts/20000000-0000-4000-8000-000000000001/read", expect.objectContaining({ method: "POST" }));
  });

  it("does not count time while the tab is hidden", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    render(<GiftViewedMarker rewardResultId="20000000-0000-4000-8000-000000000001" ownerId="owner" getAccessToken={getAccessToken} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends nothing when the page is left before 0.8 seconds", async () => {
    const view = render(<GiftViewedMarker rewardResultId="20000000-0000-4000-8000-000000000001" ownerId="owner" getAccessToken={getAccessToken} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
