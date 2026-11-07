import { afterEach, expect, it, vi } from "vitest";
import { createSupabaseRaffleResultRepository } from "./raffle-result-repository";

vi.mock("server-only", () => ({}));
vi.mock("@/server/data/client", () => ({ createClient: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

const good = {
  benefitId: "10000000-0000-4000-8000-000000000001", campaignId: "10000000-0000-4000-8000-000000000002", title: "t", imageUrl: null,
  benefitHref: "/benefits/10000000-0000-4000-8000-000000000001", state: "pending", enteredTickets: 1, entryClosesAt: null, publishedAt: null,
  winnerId: null, method: "digital", fulfillmentStatus: null, claimDisposition: "active", recipientDeadlineAt: null, recipientSubmitted: false,
  recipientEditable: false, carrier: null, trackingNumber: null, policy: null,
};
const repo = (data: unknown, error: unknown = null) => createSupabaseRaffleResultRepository({ url: "u", serviceRoleKey: "k" }, { rpc: vi.fn().mockResolvedValue({ data, error }) } as never);
const input = { appUserId: "u", locale: "ko" as const, cursor: null };

it("keeps the valid rows when one row is refused and logs only its ids and paths", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const list = await repo({ items: [good, { ...good, title: "", benefitId: "bad" }], nextCursor: null }).list(input);
  expect(list.items).toHaveLength(1);
  expect(log).toHaveBeenCalledWith("RAFFLE_RESULT_ROW_REFUSED", expect.objectContaining({ benefitId: "bad" }));
  expect(JSON.stringify(log.mock.calls)).not.toContain('"title":""');
});

it("still fails a response that is not a list, and logs a failed read by its code", async () => {
  await expect(repo("nope").list(input)).rejects.toThrow();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(repo(null, { code: "42501" }).list(input)).rejects.toThrow("RAFFLE_RESULT_UNAVAILABLE");
  expect(log).toHaveBeenCalledWith("RAFFLE_RESULT_LIST_FAILED", { code: "42501" });
});
