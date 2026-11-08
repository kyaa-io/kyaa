import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/fan-ui/fan-action", () => ({
  FanAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}));
import { GoogleAnalytics } from "./google-analytics";
import { openAnalyticsConsent } from "./analytics-consent";
import { resetGa4ForTests, sendGa4Event } from "./ga4-client";

const scripts = () => document.querySelectorAll('script[src^="https://www.googletagmanager.com/"]');
const layer = () => (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
const pageViews = () => layer().filter(([kind, name]) => kind === "event" && name === "page_view");

beforeEach(() => {
  navigation.pathname = "/";
  window.localStorage.clear();
  document.cookie = "_ga=GA1.1.1; path=/";
  delete window.dataLayer;
  delete window.gtag;
  scripts().forEach((script) => script.remove());
  resetGa4ForTests();
});
afterEach(() => vi.useRealTimers());

describe("GoogleAnalytics", () => {
  it("renders and loads nothing without a measurement ID", () => {
    const view = render(<GoogleAnalytics measurementId="" />);
    expect(view.container).toBeEmptyDOMElement();
    expect(scripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  it("asks first and sends nothing before a choice or after a refusal", () => {
    render(<GoogleAnalytics measurementId="G-WKSF9KP5QW" />);
    expect(screen.getByRole("region", { name: "방문 통계 동의" })).toHaveTextContent("방문 통계에 Google 애널리틱스를 써도 될까요?");
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy");
    expect(scripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
    sendGa4Event("share", { method: "copy", content_type: "post" });
    expect(window.dataLayer).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "거부" }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(scripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
    expect(JSON.parse(window.localStorage.getItem("kyaa.analytics-consent.v1")!)).toMatchObject({ choice: "denied" });
  });

  it("loads gtag once after consent, with denied defaults and no automatic page view, then one page view per screen", () => {
    const view = render(<GoogleAnalytics measurementId="G-WKSF9KP5QW" />);
    fireEvent.click(screen.getByRole("button", { name: "허용" }));
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]).toHaveAttribute("src", "https://www.googletagmanager.com/gtag/js?id=G-WKSF9KP5QW");
    const entries = layer();
    expect(entries[0]).toEqual(["consent", "default", expect.objectContaining({ analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" })]);
    expect(entries[1]).toEqual(["consent", "update", { analytics_storage: "granted" }]);
    expect(entries.find(([kind]) => kind === "config")?.[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
    expect(pageViews()).toHaveLength(1);
    view.rerender(<GoogleAnalytics measurementId="G-WKSF9KP5QW" />);
    window.history.replaceState(null, "", "/?tab=board&returnTo=%2Fmy");
    view.rerender(<GoogleAnalytics measurementId="G-WKSF9KP5QW" />);
    expect(pageViews()).toHaveLength(1);
    navigation.pathname = "/passports/95800000-0000-4000-8000-000000000011";
    view.rerender(<GoogleAnalytics measurementId="G-WKSF9KP5QW" />);
    navigation.pathname = "/admin/traffic";
    view.rerender(<GoogleAnalytics measurementId="G-WKSF9KP5QW" />);
    expect(pageViews()).toHaveLength(2);
    expect(pageViews()[1][2]).toEqual({ page_location: "http://localhost:3000/passports/:id", page_referrer: "", page_title: "passport" });
    expect(JSON.stringify(layer())).not.toMatch(/95800000|returnTo|tab=board/);
    expect(scripts()).toHaveLength(1);
    sendGa4Event("share", { method: "copy", content_type: "post", url: "https://kyaa.io/x" });
    sendGa4Event("share", { method: "copy", content_type: "post" });
    expect(layer().filter(([kind, name]) => kind === "event" && name === "share")).toEqual([["event", "share", { method: "copy", content_type: "post" }]]);
  });

  it("remembers a choice for a year and lets the visitor change it from the footer link", () => {
    window.localStorage.setItem("kyaa.analytics-consent.v1", JSON.stringify({ choice: "granted", at: Date.now() - 366 * 24 * 60 * 60_000 }));
    const expired = render(<GoogleAnalytics measurementId="G-WKSF9KP5QW" />);
    expect(screen.getByRole("region", { name: "방문 통계 동의" })).toBeInTheDocument();
    expect(scripts()).toHaveLength(0);
    expired.unmount();
    window.localStorage.setItem("kyaa.analytics-consent.v1", JSON.stringify({ choice: "granted", at: Date.now() }));
    render(<GoogleAnalytics measurementId="G-WKSF9KP5QW" />);
    expect(screen.queryByRole("region")).toBeNull();
    expect(pageViews()).toHaveLength(1);
    act(() => openAnalyticsConsent());
    fireEvent.click(screen.getByRole("button", { name: "거부" }));
    expect(layer().at(-1)).toEqual(["consent", "update", { analytics_storage: "denied" }]);
    expect(document.cookie).not.toMatch(/_ga=/);
    sendGa4Event("cheer");
    expect(layer().some(([kind, name]) => kind === "event" && name === "cheer")).toBe(false);
  });

  it("does not put the bar on staff screens", () => {
    navigation.pathname = "/admin/traffic";
    render(<GoogleAnalytics measurementId="G-WKSF9KP5QW" />);
    expect(screen.queryByRole("region")).toBeNull();
  });
});
