import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdsenseUnitsProvider } from "@/features/adsense/ui/adsense-unit";
import { BoardAdRail } from "./board-ad-rail";

vi.mock("@/components/banner-slot/banner-slot-source", () => ({ useBannerSlots: () => ({}) }));

function wideScreen(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList);
}

describe("BoardAdRail with AdSense", () => {
  afterEach(() => { vi.restoreAllMocks(); delete (window as { adsbygoogle?: unknown }).adsbygoogle; });
  it("fills the empty PC rail with the board AdSense unit", async () => {
    wideScreen(true);
    const { container } = render(<AdsenseUnitsProvider units={{ board_side: "9876543210" }}><BoardAdRail locale="ko" /></AdsenseUnitsProvider>);
    await waitFor(() => expect(container.querySelector('[data-board-ad-rail] [data-adsense-placement="board_side"] ins')).toHaveAttribute("data-ad-slot", "9876543210"));
  });
  it("draws no rail without a unit ID or below 1280", async () => {
    wideScreen(true);
    const unset = render(<AdsenseUnitsProvider units={null}><BoardAdRail locale="ko" /></AdsenseUnitsProvider>);
    expect(unset.container.innerHTML).toBe("");
    unset.unmount();
    wideScreen(false);
    const narrow = render(<AdsenseUnitsProvider units={{ board_side: "9876543210" }}><BoardAdRail locale="ko" /></AdsenseUnitsProvider>);
    expect(narrow.container.innerHTML).toBe("");
  });
});
