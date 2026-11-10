import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseGiftRepository } from "./gift-repository";

vi.mock("server-only", () => ({}));
// Output of public.get_owned_gifts(...) read from the local database for a fan who won a pickup prize.
const sqlOutput = JSON.parse(readFileSync(resolve(__dirname, "fixtures/get_owned_gifts.sql-output.json"), "utf8")) as unknown[];
const owner = "00000000-0000-4000-8000-0000000000aa";
const db = (data: unknown, error: unknown = null) => ({ rpc: vi.fn().mockResolvedValue({ data, error }) }) as never;

describe("gift repository", () => {
  it("passes the real SQL projection through the gift schema", async () => {
    const gifts = await createSupabaseGiftRepository({ url: undefined, serviceRoleKey: undefined }, db(sqlOutput)).list({ appUserId: owner, locale: "ko" });
    expect(gifts).toHaveLength(1);
    expect(gifts[0]).toMatchObject({ unread: expect.any(Boolean), result: { state: "won", fulfillmentStatus: "information_required", method: "on_site_pickup" } });
  });
  it("leaves out a row that is no longer a win instead of showing it, and keeps the others", async () => {
    const lost = { ...(sqlOutput[0] as object), rewardResultId: "5ee1f700-0000-4000-8000-0000000000ff", result: { ...(sqlOutput[0] as { result: object }).result, state: "not_won", winnerId: null, fulfillmentStatus: null, recipientEditable: false } };
    const gifts = await createSupabaseGiftRepository({ url: undefined, serviceRoleKey: undefined }, db([lost, ...sqlOutput])).list({ appUserId: owner, locale: "ko" });
    expect(gifts.map((gift) => gift.rewardResultId)).toEqual([(sqlOutput[0] as { rewardResultId: string }).rewardResultId]);
  });
  it("treats a database error as unavailable, not as an empty list", async () => {
    await expect(createSupabaseGiftRepository({ url: undefined, serviceRoleKey: undefined }, db(null, { code: "x" })).list({ appUserId: owner, locale: "ko" })).rejects.toThrow("GIFTS_UNAVAILABLE");
  });
  it("returns null for an unknown gift and for a read of someone else's gift", async () => {
    const repository = createSupabaseGiftRepository({ url: undefined, serviceRoleKey: undefined }, db(null));
    expect(await repository.find({ appUserId: owner, rewardResultId: "5ee1f700-0000-4000-8000-000000000001", locale: "ko" })).toBeNull();
    expect(await repository.markRead({ appUserId: owner, rewardResultId: "5ee1f700-0000-4000-8000-000000000001" })).toBeNull();
  });
  it("parses the unread count with the single unread id", async () => {
    const repository = createSupabaseGiftRepository({ url: undefined, serviceRoleKey: undefined }, db({ unreadCount: 1, singleUnreadId: "5ee1f700-0000-4000-8000-000000000001" }));
    expect(await repository.unread({ appUserId: owner })).toEqual({ unreadCount: 1, singleUnreadId: "5ee1f700-0000-4000-8000-000000000001" });
  });
});
