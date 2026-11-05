import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createPhotocardReadHandler } from "./routes";
import { renderPhotocard } from "./image";
vi.mock("server-only", () => ({}));

const id = "a0000000-0000-4000-8000-000000000001";
const request = () => new Request(`https://kyaa.io/api/photocards/${id}`, { headers: { authorization: "Bearer member-token" } });
const source = () => sharp({ create: { width: 1800, height: 2400, channels: 3, background: "#856b9b" } }).jpeg().withMetadata().toBuffer();
const access = { storagePath: `${id}/original.jpg`, contentType: "image/jpeg", watermarkCode: "KYAA-ABC123456" };

describe("private photocard read", () => {
  it("authorizes the token owner before fetching and returns only a personalized derivative", async () => {
    const startedAt = performance.now();
    const mark = (name: string) => console.info(`photocard read phase ${name} ${Math.round(performance.now() - startedAt)}ms`);
    mark("start");
    const original = await source();
    mark("source");
    const rpc = vi.fn().mockResolvedValue(access), download = vi.fn().mockResolvedValue(original);
    const response = await createPhotocardReadHandler({ authorize: async () => ({ appUserId: "member-owner" }), rpc, download })(request(), id);
    mark("handler");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("authorize_cheer_photocard_read", { p_app_user_id: "member-owner", p_asset_id: id });
    expect(download).toHaveBeenCalledExactlyOnceWith(access.storagePath);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("vary")).toBe("Authorization");
    const bytes = Buffer.from(await response.arrayBuffer()), metadata = await sharp(bytes).metadata();
    mark("body");
    expect(metadata).toMatchObject({ format: "webp", width: 1080, height: 1440 });
    expect(metadata.exif).toBeUndefined();
    expect(bytes.equals(original)).toBe(false);
    const small = await sharp({ create: { width: 360, height: 480, channels: 3, background: "#856b9b" } }).jpeg().toBuffer();
    expect(Buffer.from(await renderPhotocard(small, "KYAA-OTHER123")).equals(Buffer.from(await renderPhotocard(small, "KYAA-ABC123456")))).toBe(false);
    mark("other");
    // Renders WebP three times through native sharp: once from a 1800x2400 JPEG, then twice from 360x480 inputs. Each phase prints its own elapsed time so a timeout shows where it stopped.
  }, 20_000);

  it("does not fetch storage for a missing entitlement or unauthenticated request", async () => {
    const download = vi.fn(), rpc = vi.fn().mockResolvedValue(null);
    const denied = await createPhotocardReadHandler({ authorize: async () => ({ appUserId: "different-owner" }), rpc, download })(request(), id);
    expect(denied.status).toBe(404);
    const unauthenticated = await createPhotocardReadHandler({ authorize: async () => { throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Missing token"); }, rpc, download })(request(), id);
    expect(unauthenticated.status).toBe(401);
    expect(download).not.toHaveBeenCalled();
  });

  it("fails closed for an unsafe source and does not disclose storage or underlying errors", async () => {
    const download = vi.fn();
    const response = await createPhotocardReadHandler({ authorize: async () => ({ appUserId: "owner" }), rpc: async () => ({ ...access, storagePath: "../original.jpg" }), download })(request(), id);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "PHOTOCARD_UNAVAILABLE" } });
    expect(download).not.toHaveBeenCalled();
    await expect(renderPhotocard(Buffer.from("<svg/>"), "KYAA-ABC123")).rejects.toThrow();
    await expect(renderPhotocard(await source(), "<script>" )).rejects.toThrow();
  });
});
