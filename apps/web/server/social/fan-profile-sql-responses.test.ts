import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ownedFanProfilePublicSchema, socialProfileCardSchema } from "@/features/fan-profile/domain";
import { groupPeopleSchema } from "@/server/group-members/domain";
import { createSocialHandlers } from "./routes";

/** Real SQL answers from supabase/tests/fan_profile_public_sql_responses.sql, run against a local database with 20261215040000 applied. */
const cases = JSON.parse(readFileSync(resolve(__dirname, "fan-profile-sql-responses.json"), "utf8")) as Record<string, unknown>;
const viewer = "7d000000-0000-4000-8000-000000000003", filled = "7d000000-0000-4000-8000-000000000001";
const profile = { profile: { id: filled, nickname: "n1", avatarUrl: "/images/avatars/star-pink.webp", accountLevel: { ruleVersion: "favorite-xp-sum-v1", status: "configured", tier: "Gold", xp: 72, progress: { policyVersion: 2 } } }, favorite: null, publicActivityCount: 0, activities: [], activityNextCursor: null, commonFavorites: [], relationship: { friendshipId: null, status: "none", celebritySlug: null }, dm: { conversationId: null, status: "none", canSend: false }, capabilities: { canRequestFriend: true, canRequestDm: true, canBlock: true }, isSelf: false };
const request = (path: string, init?: RequestInit) => new Request(`https://byus.test${path}`, { ...init, headers: { authorization: "Bearer valid", "content-type": "application/json" } });

describe("real SQL fan profile answers", () => {
  it.each(["card_page", "card_favorite", "card_empty", "card_empty_no_page", "card_anonymous"])("%s passes the card schema and reaches the profile reply", async name => {
    expect(socialProfileCardSchema.safeParse(cases[name]).error).toBeUndefined();
    const rpc = vi.fn(async (fn: string) => fn === "read_social_fan_profile" ? profile : fn === "read_social_profile_card" ? cases[name] : null);
    const response = await createSocialHandlers({ rpc, authorize: async () => ({ appUserId: viewer }) }).profile(request("/api?locale=ko&pageId=7d000000-0000-4000-8000-0000000000a1"), filled);
    expect(response.status).toBe(200);
    expect((await response.json()).card).toEqual(cases[name]);
  });
  it("keeps written fields to the fan who wrote them and empties the rest", () => {
    const card = (name: string) => socialProfileCardSchema.parse(cases[name]);
    expect(card("card_page")).toMatchObject({ links: ["https://www.instagram.com/answer_fan", "https://x.com/answer_fan"], bio: "무대 끝나면 후기 올려요", stats: { points: 40, stamps: 1, hearts: 2 } });
    expect(card("card_empty")).toMatchObject({ favorite: null, links: [], bio: null, stats: { points: 0, stamps: 0, hearts: 0 } });
    expect(card("card_empty_no_page")).toEqual({ favorite: null, links: [], bio: null, stats: null });
    expect(card("card_anonymous")).toEqual({ favorite: null, links: [], bio: null, stats: null });
  });
  it.each(["owned_empty", "owned_filled"])("%s passes the owned route", async name => {
    expect(ownedFanProfilePublicSchema.safeParse(cases[name]).error).toBeUndefined();
    const rpc = vi.fn(async () => cases[name]);
    const response = await createSocialHandlers({ rpc, authorize: async () => ({ appUserId: viewer }) }).readPublicFields(request("/api?locale=ko"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(cases[name]);
  });
  it("fan list rows carry the numbers but never the card-only fields or anything private", () => {
    const rows = groupPeopleSchema.parse(cases.rows_page).items;
    expect(rows.find(row => row.profileId === filled)).toMatchObject({ fanPoints: 40, stamps: 1, hearts: 2, favorite: { slug: "profile-answer-fixture" } });
    expect(JSON.stringify(cases.rows_page)).not.toMatch(/"links"|"bio"|example\.test|privy|wallet|amount|payment|email/i);
    expect(groupPeopleSchema.parse(cases.rows_anonymous).items.every(row => row.stamps === null && row.fanPoints === null && row.favorite === null)).toBe(true);
  });
});
