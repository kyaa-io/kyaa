import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createParticipationHandler } from "./routes";

const CH_A = "10000000-0000-4000-8000-00000000000a", CH_B = "10000000-0000-4000-8000-00000000000b", actor = "30000000-0000-4000-8000-000000000001";
const rpc = vi.fn(), authorize = vi.fn(), authorizeAdmin = vi.fn();
type Kind = "plain" | "other" | "own" | "admin";
const authorizeOperator = vi.fn(async (_authorization: string | null, _correlationId: string, celebrityId: string) => {
  const kind = who.current;
  if (kind === "plain" || (kind === "other" && celebrityId === CH_A)) throw new AuthError("CHANNEL_OPERATOR_REQUIRED", 403, "grant required");
  return { role: kind === "admin" ? "admin" as const : "operator" as const, appUserId: actor, allowlistId: kind === "admin" ? actor : null };
});
const who: { current: Kind } = { current: "own" };
const run = createParticipationHandler({ rpc, authorize, authorizeAdmin, authorizeOperator });
const payload = (celebrityId: string) => ({ celebrityId, kind: "concert", title: { ko: "공연", en: "Show" }, description: { ko: "소개", en: "About" }, startsAt: "2026-12-01T10:00:00Z", endsAt: "2026-12-01T12:00:00Z", timeZone: "Asia/Seoul", location: "Seoul", participationInstructions: "", officialSourceUrl: "https://example.test/a", status: "published" });
const post = (celebrityId: string) => new Request("https://byus.test/api", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify({ id: null, expectedRevision: 0, idempotencyKey: "40000000-0000-4000-8000-000000000001", payload: payload(celebrityId) }) });
const get = () => new Request("https://byus.test/api", { headers: { authorization: "Bearer t" } });

beforeEach(() => { rpc.mockReset(); authorizeOperator.mockClear(); who.current = "own"; rpc.mockResolvedValue({ items: [], nextCursor: null }); });

describe("operator schedule API boundary", () => {
  it("returns 403 for a general user and never reaches storage", async () => {
    who.current = "plain";
    expect((await run("operator-schedules", get(), { id: CH_A })).status).toBe(403);
    expect((await run("operator-schedules", post(CH_A), { id: CH_A })).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns 403 for an operator of another channel", async () => {
    who.current = "other";
    expect((await run("operator-schedules", get(), { id: CH_A })).status).toBe(403);
    expect((await run("operator-schedules", post(CH_A), { id: CH_A })).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("scopes the list to the requested channel for its own operator", async () => {
    expect((await run("operator-schedules", get(), { id: CH_A })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("fan_web_admin_list_schedules", expect.objectContaining({ p_actor_app_user_id: actor, p_actor_admin_allowlist_id: null, p_celebrity_id: CH_A }));
  });
  it("refuses a body that targets a different channel than the URL", async () => {
    expect((await run("operator-schedules", post(CH_B), { id: CH_A })).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("lets a full admin use the same route", async () => {
    who.current = "admin";
    expect((await run("operator-schedules", get(), { id: CH_B })).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("fan_web_admin_list_schedules", expect.objectContaining({ p_celebrity_id: CH_B }));
  });
  it("fails closed when no operator authorizer is wired", async () => {
    const closed = createParticipationHandler({ rpc, authorize, authorizeAdmin });
    expect((await closed("operator-schedules", get(), { id: CH_A })).status).toBe(403);
  });
});
