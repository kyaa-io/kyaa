import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const active = { version: 1, rules: { checkin: { points: 2, streakBonus: 10, streakEvery: 7, stamp: "daily_checkin" } }, missionBook: {} };
const h = vi.hoisted(() => ({ post: vi.fn(), auth: true, catalog: undefined as unknown, today: undefined as unknown, failure: undefined as unknown }));
vi.mock("@/features/groups/ui/use-group-resource", () => {
  class GroupRequestError extends Error { constructor(public status: number, public code?: string) { super(code); } }
  const request = (url: string, init?: { method?: string }) => url.includes("/api/dukjil/catalog") ? (h.catalog instanceof Error ? Promise.reject(h.catalog) : Promise.resolve(h.catalog)) : h.post(url, init);
  return {
    GroupRequestError,
    useGroupRequest: () => ({ request, authenticated: h.auth, ready: true, ownerKey: "u" }),
    useGroupResource: (url: string | null) => ({ data: url ? h.today : undefined, failure: h.failure, loading: false, retry: vi.fn() }),
  };
});
import { GroupRequestError } from "@/features/groups/ui/use-group-resource";
import { DukjilProvider, resetDukjilCatalogCache } from "./dukjil-provider";
import { CreatorAttendanceDialog } from "./creator-attendance-dialog";

const today = (attendance: unknown, hasPassport: boolean | null = true) => ({ kstDate: "2026-11-05", policyActive: true, totalPoints: 0, actions: {}, attendance, hasPassport });
const open = { attendedToday: false, streak: 0, nextBonusIn: 7 };
const ui = (hasPassport?: boolean) => render(<DukjilProvider slug="aespa" locale="ko" hasPassport={hasPassport}><CreatorAttendanceDialog open onClose={() => {}} reviewHref="/aespa/passport" /></DukjilProvider>);

beforeEach(() => { resetDukjilCatalogCache(); h.post.mockReset(); h.auth = true; h.catalog = active; h.today = today(open); h.failure = undefined; });

it("claims with the catalog number and settles to done", async () => {
  h.post.mockResolvedValue({ points: 2, streak: 1, bonusPoints: 0, stampId: "3f2b8a52-6c1d-4e7a-9b0a-1d2c3e4f5a6b", attendanceDate: "2026-11-05", replayed: false });
  ui(true);
  fireEvent.click(await screen.findByRole("button", { name: /2/ }));
  await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
  expect(h.post.mock.calls[0][0]).toBe("/api/me/attendance/aespa");
});
it("shows the already-attended state from the server", async () => {
  h.today = today({ attendedToday: true, streak: 3, nextBonusIn: 4 });
  ui(true);
  expect(await screen.findByRole("status")).toBeInTheDocument();
});
it("does not offer a claim while today is still unknown", async () => {
  h.today = undefined;
  ui(true);
  const button = await screen.findByRole("button", { name: /2/ });
  expect(button).toBeDisabled();
  expect(h.post).not.toHaveBeenCalled();
});
it("sends a passport-less fan to the review instead of a claim button", async () => {
  h.today = today(open, false);
  ui();
  expect(await screen.findByRole("link", { name: /.+/ })).toHaveAttribute("href", "/aespa/passport");
  expect(screen.queryByRole("button", { name: /\d+P/ })).toBeNull();
});
it.each(["DUKJIL_DAILY_LIMIT", "POLICY_INACTIVE", "DUKJIL_UNAVAILABLE"])("maps %s to an alert", async code => {
  h.post.mockRejectedValue(new GroupRequestError(429, code));
  ui(true);
  fireEvent.click(await screen.findByRole("button", { name: /2/ }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
});
it("shows a load error when today fails the schema or the request", async () => {
  h.today = undefined;
  h.failure = new GroupRequestError(503, "X");
  ui(true);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
});
it("asks to log in when signed out", async () => {
  h.auth = false;
  ui();
  await waitFor(() => expect(screen.getAllByRole("link").some(l => l.getAttribute("href")?.startsWith("/login"))).toBe(true));
});
it.each([
  ["an empty catalog", { version: null, rules: {}, missionBook: null }],
  ["a failed catalog", new Error("down")],
])("renders nothing for %s", async (_name, catalog) => {
  h.catalog = catalog;
  const { container } = ui(true);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(container.textContent).toBe("");
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("renders nothing when today says the policy is inactive", async () => {
  h.today = { kstDate: "2026-11-05", policyActive: false };
  ui(true);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("never prints the legacy fixed wording (10P check-in, 20P weekly bonus) under an active policy", async () => {
  ui(true);
  await screen.findByRole("dialog");
  expect(document.body.textContent).not.toMatch(/출석하고 10P|7일 연속 출석마다 20P|20P 추가/);
  expect(document.body.textContent).toContain("+10P"); // the catalog's own streakBonus, not the fixed legacy line
});
