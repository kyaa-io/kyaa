import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const dukjil = vi.hoisted(() => ({ value: null as null | { catalog: { rules: Record<string, unknown> } } }));
vi.mock("@/features/auth/client/auth-fallback", () => ({ usePrivy: () => ({ ready: true, authenticated: true, user: { id: "owner" } }) }));
vi.mock("@/features/dukjil/ui/dukjil-provider", async (original) => ({ ...(await original<typeof import("@/features/dukjil/ui/dukjil-provider")>()), useDukjil: () => dukjil.value }));

import { CommunityStampCollection } from "./community-stamp-collection";

beforeEach(() => { dukjil.value = null; });
const resource = (stamps: unknown[] = []) => ({ state: { status: "ready" as const, data: { stamps, today: "2026-11-11" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false }) as never;
const stamp = { id: "11111111-1111-4111-8111-111111111111", kind: "post", celebritySlug: "elina", issuedAt: "2026-11-01T00:00:00.000Z", mint: { status: "queued", txHash: null, tokenId: null } };

it("MY record lists earned stamps first, then the original five and only the stamps the active policy gives, each unearned kind with its own place to earn it", () => {
  dukjil.value = { catalog: { rules: { post: {}, quiz: {}, live_reserve: {}, checkin: {} } } };
  const { container } = render(<CommunityStampCollection locale="ko" resource={resource([stamp])} />);
  // Earned stamps sit under one chip per page; the list below is the stamps still to earn.
  expect(screen.getByRole("button", { name: /elina/ })).toHaveAttribute("aria-pressed", "true");
  const list = container.querySelector<HTMLElement>("ul[class*=recordGrid]:not([class*=earnedGrid])")!;
  const names = within(list).getAllByRole("listitem").map(item => item.querySelector("strong")?.textContent);
  expect(names).toEqual(["가입 기념", "첫 댓글", "출첵", "공유하기", "친구초대", "퀴즈", "LIVE 예약", "꾸준 출석"]);
  const items = within(list).getAllByRole("listitem");
  // Earned: opens the stamp; not earned: a link to where it is earned.
  expect(within(items[3]!).getByRole("link", { name: "받으러 가기" })).toHaveAttribute("href", "/passports?locale=ko");
  expect(within(items[5]!).getByRole("link", { name: "받으러 가기" })).toHaveAttribute("href", "/celebrities");
  expect(within(items[6]!).getByRole("link", { name: "받으러 가기" })).toHaveAttribute("href", "/celebrities");
  expect(within(items[7]!).getByRole("link", { name: "받으러 가기" })).toHaveAttribute("href", "/celebrities");
});

it("lists no extra stamp without a catalog, and a creator's page keeps its own short list", () => {
  render(<CommunityStampCollection locale="ko" resource={resource()} />);
  expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(5);
  dukjil.value = { catalog: { rules: { post: {} } } };
  const { container } = render(<CommunityStampCollection locale="ko" creator="elina" resource={resource()} />);
  expect(container.querySelector("[data-wide]")).toBeNull();
});

it("MY record shows one chip per page, opens on the page with the newest stamp, and lays out only that page's stamps as cards", () => {
  const older = { ...stamp, id: "22222222-2222-4222-8222-222222222222", kind: "quiz", celebritySlug: "areum", issuedAt: "2026-10-01T00:00:00.000Z" };
  const olderToo = { ...older, id: "33333333-3333-4333-8333-333333333333", kind: "reaction", issuedAt: "2026-10-02T00:00:00.000Z" };
  const { container } = render(<CommunityStampCollection locale="ko" resource={resource([older, stamp, olderToo])} creatorNames={{ elina: "엘리나", areum: "아렴" }} />);
  const chips = screen.getByRole("navigation", { name: "스탬프 기록" });
  expect(within(chips).getAllByRole("button").map(chip => chip.textContent)).toEqual(["엘리나1", "아렴2"]);
  expect(within(chips).getByRole("button", { name: /엘리나/ })).toHaveAttribute("aria-pressed", "true");
  const earned = () => container.querySelector<HTMLElement>("ul[class*=earnedGrid]")!;
  expect(within(earned()).getAllByRole("listitem")).toHaveLength(1);
  fireEvent.click(within(chips).getByRole("button", { name: /아렴/ }));
  expect(within(chips).getByRole("button", { name: /아렴/ })).toHaveAttribute("aria-pressed", "true");
  const cards = within(earned()).getAllByRole("listitem");
  expect(cards.map(card => card.querySelector("strong")?.textContent)).toEqual(["좋아요", "퀴즈"]);
  // The ICU build decides the exact short form ("26. 10. 02." on one Node, "26/10/02" on another), so compare with the same formatter.
  expect(cards[0]!.querySelector("time")).toHaveAttribute("datetime", "2026-10-02T00:00:00.000Z");
  expect(cards[0]!.querySelector("time")).toHaveTextContent(new Intl.DateTimeFormat("ko", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" }).format(new Date("2026-10-02T00:00:00.000Z")));
});

it("MY record shows no page chips before the first stamp", () => {
  render(<CommunityStampCollection locale="ko" resource={resource()} />);
  expect(screen.queryByRole("navigation", { name: "스탬프 기록" })).not.toBeInTheDocument();
});
