import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ state: { status: "loading" } as unknown, url: "", authenticated: false, options: [] as { slug: string; passportId: string }[], roadmap: undefined as unknown, roadmapUrl: null as string | null }));
vi.mock("./use-ranking-resource", () => ({ useRankingResource: (url: string) => { h.url = url; return { state: h.state, retry: vi.fn() }; } }));
vi.mock("@/features/selected-bias/ui/use-selected-bias", () => ({ useSelectedBias: () => ({ status: h.authenticated ? "ready" : "guest", options: h.options, selected: null, unverified: null, select: vi.fn(), retry: vi.fn() }) }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  useGroupRequest: () => ({ authenticated: h.authenticated, ready: true }),
  useGroupResource: (url: string | null) => { h.roadmapUrl = url; return { data: url ? h.roadmap : undefined, loading: false, error: false, retry: vi.fn() }; },
}));
import { togetherWith } from "../domain/heart-donation";
import { HeartDonationDetail } from "./heart-donation-detail";
import { HomeHeartDonation } from "./home-heart-donation";
import { JjinfanChallengeDetail } from "./jjinfan-detail";

afterEach(cleanup);
// `count` is the number of 찐팬 (fans holding a heart); the heart gauge reads `hearts`, the total of hearts on the page (대표 2026-11-11).
const item = (slug: string, count: number, hearts: number) => ({ slug, name: slug === "elina" ? "엘리나" : "웬아", imageUrl: null, title: "제목", description: "", endsOn: null, count, hearts, target: 100 as const });
const event = { creatorSlug: "elina", creatorName: null, cause: null, recipient: null };

it("picks 와 or 과 by the last syllable in Korean and leaves other languages to the translation", () => {
  expect(togetherWith("ko", "엘리나")).toBe("엘리나와");
  expect(togetherWith("ko", "지민")).toBe("지민과");
  expect(togetherWith("ko", "Elina")).toBe("Elina와");
  expect(togetherWith("en", "Elina")).toBe("Elina");
});

it("shows a skeleton while reading", () => {
  h.state = { status: "loading" };
  const { container } = render(<HomeHeartDonation locale="ko" />);
  expect(container.querySelector("[data-skeleton]")).not.toBeNull();
});

it("reads 0 honestly for no challenge or a failed read, and still links to the event page (no blank band)", () => {
  for (const state of [{ status: "error" }, { status: "ready", data: { items: [] } }]) {
    h.state = state;
    render(<HomeHeartDonation locale="ko" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/events/heart-donation?locale=ko");
    expect(screen.getByRole("link").textContent).toContain("엘리나와 함께 찐팬 하트로 불우이웃 후원하기");
    expect(screen.getByRole("link").textContent).toContain("0/100");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
    cleanup();
  }
});

it("fills by the hearts of the creator the settings name, not the first challenge and not the fan count, and carries no 찐팬 100 wording", () => {
  h.state = { status: "ready", data: { items: [item("wena", 90, 90), item("elina", 5, 37)] } };
  const { container } = render(<HomeHeartDonation locale="ko" event={event} />);
  expect(h.url).toBe("/api/rankings/challenges?locale=ko");
  const link = screen.getByRole("link");
  expect(link.textContent).toContain("37/100");
  expect(link.textContent).not.toContain("5/100");
  expect(link.textContent).toContain("하트 100개가 모이면 1개당 1,000원을 후원해요");
  expect(link.textContent).not.toContain("찐팬 100");
  expect(screen.getAllByRole("meter")).toHaveLength(1);
  expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "37");
  expect(container.querySelector('[data-end="live"]')).not.toBeNull();
});

it("takes the creator and the cause from the settings", () => {
  h.state = { status: "ready", data: { items: [item("wena", 1, 12)] } };
  render(<HomeHeartDonation locale="ko" event={{ creatorSlug: "wena", creatorName: "설정이름", cause: "유기동물", recipient: null }} />);
  expect(screen.getByRole("link").textContent).toContain("웬아와 함께 찐팬 하트로 유기동물 후원하기");
  expect(screen.getByRole("link").textContent).toContain("12/100");
});

it("clamps hearts over 100 and drops the blinking end at 100", () => {
  h.state = { status: "ready", data: { items: [item("elina", 40, 130)] } };
  const { container } = render(<HomeHeartDonation locale="ko" />);
  expect(screen.getByRole("link").textContent).toContain("100/100");
  expect(container.querySelector('[data-end="live"]')).toBeNull();
});

it("the event page reads the hearts, the donation line, 후원처 확정 후 안내 until a recipient is set, and links to the creator's fan tab", () => {
  h.state = { status: "ready", data: { items: [item("elina", 5, 37)] } };
  const { container } = render(<HeartDonationDetail locale="ko" event={event} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("엘리나와 함께 찐팬 하트로 불우이웃 후원하기");
  expect(container.querySelector("[data-heart-donation-gauge]")?.textContent).toContain("37/100");
  expect(container.querySelector("[data-heart-donation-gauge] [role=progressbar]")).toHaveAttribute("aria-valuenow", "37");
  expect(container.querySelector('[data-pending="recipient"]')?.textContent).toBe("후원처는 확정 후 안내해요");
  expect(container.querySelector('[data-pending="names"]')).not.toBeNull();
  // 대표 11/13: no dead-end 응원하러 가기; the fan tab is the 전체 보기 of 참여한 팬.
  expect(screen.queryByRole("link", { name: "응원하러 가기" })).toBeNull();
  expect(screen.getByRole("link", { name: /전체 보기/ })).toHaveAttribute("href", "/elina?tab=members&locale=ko");
});

it("the event page shows the recipient once the settings name one, and reads 0 with the creator's page as the cheer target when nothing is on", () => {
  h.state = { status: "ready", data: { items: [] } };
  const { container } = render(<HeartDonationDetail locale="ko" event={{ ...event, recipient: "사랑의 도시락" }} />);
  expect(container.querySelector('[data-recipient="set"]')?.textContent).toBe("사랑의 도시락");
  expect(container.querySelector('[data-pending="recipient"]')).toBeNull();
  expect(container.querySelector("[data-heart-donation-gauge]")?.textContent).toContain("0/100");
  expect(screen.getByRole("link", { name: /전체 보기/ })).toHaveAttribute("href", "/elina?tab=members&locale=ko");
});

const page = (filled: number, claimable: boolean, claimed = false) => ({ pageNo: 1, slots: [], filled, claimable, claimed, locked: false, lockedReason: null });

it("참여 방법: a guest starts at step 1 with one action that logs in and then opens the creator's passport verification", () => {
  h.authenticated = false; h.options = []; h.roadmap = undefined;
  h.state = { status: "ready", data: { items: [item("elina", 5, 13)] } };
  const { container } = render(<HeartDonationDetail locale="ko" event={event} />);
  const steps = container.querySelector('[data-block="heart-steps"]')!;
  expect(steps.getAttribute("data-step")).toBe("1");
  expect(steps.querySelectorAll("li[data-row]")).toHaveLength(3);
  expect(steps.textContent).toContain("엘리나 패스포트 받기");
  expect(steps.textContent).toContain("덕질로 스탬프 9개 모으기");
  expect(steps.querySelector("[role=progressbar]")).toHaveAttribute("aria-valuenow", "0");
  expect(steps.textContent).toContain("하트 1개 = 1,000원 후원");
  const go = screen.getByRole("link", { name: "받기" });
  expect(decodeURIComponent(go.getAttribute("href")!)).toContain("/c/elina/verify");
  expect(go.getAttribute("href")!.startsWith("/login")).toBe(true);
  expect(steps.querySelectorAll("a")).toHaveLength(1);
  expect(steps.querySelectorAll('img[src^="/images/stamps/ink-v1/"]').length).toBeGreaterThanOrEqual(4);
  expect(h.roadmapUrl).toBeNull();
});

it("참여 방법: a fan with the creator's passport is at step 2 with the page's stamps and the mission book; a full page moves to 하트 받기", () => {
  h.authenticated = true; h.options = [{ slug: "elina", passportId: "p-1" }];
  h.state = { status: "ready", data: { items: [item("elina", 5, 13)] } };
  h.roadmap = { pages: [page(4, false)] };
  const first = render(<HeartDonationDetail locale="ko" event={event} />);
  expect(h.roadmapUrl).toBe("/api/me/passports/p-1/roadmap");
  let steps = first.container.querySelector('[data-block="heart-steps"]')!;
  expect(steps.getAttribute("data-step")).toBe("2");
  expect(steps.textContent).toContain("4/9");
  expect(steps.querySelectorAll("[data-step-done]")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "미션 하기" })).toHaveAttribute("href", "/passports/p-1?locale=ko#mission-book");
  cleanup();
  h.roadmap = { pages: [page(9, true)] };
  const second = render(<HeartDonationDetail locale="ko" event={event} />);
  steps = second.container.querySelector('[data-block="heart-steps"]')!;
  expect(steps.getAttribute("data-step")).toBe("3");
  expect(steps.querySelectorAll("[data-step-done]")).toHaveLength(2);
  expect(screen.getByRole("link", { name: "하트 받기" })).toHaveAttribute("href", "/passports/p-1?locale=ko#mission-book");
  h.authenticated = false; h.options = []; h.roadmap = undefined;
});

it("the 찐팬 100 detail reads the 찐팬 count of the first challenge and has no donation part", () => {
  h.state = { status: "ready", data: { items: [item("elina", 63, 37)] } };
  const { container } = render(<JjinfanChallengeDetail locale="ko" />);
  expect(container.querySelector("[data-jjinfan-gauge]")?.textContent).toContain("63/100");
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "63");
  expect(container.textContent).not.toContain("후원");
  expect(container.textContent).not.toContain("기부");
  expect(screen.getByRole("link", { name: "응원하러 가기" })).toHaveAttribute("href", "/elina?tab=members&locale=ko");
});

it("the 찐팬 100 detail reads 0 with no cheer button when nothing is on or the read failed", () => {
  for (const state of [{ status: "error" }, { status: "ready", data: { items: [] } }]) {
    h.state = state;
    const { container } = render(<JjinfanChallengeDetail locale="ko" />);
    expect(container.querySelector("[data-jjinfan-gauge]")?.textContent).toContain("0/100");
    expect(screen.queryByRole("link", { name: "응원하러 가기" })).toBeNull();
    cleanup();
  }
});
