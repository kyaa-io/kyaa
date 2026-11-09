// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { tierChangesSchema, tierHistorySchema } from "../domain/tier-history";

const h = vi.hoisted(() => ({ authenticated: true, data: undefined as unknown, loading: false, urls: [] as (string | null)[], request: vi.fn(async () => ({ marked: 1 })), push: vi.fn(), path: "/my", retry: vi.fn() }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  useGroupRequest: () => ({ request: h.request, authenticated: h.authenticated, ready: true, ownerKey: "u:1" }),
  useGroupResource: (url: string | null, parse: (value: unknown) => unknown) => { h.urls.push(url); return { data: url && h.data !== undefined ? parse(h.data) : undefined, loading: Boolean(url) && h.loading, retry: h.retry }; },
}));
vi.mock("@/components/locale-provider", () => ({ useAppLocale: () => ({ locale: "ko" }) }));
vi.mock("next/navigation", () => ({ usePathname: () => h.path, useRouter: () => ({ push: h.push }) }));
import { TierCelebration } from "./tier-celebration";
import { TierHistoryList } from "./tier-history-list";
import { tierHistoryCopy } from "./tier-history-copy";

const passport = "30adc677-31ab-4e68-8b2a-4a6b2af1f1d4";
const rise = (id: string, previousTier: string, tier: string) => ({ id, passportId: passport, slug: "elina", name: "엘리나", previousTier, tier, occurredAt: "2026-11-08T08:28:00+09:00" });
beforeEach(() => { h.authenticated = true; h.data = undefined; h.loading = false; h.urls = []; h.request.mockClear(); h.push.mockClear(); h.path = "/my"; });
afterEach(cleanup);

it("celebrates a rise once, marks it seen at once and opens the passport history", async () => {
  h.data = { changes: [rise("10000000-0000-4000-8000-000000000001", "Bronze", "Silver")] };
  render(<TierCelebration />);
  const dialog = await screen.findByRole("dialog", { name: "실버 등급이 됐어요" });
  expect(dialog).toHaveTextContent("엘리나 패스포트");
  expect(dialog).toHaveTextContent("브론즈 → 실버");
  expect(h.request).toHaveBeenCalledWith("/api/me/tier-changes/seen", { method: "POST", body: JSON.stringify({ ids: ["10000000-0000-4000-8000-000000000001"] }) });
  fireEvent.click(screen.getByRole("button", { name: "등급 기록 보기" }));
  expect(h.push).toHaveBeenCalledWith(`/passports/${passport}?locale=ko#tier-history`);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(h.request).toHaveBeenCalledTimes(1);
});

it("adds the tier bonuses paid for the batch, and says nothing about a rise without one", async () => {
  h.data = { changes: [{ ...rise("10000000-0000-4000-8000-000000000001", "Bronze", "Silver"), bonusPoints: 30 }, { ...rise("10000000-0000-4000-8000-000000000002", "Silver", "Gold"), bonusPoints: 100 }] };
  render(<TierCelebration />);
  expect(await screen.findByRole("dialog", { name: "골드 등급이 됐어요" })).toHaveTextContent("달성 보너스 +130P");
  cleanup();
  h.data = { changes: [rise("10000000-0000-4000-8000-000000000003", "Bronze", "Silver")] };
  render(<TierCelebration />);
  expect(await screen.findByRole("dialog", { name: "실버 등급이 됐어요" })).not.toHaveTextContent("보너스");
});

it("shows the highest of several rises and marks all of them", async () => {
  h.data = { changes: [rise("10000000-0000-4000-8000-000000000001", "Bronze", "Silver"), rise("10000000-0000-4000-8000-000000000002", "Silver", "Gold")] };
  render(<TierCelebration />);
  expect(await screen.findByRole("dialog", { name: "골드 등급이 됐어요" })).toBeInTheDocument();
  expect(JSON.parse((h.request.mock.calls[0] as unknown as [string, { body: string }])[1].body).ids).toHaveLength(2);
});

it("reads nothing signed out or on admin screens, and shows nothing without a rise", () => {
  h.authenticated = false; render(<TierCelebration />); expect(h.urls.every(url => url === null)).toBe(true); cleanup();
  h.authenticated = true; h.path = "/admin/users"; h.urls = []; render(<TierCelebration />); expect(h.urls.every(url => url === null)).toBe(true); cleanup();
  h.path = "/my"; h.data = { changes: [] }; render(<TierCelebration />); expect(screen.queryByRole("dialog")).toBeNull();
});

it("lists the passport's tier changes newest first with what happened and when", () => {
  h.data = { items: [
    { id: "20000000-0000-4000-8000-000000000004", kind: "correction", previousTier: "Diamond", tier: "Gold", occurredAt: "2026-11-08T11:00:00+09:00" },
    { id: "20000000-0000-4000-8000-000000000003", kind: "up", previousTier: "Silver", tier: "Gold", occurredAt: "2026-11-08T08:28:00+09:00" },
    { id: "20000000-0000-4000-8000-000000000002", kind: "baseline", previousTier: "Bronze", tier: "Silver", occurredAt: "2026-11-07T10:00:00+09:00" },
    { id: "20000000-0000-4000-8000-000000000001", kind: "start", previousTier: null, tier: "Bronze", occurredAt: "2026-10-02T10:00:00+09:00" },
  ] };
  render(<TierHistoryList passportId={passport} locale="ko" />);
  const rows = screen.getAllByRole("listitem");
  expect(rows.map(row => row.getAttribute("data-tier-kind"))).toEqual(["correction", "up", "baseline", "start"]);
  // 20261215090000: the move to the hearts source is listed as a correction, not as a rise or a drop.
  expect(rows[0]).toHaveTextContent("등급 기준 정정다이아몬드 → 골드");
  expect(rows[1]).toHaveTextContent("등급 올라감실버 → 골드");
  expect(rows[2]).toHaveTextContent("기록 시작 때 등급실버");
  expect(rows[3]).toHaveTextContent("패스포트 발급브론즈");
  expect(h.urls).toContain(`/api/me/passports/${passport}/tier-history`);
});

it("keeps empty and failed states in place", () => {
  h.data = { items: [] }; render(<TierHistoryList passportId={passport} locale="ko" />); expect(screen.getByRole("status")).toHaveTextContent("아직 등급 기록이 없어요"); cleanup();
  h.data = undefined; render(<TierHistoryList passportId={passport} locale="ko" />); expect(screen.getByRole("alert")).toHaveTextContent("등급 기록을 불러오지 못했어요");
});

it("accepts the real route shapes and has every line in every locale", () => {
  // Shapes copied from the local route answers (GET /api/me/tier-changes, GET /api/me/passports/{id}/tier-history on 3871).
  expect(tierChangesSchema.parse({ changes: [] })).toEqual({ changes: [] });
  expect(tierHistorySchema.parse({ items: [{ id: "16bf368c-682e-4650-a632-dba8c6c9d70c", kind: "baseline", previousTier: "Bronze", tier: "Silver", occurredAt: "2026-11-08T09:42:19.100603+09:00" }, { id: "ce4c553f-a27e-46f1-a2dc-3a8d8da1e870", kind: "start", previousTier: null, tier: "Bronze", occurredAt: "2026-11-08T04:09:30.582548+09:00" }] }).items).toHaveLength(2);
  for (const locale of APP_LOCALES) { const c = tierHistoryCopy(locale); expect(Object.values(c).every(value => typeof value === "function" ? value("x") : value)).toBe(true); }
});
