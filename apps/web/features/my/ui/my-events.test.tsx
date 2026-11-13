import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyEvents, MyEventsSection, eventDday } from "./my-events";

const auth = vi.hoisted(() => ({ ready: true, authenticated: true, getAccessToken: vi.fn(async () => "token") }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));

const closesAt = Date.parse("2026-11-30T23:59:59.999+09:00");
const fetchMock = vi.fn();
beforeEach(() => { auth.authenticated = true; fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("MY event status", () => {
  it("counts days to the Korea-time deadline", () => {
    expect(eventDday(closesAt, Date.parse("2026-11-13T09:00:00+09:00"))).toBe("D-17");
    expect(eventDday(closesAt, Date.parse("2026-11-30T01:00:00+09:00"))).toBe("D-day");
    expect(eventDday(closesAt, closesAt + 1)).toBeNull();
  });

  it("shows the raffle row with the server chance count when entered", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ entered: true, chances: 4 }), { status: 200 }));
    render(<MyEventsSection locale="ko" />);
    const link = await screen.findByRole("link", { name: /KYAA 래플/ });
    expect(link).toHaveAttribute("href", "/s/raffle?locale=ko");
    expect(link).toHaveTextContent("응모 완료");
    expect(link).toHaveTextContent("당첨 기회 4회");
    expect(fetchMock).toHaveBeenCalledWith("/api/signup-event/entry", { headers: { authorization: "Bearer token" } });
  });

  it("shows not-entered without inventing a chance count", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ entered: false, chances: 0 }), { status: 200 }));
    render(<MyEventsSection locale="ko" />);
    const link = await screen.findByRole("link", { name: /KYAA 래플/ });
    expect(link).toHaveTextContent("미응모");
    expect(link).not.toHaveTextContent("당첨 기회");
  });

  it("renders nothing when the event is off or for guests", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const { container, rerender } = render(<MyEventsSection locale="ko" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    auth.authenticated = false; fetchMock.mockClear();
    rerender(<MyEventsSection locale="en" />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(render(<MyEvents locale="ko" rows={[]} />).container).toBeEmptyDOMElement();
  });
});
