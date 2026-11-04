import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const CH_A = "10000000-0000-4000-8000-00000000000a";
const CH_B = "10000000-0000-4000-8000-00000000000b";
const NOTICE = "20000000-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  identities: {} as Record<string, { privyUserId: string; verifiedEmail: string; googleLinked: boolean }>,
  grants: {} as Record<string, string[]>,
  save: vi.fn(), listAdmin: vi.fn(), noticeBelongsToChannel: vi.fn(), stateFn: vi.fn(), audit: vi.fn(), upsertSchedule: vi.fn(),
}));

vi.mock("../config/env", () => ({ loadServerEnv: () => ({ PRIVY_APP_ID: "x", PRIVY_APP_SECRET: "x", PRIVY_APP_ENVIRONMENT: "test", SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "x" }) }));
vi.mock("../auth/privy-node-verifier", () => ({
  createPrivyNodeAccessVerifier: () => ({ verify: async (token: string) => { const found = state.identities[token]; if (!found) throw new Error("bad token"); return found; } }),
}));
vi.mock("./supabase-channel-operator-repository", () => ({
  createSupabaseChannelOperatorRepository: () => ({
    findUserByPrivyId: async (id: string) => ({ id: `user:${id}`, privyUserId: id, verifiedEmail: `${id}@example.test`, status: "active" }),
    findActiveAdminByEmail: async (email: string) => (email === "admin@example.test" ? { id: "allow-1", email, role: "admin", active: true } : email.startsWith("view") ? { id: "allow-v", email, role: "viewer", active: true } : null),
    appendAuthorizationAudit: async () => undefined,
    listActiveChannelIds: async (userId: string) => state.grants[userId] ?? [],
    appendOperatorAudit: state.audit,
  }),
  listOperatorChannels: async () => [],
}));
vi.mock("../notice/notice-repository", () => ({
  createNoticeRepository: () => ({ save: state.save, listAdmin: state.listAdmin, noticeBelongsToChannel: state.noticeBelongsToChannel, state: state.stateFn, upload: vi.fn() }),
}));

import { GET, POST } from "../../app/api/operator/channels/[id]/notices/route";

const identity = (name: string, googleLinked = false) => ({ privyUserId: name, verifiedEmail: `${name}@example.test`, googleLinked });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (token: string | null, body?: unknown) => new Request("https://byus.test/api/operator/channels/x/notices", {
  method: body === undefined ? "GET" : "POST",
  headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "본문" }] }] };
const saveBody = { action: "save", slug: "hello", pinned: false, postType: "notice", visibility: "public", localizations: { ko: { title: "공지", body: doc }, en: { title: "Notice", body: doc } } };

beforeEach(() => {
  vi.clearAllMocks();
  state.identities = {
    plain: identity("plain"), opA: identity("opA"), opB: identity("opB"),
    admin: identity("admin", true), adminNoGoogle: identity("admin", false),
    viewA: identity("viewA", true), viewPlain: identity("viewPlain", true),
  };
  state.grants = { "user:opA": [CH_A], "user:opB": [CH_B], "user:viewA": [CH_A] };
  state.listAdmin.mockResolvedValue({ notices: [] });
  state.save.mockResolvedValue({ id: NOTICE });
  state.noticeBelongsToChannel.mockResolvedValue(true);
});

describe("channel operator notice API boundary", () => {
  it("rejects a request without a token before any storage access", async () => {
    const response = await GET(req(null), ctx(CH_A));
    expect(response.status).toBe(401);
    expect(state.listAdmin).not.toHaveBeenCalled();
  });

  it("returns 403 for a general user without a channel grant", async () => {
    for (const response of [await GET(req("plain"), ctx(CH_A)), await POST(req("plain", saveBody), ctx(CH_A))]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "FORBIDDEN" });
    }
    expect(state.listAdmin).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it("returns 403 for an operator of another channel", async () => {
    for (const response of [await GET(req("opB"), ctx(CH_A)), await POST(req("opB", saveBody), ctx(CH_A))]) expect(response.status).toBe(403);
    expect(state.listAdmin).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it("lets the operator of the channel read and write its own notices", async () => {
    const read = await GET(req("opA"), ctx(CH_A));
    expect(read.status).toBe(200);
    expect(state.listAdmin).toHaveBeenCalledWith(expect.objectContaining({ role: "operator", allowlistId: null, appUserId: "user:opA" }), CH_A);
    const write = await POST(req("opA", saveBody), ctx(CH_A));
    expect(write.status).toBe(200);
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ allowlistId: null }), expect.any(String), expect.objectContaining({ celebrityId: CH_A }));
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ actorAdminAllowlistId: null, summary: expect.objectContaining({ kind: "operator" }) }));
  });

  it("blocks a state change on a notice that belongs to another channel", async () => {
    state.noticeBelongsToChannel.mockResolvedValue(false);
    const response = await POST(req("opA", { action: "archive", id: NOTICE, expectedRevision: 1, reason: "archive reason long enough" }), ctx(CH_A));
    expect(response.status).toBe(403);
    expect(state.stateFn).not.toHaveBeenCalled();
  });

  it("lets a full admin act on any channel", async () => {
    for (const channel of [CH_A, CH_B]) {
      expect((await GET(req("admin"), ctx(channel))).status).toBe(200);
      expect((await POST(req("admin", saveBody), ctx(channel))).status).toBe(200);
    }
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ actorAdminAllowlistId: "allow-1", summary: expect.objectContaining({ kind: "admin" }) }));
  });

  it("treats an allowlisted admin without a linked Google account as a general user", async () => {
    expect((await GET(req("adminNoGoogle"), ctx(CH_A))).status).toBe(403);
  });

  it("treats a viewer with an active channel grant as an operator of that channel only", async () => {
    expect((await GET(req("viewA"), ctx(CH_A))).status).toBe(200);
    const write = await POST(req("viewA", saveBody), ctx(CH_A));
    expect(write.status).toBe(200);
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ role: "operator", allowlistId: null }), expect.any(String), expect.objectContaining({ celebrityId: CH_A }));
    state.save.mockClear();
    for (const response of [await GET(req("viewA"), ctx(CH_B)), await POST(req("viewA", saveBody), ctx(CH_B))]) expect(response.status).toBe(403);
    expect(state.save).not.toHaveBeenCalled();
  });

  it("keeps a viewer without a channel grant read-only", async () => {
    expect((await POST(req("viewPlain", saveBody), ctx(CH_A))).status).not.toBe(200);
    expect(state.save).not.toHaveBeenCalled();
  });
});
