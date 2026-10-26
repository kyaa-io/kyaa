import { createServer } from "node:http";
import { NodeNextRequest } from "next/dist/server/base-http/node";
import { NextRequestAdapter } from "next/dist/server/web/spec-extension/adapters/next-request";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "../../features/auth/domain/auth-errors";
import { createGggiEventHandlers } from "./gggi-event-routes";
const id = "11111111-1111-4111-8111-111111111111";
const enteredAt = "2026-10-26T00:00:00Z";
const guest = { eventKey: "gggi-goods-2026", status: "open", participation: null };
function setup() {
  const rpc = vi.fn().mockResolvedValue(guest);
  const authorize = vi.fn(async () => ({ appUserId: id }));
  const authorizeAdmin = vi.fn(async () => ({ appUserId: id, allowlistId: id, email: "admin@example.test", role: "viewer" as const }));
  return { rpc, authorize, authorizeAdmin, api: createGggiEventHandlers({ rpc, authorize, authorizeAdmin }) };
}
const request = (method = "GET", query = "") => new Request(`https://byus.kr/api${query}`, { method, headers: { authorization: "Bearer owner" } });
describe("GGGI event entry", () => {
  it("returns a private uncached public configuration without owner state", async () => {
    const { api, rpc, authorize } = setup();
    const response = await api.event(new Request("https://byus.kr/api"), "gggi");
    expect(await response.json()).toEqual(guest);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(authorize).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_gggi_event", { p_app_user_id: null });
  });
  it.each(["GET", "POST"])("uses only canonical owner for %s", async method => {
    const { api, rpc } = setup();
    const value = { ...guest, participation: { liked: true, enteredAt } };
    rpc.mockResolvedValue(value);
    const response = await api.event(request(method), "gggi");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(value);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(method === "GET" ? "read_gggi_event" : "enter_gggi_event", { p_app_user_id: id });
  });
  it.each([false, true])("accepts empty streamed POST, including empty chunks (%s)", async emptyChunk => {
    const { api, rpc } = setup();
    rpc.mockResolvedValue({ ...guest, participation: { liked: true, enteredAt } });
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      if (emptyChunk) controller.enqueue(new Uint8Array());
      controller.close();
    } });
    const streamed = new Request("https://byus.kr/api", { method: "POST", body, duplex: "half" } as RequestInit);
    expect(streamed.body).not.toBeNull();
    expect((await api.event(streamed, "gggi")).status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("enter_gggi_event", { p_app_user_id: id });
  });
  it("accepts real Next Node adapter bodyless POST and rejects bytes regardless of headers", async () => {
    const { api, rpc } = setup();
    rpc.mockResolvedValue({ ...guest, participation: { liked: true, enteredAt } });
    let adaptedBodyExists = false;
    let contentLength: string | undefined;
    const server = createServer((incoming, outgoing) => {
      const adapted = NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(incoming), new AbortController().signal);
      adaptedBodyExists = adapted.body !== null;
      contentLength = incoming.headers["content-length"];
      void api.event(adapted, "gggi").then(response => {
        outgoing.writeHead(response.status); outgoing.end();
      });
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test HTTP port");
      const url = `http://127.0.0.1:${address.port}/api`;
      expect((await fetch(url, { method: "POST" })).status).toBe(200);
      expect(adaptedBodyExists).toBe(true);
      expect(contentLength).toBe("0");
      expect((await fetch(url, { method: "POST", body: "{}" })).status).toBe(400);
      expect(rpc).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
  it("rejects and cancels nonempty streamed POST after empty chunks without buffering", async () => {
    const { api, rpc } = setup();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array());
      controller.enqueue(new Uint8Array([1]));
    }, cancel });
    const streamed = new Request("https://byus.kr/api", {
      method: "POST", body, headers: { "content-length": "0" }, duplex: "half",
    } as RequestInit);
    expect((await api.event(streamed, "gggi")).status).toBe(400);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["GET", "POST"])("rejects invalid authentication for %s", async method => {
    const { api, rpc, authorize } = setup();
    authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "Sign in"));
    expect((await api.event(request(method), "gggi")).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("authenticates POST even with no authorization header", async () => {
    const { api, authorize } = setup();
    await api.event(new Request("https://byus.kr/api", { method: "POST" }), "gggi");
    expect(authorize).toHaveBeenCalledExactlyOnceWith(null);
  });
  it("rejects other creators and ownership in query or payload", async () => {
    const { api, rpc } = setup();
    expect((await api.event(request(), "runmusic")).status).toBe(404);
    expect((await api.event(request("GET", "?appUserId=forged"), "gggi")).status).toBe(400);
    expect((await api.event(new Request("https://byus.kr/api", { method: "POST", body: "{}" }), "gggi")).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { ...guest, privateId: id },
    { ...guest, participation: { liked: true, enteredAt, appUserId: id } },
    { ...guest, participation: { liked: true, enteredAt: "invalid" } },
    { ...guest, participation: { liked: true, enteredAt: null } },
    guest,
  ])("fails closed on invalid or incomplete POST response", async value => {
    const { api, rpc } = setup(); rpc.mockResolvedValue(value);
    const response = await api.event(request("POST"), "gggi");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "FANPAGE_UNAVAILABLE" } });
  });
  it("rejects owner state for anonymous requests", async () => {
    const { api, rpc } = setup(); rpc.mockResolvedValue({ ...guest, participation: { liked: true, enteredAt } });
    expect((await api.event(new Request("https://byus.kr/api"), "gggi")).status).toBe(503);
  });
  it.each([["GGGI_EVENT_LIKE_REQUIRED", 409], ["GGGI_EVENT_CLOSED", 409], ["GGGI_EVENT_NOT_FOUND", 404], ["private database detail", 503]])("maps %s safely", async (code, status) => {
    const { api, rpc } = setup(); rpc.mockRejectedValue(new Error(String(code)));
    const response = await api.event(request("POST"), "gggi");
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: { code: status === 503 ? "FANPAGE_UNAVAILABLE" : code } });
  });
});
describe("GGGI admin ledger", () => {
  it("requires admin authorization before querying identities", async () => {
    const { api, authorizeAdmin, rpc } = setup();
    authorizeAdmin.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 403, "Forbidden"));
    expect((await api.admin(request())).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
  });
  it("returns bounded read-only pagination", async () => {
    const { api, rpc } = setup();
    const value = { total: 2, entries: [{ appUserId: id, enteredAt }], nextOffset: 1 };
    rpc.mockResolvedValue(value);
    expect(await (await api.admin(request("GET", "?offset=0&limit=1"))).json()).toEqual(value);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_admin_gggi_event_entries", {
      p_actor_app_user_id: id, p_actor_admin_allowlist_id: id, p_offset: 0, p_limit: 1,
    });
  });
  it.each(["?limit=101", "?limit=0", "?offset=-1", "?offset=1000001", "?limit=1&limit=2", "?owner=forged"])("rejects invalid pagination %s", async query => {
    const { api, rpc } = setup(); expect((await api.admin(request("GET", query))).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects unexpected private fields", async () => {
    const { api, rpc } = setup(); rpc.mockResolvedValue({ total: 0, entries: [], nextOffset: null, email: "private" });
    expect((await api.admin(request())).status).toBe(503);
  });
});
