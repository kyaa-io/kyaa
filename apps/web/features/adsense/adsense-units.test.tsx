import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { adsenseUnits } from "./adsense-units";
import { AdsenseUnit, AdsenseUnitsProvider } from "./ui/adsense-unit";

describe("adsenseUnits", () => {
  const env = { ADSENSE_APPROVED: "true", ADSENSE_SLOT_HOME_MID: "1234567890", ADSENSE_SLOT_BOARD_SIDE: "9876543210" };
  it("gives the unit IDs only on a page that carries the AdSense snippet", () => {
    expect(adsenseUnits(env, true, true)).toEqual({ home_mid: "1234567890", board_side: "9876543210" });
    expect(adsenseUnits(env, false, true)).toBeNull();
    expect(adsenseUnits({ ...env, ADSENSE_APPROVED: undefined }, true, true)).toBeNull();
  });
  it("is empty without IDs, and ignores values that are not AdSense unit IDs", () => {
    expect(adsenseUnits({}, true, true)).toBeNull();
    expect(adsenseUnits({ ...env, ADSENSE_SLOT_HOME_MID: "ca-pub-1", ADSENSE_SLOT_BOARD_SIDE: " 1234567 " }, true, true)).toEqual({ board_side: "1234567" });
  });
  it("draws the reserved spaces for a local preview, never on AWS", () => {
    expect(adsenseUnits({ ...env, ADSENSE_UNIT_PREVIEW: "1" }, false, false)).toEqual({ home_mid: "1234567890", board_side: "9876543210" });
    expect(adsenseUnits({ ...env, ADSENSE_UNIT_PREVIEW: "1" }, false, true)).toBeNull();
  });
});

describe("AdsenseUnit", () => {
  afterEach(() => { delete (window as { adsbygoogle?: unknown }).adsbygoogle; });
  it("draws nothing and requests nothing without a unit ID", () => {
    const { container } = render(<AdsenseUnitsProvider units={{ board_side: "9876543210" }}><AdsenseUnit placement="home_mid" locale="ko" /></AdsenseUnitsProvider>);
    expect(container.innerHTML).toBe("");
    expect((window as { adsbygoogle?: unknown[] }).adsbygoogle).toBeUndefined();
  });
  it("draws the labelled unit and asks AdSense once for a non-personalized ad", () => {
    const { container } = render(<AdsenseUnitsProvider units={{ home_mid: "1234567890" }}><AdsenseUnit placement="home_mid" locale="en" /></AdsenseUnitsProvider>);
    const ins = container.querySelector("ins.adsbygoogle")!;
    expect(ins).toHaveAttribute("data-ad-client", "ca-pub-6764620785144038");
    expect(ins).toHaveAttribute("data-ad-slot", "1234567890");
    expect(container.querySelector("[data-fan-tag]")?.textContent).toBe("Ad");
    const queue = (window as unknown as { adsbygoogle: unknown[] & { requestNonPersonalizedAds?: number } }).adsbygoogle;
    expect(queue).toHaveLength(1);
    expect(queue.requestNonPersonalizedAds).toBe(1);
  });
});
