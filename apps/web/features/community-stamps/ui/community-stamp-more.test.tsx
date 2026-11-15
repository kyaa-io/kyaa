import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const dukjil = vi.hoisted(() => ({ value: null as null | { catalog: { rules: Record<string, unknown> } } }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: true, user: { id: "owner" } }) }));
vi.mock("@/features/dukjil/ui/dukjil-provider", async (original) => ({ ...(await original<typeof import("@/features/dukjil/ui/dukjil-provider")>()), useDukjil: () => dukjil.value }));

import { CommunityStampCollection } from "./community-stamp-collection";

beforeEach(() => { dukjil.value = null; });
const resource = (stamps: unknown[] = []) => ({ state: { status: "ready" as const, data: { stamps, today: "2026-11-11" } }, retry: vi.fn(), replaceData: vi.fn(), refreshFailed: false }) as never;
const stamp = { id: "11111111-1111-4111-8111-111111111111", kind: "post", celebritySlug: "elina", issuedAt: "2026-11-01T00:00:00.000Z", mint: { status: "queued", txHash: null, tokenId: null } };

it("MY record lists earned stamps first, then the original five and only the stamps the active policy gives, each unearned kind with its own place to earn it", () => {
  dukjil.value = { catalog: { rules: { post: {}, quiz: {}, live_reserve: {}, checkin: {} } } };
  render(<CommunityStampCollection locale="ko" resource={resource([stamp])} />);
  const list = screen.getByRole("list");
  const names = within(list).getAllByRole("listitem").map(item => item.querySelector("strong")?.textContent);
  expect(names).toEqual(["글쓰기", "가입 기념", "첫 댓글", "출첵", "공유하기", "친구초대", "퀴즈", "LIVE 예약", "꾸준 출석"]);
  const items = within(list).getAllByRole("listitem");
  // Earned: opens the stamp; not earned: a link to where it is earned.
  expect(within(items[0]!).getByRole("button")).toBeInTheDocument();
  expect(within(items[4]!).getByRole("link", { name: "받으러 가기" })).toHaveAttribute("href", "/passports?locale=ko");
  expect(within(items[6]!).getByRole("link", { name: "받으러 가기" })).toHaveAttribute("href", "/celebrities");
  expect(within(items[7]!).getByRole("link", { name: "받으러 가기" })).toHaveAttribute("href", "/celebrities");
  expect(within(items[8]!).getByRole("link", { name: "받으러 가기" })).toHaveAttribute("href", "/celebrities");
});

it("lists no extra stamp without a catalog, and a creator's page keeps its own short list", () => {
  render(<CommunityStampCollection locale="ko" resource={resource()} />);
  expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(5);
  dukjil.value = { catalog: { rules: { post: {} } } };
  const { container } = render(<CommunityStampCollection locale="ko" creator="elina" resource={resource()} />);
  expect(container.querySelector("[data-wide]")).toBeNull();
});
