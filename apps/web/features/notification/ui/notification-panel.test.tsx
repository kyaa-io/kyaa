import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "owner-a" }, getAccessToken: async () => "token" }));
vi.mock("@/features/auth/client/auth-fallback", () => ({ usePrivy: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
import { NotificationPanel } from "./notification-panel";

function Harness() {
  const [open, setOpen] = useState(true);
  const bell = useRef<HTMLButtonElement>(null);
  return <><button ref={bell} type="button" onClick={() => setOpen(true)}>bell</button><span>outside</span><NotificationPanel open={open} onOpenChange={setOpen} locale="ko" anchorRef={bell} /></>;
}

describe("NotificationPanel 1024+", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("64rem"), addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ notifications: [], unreadCount: 0 })));
  });
  it("opens a popover under the bell and closes on Escape and outside press, returning focus", async () => {
    render(<Harness />);
    const panel = await screen.findByRole("region", { name: "알림" });
    expect(panel).toHaveAttribute("data-notification-panel", "popover");
    // VISUAL-K ①: focus starts on the first control inside the popover, not on the frame.
    expect(panel.contains(document.activeElement) && document.activeElement !== panel).toBe(true);
    await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(screen.queryByRole("region", { name: "알림" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "bell" }));
    fireEvent.click(screen.getByRole("button", { name: "bell" }));
    await screen.findByRole("region", { name: "알림" });
    await act(async () => { fireEvent.pointerDown(screen.getByText("outside")); });
    expect(screen.queryByRole("region", { name: "알림" })).toBeNull();
  });
});
