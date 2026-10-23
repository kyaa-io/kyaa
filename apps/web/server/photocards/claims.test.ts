import { describe, expect, it, vi } from "vitest";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { photocardClaimSchema } from "@/features/fanpage/domain/photocard-claim";
import { FanAuthUnavailableError } from "@/server/fan-auth/fan-auth-gate";
import { createPhotocardClaimHandlers } from "./claims";

vi.mock("server-only", () => ({}));

const collectionId = "a0000000-0000-4000-8000-000000000001";
const bundleId = "b0000000-0000-4000-8000-000000000001";
const assetId = "c0000000-0000-4000-8000-000000000001";
const owner = "authenticated-owner";
const result = { mode: "member_pair", ready: true, selectedBundleId: null, options: [{ id: bundleId, title: "멤버" }], assets: [] };
const request = (body?: string, headers?: HeadersInit) => new Request(`https://kyaa.io/api/photocard-collections/${collectionId}/claim`, {
  method: body === undefined ? "GET" : "POST", body,
  headers: { authorization: "Bearer owner-token", "content-type": "application/json", ...headers },
});
function setup(value: unknown = result) {
  const deps = { authorize: vi.fn().mockResolvedValue({ appUserId: owner }), rpc: vi.fn().mockResolvedValue(value) };
  return { ...deps, ...createPhotocardClaimHandlers(deps) };
}
async function expectFailure(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code } });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Authorization");
}

describe("private photocard claims", () => {
  it("authenticates GET and only reads the authenticated owner's claim", async () => {
    const api = setup();
    const response = await api.get(request(), collectionId);
    expect(api.authorize).toHaveBeenCalledExactlyOnceWith("Bearer owner-token");
    expect(api.rpc).toHaveBeenCalledExactlyOnceWith("read_cheer_photocard_claim", { p_app_user_id: owner, p_collection_id: collectionId });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization");
  });

  it.each([{}, { bundleId }])("POST sends only the authenticated owner and selection %j", async input => {
    const claimed = { ...result, selectedBundleId: bundleId, assets: [{ id: assetId, width: 1080, height: 1440 }] };
    const api = setup(claimed);
    const response = await api.claim(request(JSON.stringify(input)), collectionId);
    expect(api.authorize).toHaveBeenCalledExactlyOnceWith("Bearer owner-token");
    expect(api.rpc).toHaveBeenCalledExactlyOnceWith("claim_cheer_photocard_bundle", {
      p_app_user_id: owner, p_collection_id: collectionId, p_bundle_id: "bundleId" in input ? bundleId : null,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(claimed);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Authorization");
  });

  it.each(["get", "claim"] as const)("%s rejects unauthenticated requests before RPC", async method => {
    const api = setup();
    api.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "secret auth details"));
    await expectFailure(await api[method](request(method === "claim" ? "{}" : undefined), collectionId), 401, "AUTHENTICATION_REQUIRED");
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [new AuthError("AUTHENTICATION_REQUIRED", 403, "private details"), 403, "PHOTOCARD_FORBIDDEN"],
    [new FanAuthUnavailableError(), 503, "PHOTOCARD_UNAVAILABLE"],
  ] as const)("sanitizes authentication failures: %s", async (error, status, code) => {
    const api = setup();
    api.authorize.mockRejectedValue(error);
    await expectFailure(await api.get(request(), collectionId), status, code);
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it.each(["get", "claim"] as const)("%s rejects invalid collection IDs before RPC", async method => {
    const api = setup();
    await expectFailure(await api[method](request("{}"), "invalid"), 400, "PHOTOCARD_INVALID_SELECTION");
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it.each(["", "{", "null", "[]", '{"bundleId":null}', '{"bundleId":"invalid"}', '{"appUserId":"other-owner"}', '{"ownerId":"other-owner"}', JSON.stringify({ bundleId, extra: true }), " ".repeat(1025)])("rejects invalid POST body without RPC: %j", async body => {
    const api = setup();
    await expectFailure(await api.claim(request(body, { "content-length": "1" }), collectionId), 400, "PHOTOCARD_INVALID_SELECTION");
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("requires a JSON body and accepts the 1024-byte boundary", async () => {
    const api = setup();
    await expectFailure(await api.claim(request(), collectionId), 400, "PHOTOCARD_INVALID_SELECTION");
    expect(api.rpc).not.toHaveBeenCalled();
    expect((await api.claim(request(" ".repeat(1022) + "{}"), collectionId)).status).toBe(200);
  });

  it("bounds streamed bytes and cancels before reading an entire oversized body", async () => {
    const api = setup(), cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(700).fill(32));
        controller.enqueue(new Uint8Array(700).fill(32));
        controller.enqueue(new Uint8Array(700).fill(32));
      }, cancel,
    });
    const streamed = new Request(request().url, { method: "POST", body, duplex: "half" } as RequestInit & { duplex: string });
    await expectFailure(await api.claim(streamed, collectionId), 400, "PHOTOCARD_INVALID_SELECTION");
    expect(cancel).toHaveBeenCalledOnce();
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it.each(["get", "claim"] as const)("%s hides missing collections or entitlements", async method => {
    const api = setup(null);
    await expectFailure(await api[method](request("{}"), collectionId), 404, "PHOTOCARD_NOT_FOUND");
  });

  it.each([
    ["PHOTOCARD_NOT_FOUND", 404],
    ["PHOTOCARD_INVALID_SELECTION", 400], ["PHOTOCARD_ALREADY_CLAIMED", 409], ["PHOTOCARD_NOT_READY", 409],
  ] as const)("maps the exact DB error %s", async (code, status) => {
    const api = setup();
    api.rpc.mockRejectedValue(new Error(code));
    await expectFailure(await api.claim(request("{}"), collectionId), status, code);
  });

  it.each([new Error("private-bucket/owner/original.jpg"), new Error("PHOTOCARD_ALREADY_CLAIMED: private SQL details"), new SyntaxError("private details"), { message: "PHOTOCARD_NOT_READY" }])("sanitizes unexpected RPC errors: %j", async error => {
    const api = setup();
    api.rpc.mockRejectedValue(error);
    await expectFailure(await api.claim(request("{}"), collectionId), 503, "PHOTOCARD_UNAVAILABLE");
  });

  it.each([
    undefined,
    { ...result, storagePath: "private/original.jpg" },
    { ...result, options: [{ id: bundleId, title: "a".repeat(121) }] },
    { ...result, options: [{ id: bundleId, title: "Member", storagePath: "private.jpg" }] },
    { ...result, assets: [{ id: assetId, width: 0, height: 1440 }] },
    { ...result, assets: [{ id: assetId, width: 1080, height: 1440, url: "private.jpg" }] },
    { ...result, selectedBundleId: "invalid" },
  ])("fails closed for malformed RPC output %j", async value => {
    const api = setup();
    api.rpc.mockResolvedValue(value);
    await expectFailure(await api.get(request(), collectionId), 503, "PHOTOCARD_UNAVAILABLE");
  });

  it.each(["all", "member_pair", "random_three"])("accepts the shared client contract for %s", mode => {
    expect(photocardClaimSchema.parse({ ...result, mode })).toEqual({ ...result, mode });
  });
});
