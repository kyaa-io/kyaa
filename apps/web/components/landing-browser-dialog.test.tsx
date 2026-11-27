// @vitest-environment-options {"url":"https://kyaa.io/"}
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname }));

const recorded = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const ga4 = vi.hoisted(() => vi.fn());
vi.mock("@/features/analytics/client/product-event-client", () => ({ recordProductEventV1: recorded }));
vi.mock("@/features/analytics/client/ga4-client", () => ({ sendGa4Event: ga4 }));

import { LandingBrowserDialog } from "./landing-browser-dialog";

const iosX = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Twitter for iPhone";
const androidX = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 TwitterAndroid";
const iosInstagram = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 350.0.2.15.84 (iPhone15,2; iOS 18_1; ko_KR; ko; scale=3.00; 1179x2556; 650522985)";
const iosSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const raffle = "/s/raffle?utm_source=x&utm_medium=paid&utm_campaign=raffle-1125&utm_content=ad01&invite=AB12CD&twclid=2-abc";

let assign: ReturnType<typeof vi.fn>;

function open(path: string, ua: string, keepStorage = false) {
  assign = vi.fn();
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false }) });
  window.history.replaceState(null, "", path);
  vi.stubGlobal("location", { ...window.location, href: new URL(path, "https://kyaa.io").href, assign });
  if (!keepStorage) window.sessionStorage.clear();
  render(<LandingBrowserDialog locale="en" />);
  act(() => { vi.advanceTimersByTime(0); });
}

const steps = () => recorded.mock.calls.map(([event]) => `${event.properties.app}:${event.properties.step}`);

describe("in-app browser strip", () => {
  beforeEach(() => { vi.useFakeTimers(); recorded.mockClear(); ga4.mockClear(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("does not move iPhone X by itself and offers Safari on a tap, keeping UTM, invite and the ad click id", () => {
    open(raffle, iosX);
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open in Safari" }));
    expect(assign).toHaveBeenCalledOnce();
    const target = String(assign.mock.calls[0]![0]);
    expect(target.startsWith("x-safari-https://kyaa.io/s/raffle?")).toBe(true);
    const query = new URL(target.replace("x-safari-https://", "https://")).searchParams;
    expect(Object.fromEntries(query)).toMatchObject({ utm_source: "x", utm_medium: "paid", utm_campaign: "raffle-1125", utm_content: "ad01", invite: "AB12CD", twclid: "2-abc", kyaa_browser: "x" });
    expect(ga4).toHaveBeenCalledWith("inapp_external_open", { app: "x", method: "safari" });
    expect(steps()).toEqual(["x:overlay", "x:attempt"]);
    // The raffle has its own copy-link row, so the strip does not repeat it.
    expect(screen.queryByRole("button", { name: "Copy address" })).toBeNull();
  });

  it("shows the app-menu steps when the app keeps the page after the tap", () => {
    open("/", iosX);
    expect(screen.queryByText(/Tap ···/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open in Safari" }));
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByText("Tap ··· or Share, then open in your browser.")).toBeInTheDocument();
  });

  it("opens Android X in Chrome by itself once, and not again when Chrome is missing and the page comes back", () => {
    open("/login?returnTo=%2Fs%2Fraffle%3Fenter%3D1&utm_source=x", androidX);
    expect(assign).toHaveBeenCalledOnce();
    const target = String(assign.mock.calls[0]![0]);
    expect(target).toMatch(/^intent:\/\/kyaa\.io\/login\?returnTo=%2Fs%2Fraffle%3Fenter%3D1&utm_source=x&kyaa_browser=x#Intent;package=com\.android\.chrome;scheme=https;/);
    expect(decodeURIComponent(target.split("S.browser_fallback_url=")[1]!)).toBe("https://kyaa.io/login?returnTo=%2Fs%2Fraffle%3Fenter%3D1&utm_source=x&kyaa_browser=x;end");
    expect(ga4).toHaveBeenCalledWith("inapp_external_open", { app: "x", method: "intent" });
    cleanup();
    // browser_fallback_url reloads the same page with kyaa_browser=x: the login page owns the manual action.
    open("/login?returnTo=%2Fs%2Fraffle%3Fenter%3D1&utm_source=x&kyaa_browser=x", androidX, true);
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Open in browser" })).toBeNull();
  });

  it("keeps Instagram's automatic hand-off", () => {
    open("/?utm_source=instagram", iosInstagram);
    expect(String(assign.mock.calls[0]![0])).toBe(`instagram://extbrowser/?url=${encodeURIComponent("https://kyaa.io/?utm_source=instagram&kyaa_browser=instagram")}`);
  });

  it("copies the address with the source mark on pages without their own copy row", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    open("/elina?utm_source=x", iosX);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy address" })); });
    expect(writeText).toHaveBeenCalledWith("https://kyaa.io/elina?utm_source=x&kyaa_browser=x");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("closes for the rest of the tab", () => {
    open("/", iosX);
    fireEvent.click(screen.getByRole("button", { name: "Continue here" }));
    expect(screen.queryByRole("button", { name: "Open in Safari" })).toBeNull();
    cleanup();
    open("/", iosX, true);
    expect(screen.queryByRole("button", { name: "Open in Safari" })).toBeNull();
  });

  it.each(["/my", "/admin", "/s/x", "/?token=abc", "/s/raffle#rules"])("stays off %s", (path) => {
    open(path, androidX);
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("records the arrival in the outside browser and drops the mark", () => {
    open("/s/raffle?invite=AB12CD&kyaa_browser=x", iosSafari);
    expect(steps()).toEqual(["x:arrival"]);
    expect(document.location.search).toBe("?invite=AB12CD");
    expect(screen.queryByRole("region")).toBeNull();
  });
});
