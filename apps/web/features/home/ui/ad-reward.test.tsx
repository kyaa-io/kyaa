import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HomeBanner } from "@/features/home/domain/home-banner";

const state = vi.hoisted(() => ({ authenticated: false, ready: true, today: undefined as unknown, request: vi.fn(), urls: [] as (string | null)[] }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  useGroupRequest: () => ({ request: state.request, authenticated: state.authenticated, ready: state.ready }),
  useGroupResource: (url: string | null) => { state.urls.push(url); return { data: url ? state.today : undefined }; },
}));
import { ThinBanner } from "./home-thin-banner";

const AD = "11111111-1111-4111-8111-111111111111";
const asset = { id: "22222222-2222-4222-8222-222222222222", url: "/a.webp", width: 716, height: 180, mimeType: "image/webp", revision: 1 };
const banner = (extra: Partial<HomeBanner> = {}): HomeBanner => ({ id: AD, kind: "announcement", celebrityId: null, title: "광고", description: "", ctaLabel: "보기", href: "https://shop.example/", alt: "광고 그림",
  desktopImage: asset, mobileImage: null, category: "ad", ...extra });
const today = (claimed: string[], remaining = 10) => ({ kstDate: "2026-11-26", points: 5, dailyLimit: 10, remaining, claimed });
beforeEach(() => { state.authenticated = false; state.ready = true; state.today = undefined; state.urls = []; state.request.mockReset(); });
afterEach(cleanup);

it("shows a signed-out viewer the +5 pill and lets the link open without asking the server", () => {
  const { container } = render(<ThinBanner banner={banner()} locale="ko" />);
  expect(container.querySelector("[data-ad-reward=points]")).toHaveTextContent("+5");
  expect(screen.getByText("광고")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link"));
  expect(state.request).not.toHaveBeenCalled();
  expect(state.urls.every(url => url === null)).toBe(true);
});

it("pays a signed-in member's first click once and then shows the done badge", async () => {
  state.authenticated = true; state.today = today([]);
  state.request.mockResolvedValue({ points: 5, capped: false, reason: null, replayed: false });
  const { container } = render(<ThinBanner banner={banner()} locale="ko" />);
  expect(container.querySelector("[data-ad-reward=points]")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link"));
  fireEvent.click(screen.getByRole("link"));
  expect(state.request).toHaveBeenCalledTimes(1);
  expect(state.request).toHaveBeenCalledWith("/api/me/dukjil/ad-reward", expect.objectContaining({ method: "POST", body: JSON.stringify({ bannerId: AD }), keepalive: true }));
  await waitFor(() => expect(container.querySelector("[data-ad-reward=done]")).toBeInTheDocument());
});

it("shows done for a banner paid earlier today and nothing once the day's 10 are used", () => {
  state.authenticated = true; state.today = today([AD], 9);
  const first = render(<ThinBanner banner={banner()} locale="ko" />);
  expect(first.container.querySelector("[data-ad-reward=done]")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link"));
  expect(state.request).not.toHaveBeenCalled();
  first.unmount();
  state.today = today([], 0);
  const { container } = render(<ThinBanner banner={banner()} locale="ko" />);
  expect(container.querySelector("[data-ad-reward]")).toBeNull();
});

it("keeps the link working when the reward call fails", async () => {
  state.authenticated = true; state.today = today([]);
  state.request.mockRejectedValue(new Error("DUKJIL_UNAVAILABLE"));
  const { container } = render(<ThinBanner banner={banner()} locale="ko" />);
  const link = screen.getByRole("link");
  expect(fireEvent.click(link)).toBe(true);
  await waitFor(() => expect(state.request).toHaveBeenCalled());
  expect(container.querySelector("[data-ad-reward=points]")).toBeInTheDocument();
});

it("draws nothing on a banner that is neither an ad nor in the home_mid slot", () => {
  const { container } = render(<ThinBanner banner={banner({ category: "event", href: "/events" })} locale="ko" />);
  expect(container.querySelector("[data-ad-reward]")).toBeNull();
  const mid = render(<ThinBanner banner={banner({ category: "event", placement: "home_mid" })} locale="ko" size="mid" />);
  expect(mid.container.querySelector("[data-ad-reward=points]")).toBeInTheDocument();
});
