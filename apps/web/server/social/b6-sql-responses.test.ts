import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { adminReportSchema } from "@/features/fan-posts/domain/content";
import { createSocialHandlers } from "./routes";

/** Real SQL answers for B6. scripts/verify-b6-sql-responses.sh passes a fresh set from a disposable database and fails if the committed copy differs. */
const path = process.env.B6_SQL_RESPONSES ?? resolve(__dirname, "b6-sql-responses.json");
const cases = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
const viewer = "7d000000-0000-4000-8000-000000000001";
const ref = Buffer.from(JSON.stringify({ kind: "fan_post", id: "7d000000-0000-4000-8000-0000000000e1" })).toString("base64url");
const signedIn = (path: string, init: RequestInit = {}) => new Request(`https://byus.test${path}`, { ...init, headers: { authorization: "Bearer valid", "content-type": "application/json" } });
const signedOut = (path: string, init: RequestInit = {}) => new Request(`https://byus.test${path}`, { ...init, headers: { "content-type": "application/json" } });
const api = (answer: unknown) => createSocialHandlers({ rpc: vi.fn(async () => answer), authorize: async () => ({ appUserId: viewer }) });

describe("real SQL answers for B6", () => {
  it("covers every answer", () => {
    expect(Object.keys(cases).sort()).toEqual(["admin_reports", "blocks_closed", "by_ref_empty_user_signed_in", "by_ref_empty_user_signed_out", "by_ref_signed_in", "by_ref_signed_out", "conversations_decliner", "conversations_empty_user", "conversations_sender_after_decline", "reach_sender_after_decline", "refs_open", "report_replay", "return_ref"]);
  });
  it.each(["by_ref_signed_in", "by_ref_empty_user_signed_in"])("%s passes the signed-in by-ref route", async name => {
    const response = await api(cases[name]).profileByRef(signedIn(`/api/profiles/by-ref?ref=${ref}&locale=ko`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization");
    const body = await response.json();
    expect(typeof body.dm.canSend).toBe("boolean");
    expect(body.reach.dmState).toBeTypeOf("string");
  });
  it.each(["by_ref_signed_out", "by_ref_empty_user_signed_out"])("%s passes the signed-out route and holds no member data", async name => {
    const response = await api(cases[name]).profileByRef(signedOut(`/api/profiles/by-ref?ref=${ref}&locale=ko`));
    expect(response.status).toBe(200);
    const text = JSON.stringify(await response.json());
    for (const key of ["\"id\"", "relationship", "\"dm\"", "capabilities", "reach", "returnRef", "profileId", "isSelf"]) expect(text).not.toContain(key);
    expect(text).not.toContain("7d000000-0000-4000-8000-000000000002");
  });
  it("the empty user has a name to show in both languages", () => {
    expect((cases.by_ref_empty_user_signed_out as { profile: { nickname: string } }).profile.nickname).toBe("Fan");
    expect((cases.by_ref_empty_user_signed_in as { card: { favorite: unknown; stats: unknown } }).card).toEqual({ favorite: null, links: [], bio: null, stats: null });
  });
  it("issues a return ref, lists open refs and replays a report through the routes", async () => {
    expect((await api(cases.return_ref).issueReturnRef(signedOut("/api/profiles/return-ref", { method: "POST", body: JSON.stringify({ ref: { kind: "fan_post", id: "7d000000-0000-4000-8000-0000000000e1" } }) }))).status).toBe(200);
    expect((await api(cases.refs_open).refsOpen(signedOut("/api/profiles/refs-open", { method: "POST", body: JSON.stringify({ refs: [{ kind: "fan_post", id: "7d000000-0000-4000-8000-0000000000e1" }, { kind: "fan_post", id: "7d000000-0000-4000-8000-0000000000e9" }] }) }))).status).toBe(200);
    expect((await api(cases.report_replay).reportProfile(signedIn("/api/me/social/profiles/report", { method: "POST", body: JSON.stringify({ ref: { kind: "fan_post", id: "7d000000-0000-4000-8000-0000000000e1" }, reason: "spam", details: "응답 상세", requestId: "7d000000-0000-4000-8000-0000000000d2" }) }))).status).toBe(200);
  });
  it("lists a deleted account in the closed blocks list without its name or picture", async () => {
    const response = await api(cases.blocks_closed).listBlocks(signedIn("/api/me/social/blocks?fields=closed"));
    expect(response.status).toBe(200);
    expect((await response.json()).profiles).toEqual([expect.objectContaining({ closed: true, nickname: null, avatarUrl: null })]);
  });
  it("shows the sender a waiting request after a decline, and the decliner nothing", () => {
    const sender = (cases.conversations_sender_after_decline as { conversations: { status: string; retryAt: unknown }[] }).conversations;
    expect(sender).toHaveLength(1); expect(sender[0]).toMatchObject({ status: "outgoing_request", retryAt: null });
    expect((cases.conversations_decliner as { conversations: unknown[] }).conversations).toEqual([]);
    expect((cases.conversations_empty_user as { conversations: unknown[] }).conversations).toEqual([]);
    expect(cases.reach_sender_after_decline).toEqual({ dmState: "pending", artist: false });
  });
  it("puts the profile report through the admin report schema", () => {
    const items = (cases.admin_reports as { items: unknown[] }).items;
    expect(items).toHaveLength(1);
    const item = adminReportSchema.parse(items[0]);
    expect(item.targetType).toBe("user_profile");
    expect(item.target?.body).toContain("응답 소개");
  });
});
