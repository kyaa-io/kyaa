import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createSocialHandlers, socialProfileSchema } from "./routes";

/** Real SQL answers. scripts/verify-social-profile-sql.sh passes a fresh set from a disposable database and fails if the committed copy differs. */
const path = process.env.SOCIAL_PROFILE_SQL_RESPONSES ?? resolve(__dirname, "profile-sql-responses.json");
const cases = JSON.parse(readFileSync(path, "utf8")) as Record<string, { profile: { profile: { id: string } }; reach: unknown }>;
const me = "7c000000-0000-4000-8000-000000000001";
const request = () => new Request("https://byus.test/api", { headers: { authorization: "Bearer valid" } });

describe("real SQL profile answers", () => {
  it("covers every relationship", () => {
    expect(Object.keys(cases).sort()).toEqual(["accepted_conversation", "friend_no_conversation", "nothing_in_common", "same_page_no_setting", "saved_friends_only", "saved_off", "self", "waiting_request"]);
  });
  it.each(Object.keys(cases))("%s passes the schema and the real route", async name => {
    const { profile, reach } = cases[name];
    expect(socialProfileSchema.safeParse(profile).error).toBeUndefined();
    const rpc = vi.fn(async (fn: string) => fn === "read_social_fan_profile" ? profile : reach);
    const api = createSocialHandlers({ rpc, authorize: async () => ({ appUserId: me }) });
    const response = await api.profile(request(), profile.profile.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.dm.canSend).toBe("boolean");
    expect(body.reach).toEqual(reach);
  });
  it("says what each relationship should", () => {
    const state = (name: string) => (cases[name].reach as { dmState: string }).dmState;
    const can = (name: string) => (cases[name].profile as unknown as { dm: { canSend: boolean }; capabilities: { canRequestDm: boolean } });
    expect(Object.fromEntries(Object.keys(cases).map(name => [name, state(name)]))).toEqual({ self: "self", same_page_no_setting: "available", nothing_in_common: "not_eligible", friend_no_conversation: "available", saved_friends_only: "friends_only", saved_off: "recipient_off", accepted_conversation: "open", waiting_request: "pending" });
    expect(can("same_page_no_setting").dm.canSend).toBe(false); expect(can("same_page_no_setting").capabilities.canRequestDm).toBe(true);
    expect(can("friend_no_conversation").dm.canSend).toBe(false);
    expect(can("accepted_conversation").dm.canSend).toBe(true);
    expect(can("waiting_request").dm.canSend).toBe(false);
  });
});
