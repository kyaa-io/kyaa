import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HomeBanner } from "@/features/home/domain/home-banner";

const state = vi.hoisted(() => ({ authenticated: false, ready: true, today: undefined as unknown, post: vi.fn(), request: vi.fn() }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  useGroupRequest: () => ({ request: state.request, authenticated: state.authenticated, ready: state.ready, ownerKey: "member:0" }),
}));
import { ThinBanner } from "./home-thin-banner";
import { resetAdRewardReads } from "./ad-reward";

const AD = "11111111-1111-4111-8111-111111111111";
const asset = { id: "22222222-2222-4222-8222-222222222222", url: "/a.webp", width: 716, height: 180, mimeType: "image/webp", revision: 1 };
const banner = (extra: Partial<HomeBanner> = {}): HomeBanner => ({ id: AD, kind: "announcement", celebrityId: null, title: "광고", description: "", ctaLabel: "보기", href: "https://shop.example/", alt: "광고 그림",
  desktopImage: asset, mobileImage: null, category: "ad", ...extra });
const today = (claimed: string[], remaining = 10) => ({ kstDate: "2026-11-26", points: 5, dailyLimit: 10, remaining, claimed });
const posts = () => state.request.mock.calls.filter(([, init]) => init?.method === "POST");
beforeEach(() => {
  state.authenticated = false; state.ready = true; state.today = undefined; state.post.mockReset(); state.request.mockReset(); resetAdRewardReads();
  state.request.mockImplementation((_url: string, init?: RequestInit) => init?.method === "POST" ? state.post() : Promise.resolve(state.today));
});
afterEach(cleanup);

it("shows a signed-out viewer the +5 pill and lets the link open without asking the server", () => {
  const { container } = render(<ThinBanner banner={banner()} locale="ko" />);
  expect(container.querySelector("[data-ad-reward=points]")).toHaveTextContent("+5");
  expect(screen.getByText("광고")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link"));
  expect(state.request).not.toHaveBeenCalled();
});

it("pays a signed-in member's first click once and then shows the paid amount", async () => {
  state.authenticated = true; state.today = { ...today([]), points: 7 };
  state.post.mockResolvedValue({ points: 8, capped: false, reason: null, replayed: false });
  const { container } = render(<ThinBanner banner={banner()} locale="ko" />);
  await waitFor(() => expect(container.querySelector("[data-ad-reward=points]")).toHaveTextContent("광고 보고 +7 마일리지"));
  fireEvent.click(screen.getByRole("link"));
  fireEvent.click(screen.getByRole("link"));
  expect(posts()).toHaveLength(1);
  expect(state.request).toHaveBeenCalledWith("/api/me/dukjil/ad-reward", expect.objectContaining({ method: "POST", body: JSON.stringify({ bannerId: AD }), keepalive: true }));
  await waitFor(() => expect(container.querySelector("[data-ad-reward=received]")).toHaveTextContent("+8 마일리지 받음"));
});

it("shows a previously paid banner even at the daily limit", async () => {
  state.authenticated = true; state.today = today([AD], 0);
  const first = render(<ThinBanner banner={banner()} locale="ko" />);
  await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(first.container.querySelector("[data-ad-reward=received]")).toHaveTextContent("+5 마일리지 받음"));
  fireEvent.click(screen.getByRole("link"));
  expect(posts()).toHaveLength(0);
  first.unmount();
  resetAdRewardReads(); state.today = today([], 0);
  const { container } = render(<ThinBanner banner={banner()} locale="ko" />);
  await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2));
  expect(container.querySelector("[data-ad-reward]")).toBeNull();
});

it("reads today once for every ad banner on the page", async () => {
  state.authenticated = true; state.today = today([]);
  const { container } = render(<><ThinBanner banner={banner()} locale="ko" /><ThinBanner banner={banner({ id: "33333333-3333-4333-8333-333333333333" })} locale="ko" size="mid" /></>);
  await waitFor(() => expect(container.querySelectorAll("[data-ad-reward=points]")).toHaveLength(2));
  expect(state.request).toHaveBeenCalledTimes(1);
});

it("keeps the link working when the reward call fails", async () => {
  state.authenticated = true; state.today = today([]);
  state.post.mockRejectedValue(new Error("DUKJIL_UNAVAILABLE"));
  const { container } = render(<ThinBanner banner={banner()} locale="ko" />);
  await waitFor(() => expect(container.querySelector("[data-ad-reward=points]")).toBeInTheDocument());
  const link = screen.getByRole("link");
  expect(fireEvent.click(link)).toBe(true);
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(container.querySelector("[data-ad-reward=points]")).toBeInTheDocument();
});

it("draws nothing on a banner that is neither an ad nor in the home_mid slot", () => {
  const { container } = render(<ThinBanner banner={banner({ category: "event", href: "/events" })} locale="ko" />);
  expect(container.querySelector("[data-ad-reward]")).toBeNull();
  const mid = render(<ThinBanner banner={banner({ category: "event", placement: "home_mid" })} locale="ko" size="mid" />);
  expect(mid.container.querySelector("[data-ad-reward=points]")).toBeInTheDocument();
});
