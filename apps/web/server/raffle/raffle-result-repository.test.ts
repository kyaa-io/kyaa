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

const won = { ...good, state: "won", publishedAt: "2026-11-01T00:00:00+09:00", winnerId: "10000000-0000-4000-8000-000000000003", fulfillmentStatus: "information_required" };
const refusedImages = ["https://cdn.example.com/a@2x.webp", "http://cdn.example.com/a.webp", "https://CDN.example.com/a.webp", "https://cdn.example.com"];

it.each(refusedImages)("keeps a won row and clears only an image the result schema refuses: %s", async (imageUrl) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const list = await repo({ items: [{ ...won, imageUrl }], nextCursor: null }).list(input);
  expect(list.items).toHaveLength(1);
  expect(list.items[0]).toMatchObject({ state: "won", imageUrl: null, winnerId: won.winnerId });
});

it.each(refusedImages)("opens the won detail with the same image cleared: %s", async (imageUrl) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const found = await repo({ ...won, imageUrl }).find({ appUserId: "u", benefitId: good.benefitId, locale: "ko" });
  expect(found).toMatchObject({ state: "won", imageUrl: null });
});

it("answers with a failure when a won row is refused for another reason, in the list and the detail", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const broken = { ...won, fulfillmentStatus: null };
  await expect(repo({ items: [good, broken], nextCursor: null }).list(input)).rejects.toThrow();
  await expect(repo(broken).find({ appUserId: "u", benefitId: good.benefitId, locale: "ko" })).rejects.toThrow();
});

it("keeps nextCursor when every row of a page is left out", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const list = await repo({ items: [{ ...good, title: "" }], nextCursor: "abc" }).list(input);
  expect(list).toEqual({ items: [], nextCursor: "abc" });
});
