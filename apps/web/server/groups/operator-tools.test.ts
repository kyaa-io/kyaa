import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { csvCell, type GroupOperatorMember } from "@/features/groups/domain/operator-tools";
import { createGroupHandler } from "./routes";

const me = "10000000-0000-4000-8000-000000000001";
const page = "10000000-0000-4000-8000-000000000002";
const member: GroupOperatorMember = { profileId: "10000000-0000-4000-8000-000000000003", nickname: "연락010", avatarUrl: "/images/avatars/star-pink.webp", role: "member", joinedAt: "2026-11-08T15:30:00+00:00", jjinfan: true, hearts: 3, missionCount: 2, lastActiveAt: null };
const list = { total: 1, jjinfanTotal: 1, items: [member], nextCursor: null };
function setup(result: unknown = list) {
  const rpc = vi.fn().mockResolvedValue(result);
  const authorize = vi.fn(async (auth: string | null) => { if (auth !== "Bearer valid") throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Login"); return { appUserId: me }; });
  const authorizeAdmin = vi.fn();
  return { rpc, handler: createGroupHandler({ rpc, authorize, authorizeAdmin } as never) };
}
const get = (path: string, auth: string | null = "Bearer valid") => new Request(`https://kyaa.test${path}`, { headers: auth ? { authorization: auth } : {} });
const post = (body: unknown) => new Request("https://kyaa.test/api", { method: "POST", headers: { authorization: "Bearer valid", "content-type": "application/json" }, body: JSON.stringify(body) });

describe("B8 operator members", () => {
  it("fixes the actor from authorization and forwards bounded filters", async () => {
    const s = setup();
    const r = await s.handler("operator-members", get("/api?search=%20연락%20&jjinfan=yes&limit=50"), { id: page });
    expect(r.status).toBe(200);
    expect(s.rpc).toHaveBeenCalledWith("groups_dispatch", { p_operation: "operator-members", p_actor: me, p_page_id: page, p_item_id: null, p_input: { search: "연락", jjinfan: "yes", cursor: undefined, limit: 50 }, p_admin_id: null });
    expect(await r.json()).toEqual(list);
  });
  it.each(["?limit=51", "?limit=0", `?search=${"가".repeat(17)}`, "?search=a%01", "?jjinfan=maybe", "?cursor=x", "?search=a&search=b"])("Q1 rejects %s before the database", async (query) => {
    const s = setup();
    expect((await s.handler("operator-members", get(`/api${query}`), { id: page })).status).toBe(400);
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("U1 requires sign-in", async () => { const s = setup(); expect((await s.handler("operator-members", get("/api", null), { id: page })).status).toBe(401); expect(s.rpc).not.toHaveBeenCalled(); });
  it.each([["GROUPS_FORBIDDEN", 403], ["GROUPS_NOT_FOUND", 404], ["GROUPS_RATE_LIMITED", 429]])("maps %s", async (code, status) => {
    const s = setup(); s.rpc.mockRejectedValue(new Error(code));
    const r = await s.handler("operator-members", get("/api"), { id: page });
    expect(r.status).toBe(status); expect(await r.json()).toEqual({ error: { code } });
  });
  it.each(["answer", "email", "phone", "verifiedEmail", "realName"])("P1 refuses a response that carries %s and does not pass it on", async (key) => {
    const s = setup({ ...list, items: [{ ...member, [key]: "홍길동 010-1234-5678" }] });
    const r = await s.handler("operator-members", get("/api"), { id: page });
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("010-1234-5678");
  });
});

describe("B8 member CSV", () => {
  const exportResult = (items = [member], fan = true) => ({ fan, rowCount: items.length, items });
  it("P3·P5·U6: BOM, header without answer or contact columns, nickname kept, KST date", async () => {
    const s = setup(exportResult());
    const r = await s.handler("operator-members-export", get("/api?locale=ko"), { id: page });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("content-disposition")).toContain("attachment");
    const bytes = new Uint8Array(await r.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = (await r.text()).replace(/^﻿/, "");
    const [head, row] = text.split("\r\n");
    expect(head).toBe("닉네임,가입일,찐팬·하트,미션 참여,마지막 활동");
    expect(head).not.toMatch(/답변|전화|이메일|실명/);
    expect(row).toBe("연락010,2026-11-09,3,2,");
    expect(s.rpc).toHaveBeenCalledWith("groups_dispatch", expect.objectContaining({ p_operation: "operator-members-export", p_actor: me, p_input: { search: "", jjinfan: "all" } }));
  });
  it("U3: a group page without a creator has four columns", async () => {
    const s = setup(exportResult([{ ...member, jjinfan: null, hearts: null }], false));
    const text = await (await s.handler("operator-members-export", get("/api?locale=en"), { id: page })).text();
    expect(text.replace(/^﻿/, "").split("\r\n")[0].split(",")).toHaveLength(4);
  });
  it("U6: formula-looking cells start with ' and commas/quotes/newlines are quoted", async () => {
    const s = setup(exportResult([{ ...member, nickname: '=HYPERLINK("x")' }, { ...member, nickname: "a,b" }, { ...member, nickname: "-1" }, { ...member, nickname: "@x" }]));
    const rows = (await (await s.handler("operator-members-export", get("/api"), { id: page })).text()).split("\r\n");
    expect(rows[1].startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
    expect(rows[2].startsWith('"a,b"')).toBe(true);
    expect(rows[3].startsWith("'-1")).toBe(true);
    expect(rows[4].startsWith("'@x")).toBe(true);
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("\tx")).toBe("'\tx");
  });
  it.each([["GROUPS_RATE_LIMITED", 429], ["GROUPS_EXPORT_TOO_LARGE", 413], ["GROUPS_FORBIDDEN", 403]])("maps %s", async (code, status) => {
    const s = setup(); s.rpc.mockRejectedValue(new Error(code));
    expect((await s.handler("operator-members-export", get("/api"), { id: page })).status).toBe(status);
  });
  it("an over-limit export answered as a value (record kept in SQL) is a 413", async () => {
    const s = setup({ error: "GROUPS_EXPORT_TOO_LARGE" });
    const r = await s.handler("operator-members-export", get("/api"), { id: page });
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: { code: "GROUPS_EXPORT_TOO_LARGE" } });
  });
  it("rejects an unknown locale", async () => { const s = setup(); expect((await s.handler("operator-members-export", get("/api?locale=xx"), { id: page })).status).toBe(400); });
});

describe("B8 mission stats and notice broadcast", () => {
  const stats = { from: "2026-11-01", to: "2026-11-07", attendance: null, items: [{ missionId: page, title: "사진", state: "published", submissionKind: "photo", participants: 2, pending: 1, approved: 1, rejected: 1 }] };
  it("forwards KST dates to the activities dispatcher", async () => {
    const s = setup(stats);
    const r = await s.handler("mission-stats", get("/api?from=2026-11-01&to=2026-11-07"), { id: page });
    expect(r.status).toBe(200);
    expect(s.rpc).toHaveBeenCalledWith("group_activities_dispatch", { p_operation: "mission-stats", p_actor: me, p_page_id: page, p_item_id: null, p_sub_id: null, p_input: { from: "2026-11-01", to: "2026-11-07" }, p_admin_id: null });
  });
  it("rejects a malformed date", async () => { const s = setup(stats); expect((await s.handler("mission-stats", get("/api?from=11/01"), { id: page })).status).toBe(400); expect(s.rpc).not.toHaveBeenCalled(); });
  it("treats an unlisted field as unavailable", async () => { const s = setup({ ...stats, memberIds: [me] }); expect((await s.handler("mission-stats", get("/api"), { id: page })).status).toBe(503); });
  it("reads the remaining broadcast for staff", async () => {
    const s = setup({ noticeBroadcastEnabled: true, noticeBroadcastRemainingToday: 1 });
    const r = await s.handler("notice-broadcast-status", get("/api"), { id: page });
    expect(await r.json()).toEqual({ noticeBroadcastEnabled: true, noticeBroadcastRemainingToday: 1 });
    expect(s.rpc).toHaveBeenCalledWith("groups_content_dispatch", expect.objectContaining({ p_operation: "notice-broadcast-status", p_actor: me, p_page_id: page }));
  });
  it("forwards notifyMembers on a new notice only", async () => {
    const s = setup({ id: page, title: "공지", body: "본문" });
    const requestId = "10000000-0000-4000-8000-000000000009";
    expect((await s.handler("post", post({ title: "공지", body: "본문", visibility: "members", category: "notice", notifyMembers: true, requestId }), { id: page })).status).toBe(200);
    expect(s.rpc).toHaveBeenCalledWith("groups_content_dispatch", expect.objectContaining({ p_operation: "post", p_input: expect.objectContaining({ notifyMembers: true, category: "notice" }) }));
    s.rpc.mockClear();
    expect((await s.handler("post", post({ title: "글", body: "본문", visibility: "members", category: "free", notifyMembers: true, requestId }), { id: page })).status).toBe(400);
    expect((await s.handler("post-edit", post({ title: "공지", body: "본문", visibility: "members", category: "notice", notifyMembers: true, requestId }), { id: page, itemId: page })).status).toBe(400);
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("N3: the second broadcast of the day is a 409 with its reason", async () => {
    const s = setup(); s.rpc.mockRejectedValue(new Error("GROUPS_RATE_LIMITED:notice_broadcast"));
    const r = await s.handler("post", post({ title: "공지", body: "본문", visibility: "members", category: "notice", notifyMembers: true, requestId: page }), { id: page });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: { code: "GROUPS_RATE_LIMITED", reason: "notice_broadcast" } });
  });
});

describe("B8 migrations", () => {
  const root = join(__dirname, "../../../../supabase");
  const files = readdirSync(join(root, "migrations")).filter(name => name >= "20261219080000" && name < "20261219090000");
  it("has the five step-1 files, each with a rollback", () => {
    expect(files).toEqual(["20261219080000_group_operator_access.sql", "20261219081000_group_operator_members.sql", "20261219082000_group_mission_stats.sql", "20261219083000_group_notice_kind.sql", "20261219084000_group_notice_broadcast.sql"]);
    for (const name of files) expect(readdirSync(join(root, "rollback"))).toContain(name);
  });
  it("never reads auth.uid() and grants nothing to anon or authenticated", () => {
    for (const name of files) {
      const sql = readFileSync(join(root, "migrations", name), "utf8");
      expect(sql).not.toMatch(/auth\.uid\(\)/);
      expect(sql).not.toMatch(/grant[^;]*\bto\s+(anon|authenticated|public)\b/i);
    }
  });
  it("adds no membership fee, billing, settlement or payout objects (step 2 is not built)", () => {
    for (const name of files) expect(readFileSync(join(root, "migrations", name), "utf8")).not.toMatch(/membership_plans|membership_payments|billing|settlement|payout|identity_verif/i);
  });
});
