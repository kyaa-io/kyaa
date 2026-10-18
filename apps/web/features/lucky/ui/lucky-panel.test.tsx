import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { luckyCopy } from "@/i18n/catalogs/features__lucky";
import { LuckyPanel } from "./lucky-panel";
const mocks = vi.hoisted(() => ({ resource: vi.fn(), cheer: vi.fn(), retry: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/fanpage/ui/use-fanpage-resource", () => ({ useFanpageResource: mocks.resource }));
vi.mock("@/features/fanpage/ui/cheer-event", () => ({
  useCheerEvent: mocks.cheer, CheerEventFeedback: () => null,
  cheerEventHref: (slug: string, locale: string) => `/celebrities/${slug}?locale=${locale}&tab=events#event-cheers`,
}));
const raffle = { id: "raffle-a", benefitId: "benefit-a" as string | null, title: "Actual gift", summary: "Actual description", imageUrl: "/actual-gift.png", winnerQuantity: 7, status: "open", entryClosesAt: "2099-10-01T00:00:00Z", fulfillmentMethod: "digital", entryOpensAt: null, perFanTicketLimit: null };
function setup(items = [raffle]) {
  mocks.resource.mockReturnValue({ state: { status: "ready", data: { raffles: items } }, retry: mocks.retry });
  mocks.cheer.mockReturnValue({ event: null, status: "ready", refresh: mocks.refresh });
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("LuckyPanel", () => {
  it("uses the selected creator's real raffles and detail route without a nested app frame", () => {
    setup();
    render(<LuckyPanel creator={{ slug: "actual-creator", name: "Actual Creator" }} locale="en" />);
    expect(mocks.resource).toHaveBeenCalledWith("/api/celebrities/actual-creator/raffles?locale=en", expect.any(Function));
    expect(mocks.cheer).toHaveBeenCalledWith("actual-creator", "en");
    expect(screen.getByRole("heading", { name: "Actual gift" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View event details" })).toHaveAttribute("href", "/c/actual-creator/raffles/benefit-a?locale=en");
    expect(screen.getByRole("link", { name: "My entries" })).toHaveAttribute("href", "/my/raffles?locale=en");
    expect(document.querySelector("main")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ended" }));
    expect(screen.queryByRole("heading", { name: "Actual gift" })).not.toBeInTheDocument();
  });
  it("keeps comment participation separate and displays actual prize metadata and reserved weight", () => {
    setup();
    mocks.cheer.mockReturnValue({ status: "ready", refresh: mocks.refresh, event: {
      creatorSlug: "actual-creator", status: "open", entryClosesAt: "2099-10-01T00:00:00Z", entryOpensAt: "2020-01-01T00:00:00Z", reservationAvailable: false,
      prizes: [{ benefitId: "comment-prize", title: "Actual comment prize", imageUrl: "/actual-comment.png", winnerQuantity: 3 }],
      participation: { entered: true, reserved: true, weight: 2 },
    } });
    render(<LuckyPanel creator={{ slug: "actual-creator", name: "Actual Creator" }} locale="en" />);
    expect(screen.getByText("Actual comment prize")).toBeInTheDocument();
    expect(screen.getByText(/One entry per account/)).toBeInTheDocument();
    expect(screen.getByText(/Your entry is confirmed/)).toHaveTextContent("2×");
    expect(screen.queryByText(/Starbucks/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View event details" })).toHaveLength(2);
  });
  it("distinguishes load failure from an empty list and retries the failed request", () => {
    setup();
    mocks.resource.mockReturnValue({ state: { status: "error", code: "UNAVAILABLE" }, retry: mocks.retry });
    render(<LuckyPanel creator={{ slug: "actual-creator", name: "Actual Creator" }} locale="en" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load events.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.retry).toHaveBeenCalledOnce();
  });
  it("moves elapsed and cancelled ticket events to Ended without a fake entry action", () => {
    setup([{ ...raffle, entryClosesAt: "2020-01-01T00:00:00Z" }, { ...raffle, id: "cancelled", title: "Cancelled gift", status: "cancelled", benefitId: null }]);
    render(<LuckyPanel creator={{ slug: "actual-creator", name: "Actual Creator" }} locale="en" />);
    expect(screen.queryByRole("heading", { name: "Actual gift" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ended" }));
    expect(screen.getByRole("heading", { name: "Actual gift" })).toBeInTheDocument();
    expect(screen.getByText("Event cancelled")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View event details" })).toHaveLength(1);
  });
  it.each(APP_LOCALES)("provides complete copy and content locale mapping for %s", locale => {
    setup([]);
    render(<LuckyPanel creator={{ slug: "actual-creator", name: "Actual Creator" }} locale={locale} />);
    expect(Object.values(luckyCopy(locale)).every(value => typeof value === "string" && value.length > 0)).toBe(true);
    expect(screen.getByRole("heading", { name: luckyCopy(locale).heading })).toBeInTheDocument();
    expect(mocks.resource).toHaveBeenCalledWith(expect.stringContaining(`locale=${locale === "ko" ? "ko" : "en"}`), expect.any(Function));
  });
});
