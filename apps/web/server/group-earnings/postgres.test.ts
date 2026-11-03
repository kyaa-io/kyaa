import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createGroupEarningsHandler } from "./routes";
vi.mock("server-only", () => ({}));

// Opt-in: synthetic fixtures are rolled back on a dedicated Unix-socket cluster.
const socket = process.env.KYAA_GROUP_EARNINGS_TEST_SOCKET;
const require = createRequire(import.meta.url);
interface TestClient {
  connect(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}
const { Client } = require("pg") as { Client: new (config: object) => TestClient };
describe.skipIf(!socket)("group earnings HTTP handler with real PostgreSQL", () => {
  let db: TestClient;
  let actor: string, other: string, page: string, otherPage: string, submission: string, second: string;
  const authorize = vi.fn();
  const handler = createGroupEarningsHandler({
    authorize,
    async rpc(name, args) {
      const detail = name === "read_owned_group_earning";
      if (!detail && name !== "read_owned_group_earnings") throw new Error("Unexpected RPC");
      const result = await db.query(detail
        ? "select public.read_owned_group_earning($1,$2,$3) as result"
        : "select public.read_owned_group_earnings($1,$2,$3,$4) as result",
      detail ? [args.p_actor, args.p_page_id, args.p_entry_key] : [args.p_actor, args.p_page_id, args.p_limit, args.p_cursor]);
      return result.rows[0].result;
    },
  });
  const request = (query = "") => new Request(`https://fixture.test/api/groups/${page}/earnings${query}`, { headers: { authorization: "Bearer local-fixture" } });
  beforeAll(async () => {
    if (!socket || !/\/earnings-[^/]+\/socket$/.test(socket)) throw new Error("Dedicated earnings Unix socket required");
    db = new Client({ host: socket, port: Number(process.env.KYAA_GROUP_EARNINGS_TEST_PORT ?? 55583), database: "byus_clean", user: process.env.USER });
    await db.connect();
    const { rows } = await db.query("select current_database() as db, inet_server_addr() as address, current_setting('data_directory') as directory");
    expect(rows[0]).toEqual({ db: "byus_clean", address: null, directory: join(dirname(socket), "data") });
  });
  beforeEach(async () => {
    [actor, other, page, otherPage, submission, second] = Array.from({ length: 6 }, () => randomUUID());
    authorize.mockReset().mockResolvedValue({ appUserId: actor });
    await db.query("begin");
    await db.query("insert into public.app_users(id,privy_user_id,verified_email) select x,'earnings-api-'||x,x||'@example.test' from unnest($1::uuid[])x", [[actor, other]]);
    await db.query("insert into public.group_pages(id,kind,name) select x,'hobby','API fixture' from unnest($1::uuid[])x", [[page, otherPage]]);
    await db.query("insert into public.group_missions(id,page_id,title,instructions,state) values($1,$3,'API pending','Private instructions','published'),($2,$3,'Private hidden title','Private instructions','draft')", [submission, second, page]);
    await db.query("insert into public.group_mission_submissions(id,mission_id,app_user_id,body,status,created_at) values($1,$1,$3,'Private body','pending','2026-11-01T00:00:00.123456Z'),($2,$2,$3,'Private body','completed','2026-11-01T00:00:00.123456Z')", [submission, second, actor]);
    await db.query("set local role service_role");
  });
  afterEach(async () => { await db.query("rollback"); });
  afterAll(async () => { await db?.end(); });

  it("serializes real nullable records and reads an owned detail through the DTO", async () => {
    const response = await handler(request(), { id: page });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries.find((e: { entryKey: string }) => e.entryKey === `mission:${submission}`)).toMatchObject({ status: "pending", originalAmount: null, correctionAmount: null, netAmount: null, processedAt: null });
    const detail = await handler(request(), { id: page, entryKey: `mission:${second}` });
    expect(detail.status).toBe(200);
    expect((await detail.json()).entry).toMatchObject({ status: "no_reward", title: null, activityHref: null, originalAmount: 0, correctionAmount: null, netAmount: 0 });
    expect(JSON.stringify(body)).not.toContain("Private");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("round trips SQL microsecond cursor without duplicate or omitted entries", async () => {
    const first = await (await handler(request("?limit=1"), { id: page })).json();
    expect(first.nextCursor).toEqual(expect.any(String));
    const last = await handler(request(`?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`), { id: page });
    expect(last.status).toBe(200);
    const body = await last.json();
    expect(body.nextCursor).toBeNull();
    expect(new Set([first.entries[0].entryKey, body.entries[0].entryKey])).toEqual(new Set([`mission:${submission}`, `mission:${second}`]));
  });
  it.each(["owner", "page"])("rejects cross-%s cursor at the SQL boundary", async scope => {
    const first = await (await handler(request("?limit=1"), { id: page })).json();
    if (scope === "owner") authorize.mockResolvedValue({ appUserId: other });
    const response = await handler(request(`?cursor=${encodeURIComponent(first.nextCursor)}`), { id: scope === "page" ? otherPage : page });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "GROUP_EARNINGS_INVALID" } });
  });
  it.each(["owner", "page"])("hides cross-%s detail existence", async scope => {
    if (scope === "owner") authorize.mockResolvedValue({ appUserId: other });
    const response = await handler(request(), { id: scope === "page" ? otherPage : page, entryKey: `mission:${submission}` });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "GROUP_EARNINGS_NOT_FOUND" } });
  });
  it("maps a positive reward missing its ledger to 503, never a zero row", async () => {
    await db.query("reset role");
    await db.query("update public.group_mission_submissions set reward_points=10 where id=$1", [second]);
    await db.query("set local role service_role");
    const response = await handler(request(), { id: page });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "GROUP_EARNINGS_UNAVAILABLE" } });
  });
  it("does not query PostgreSQL on rejected authentication", async () => {
    authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Private token failure"));
    const response = await handler(request(), { id: page });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "UNAUTHENTICATED" } });
  });
});
