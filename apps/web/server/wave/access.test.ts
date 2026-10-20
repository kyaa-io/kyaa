import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { withWaveAccess, WAVE_SLUG } from "./access";

const user = "00000000-0000-4000-8000-000000000001";
const request = (path: string, token = "Bearer verified", method = "GET", body?: unknown) => new Request(`https://byus.test${path}`, {
  method, headers: { ...(token ? { authorization: token } : {}), ...(body ? { "content-type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const slugPath = `/api/celebrities/${WAVE_SLUG}/feed`;
const receipt = { participation: { id: user, createdAt: "2026-10-21T00:00:00Z" } };
function setup() {
  const deps = { authorize: vi.fn().mockResolvedValue({ appUserId: user }), rpc: vi.fn().mockImplementation(async (name: string) => name === "is_kyaa_wave_resource" ? true : receipt) };
  const handler = vi.fn(async (_request: Request) => Response.json({ body: "private" }, { headers: { "cache-control": "public, max-age=60", vary: "Accept-Encoding" } }));
  return { deps, handler, run: withWaveAccess(handler, () => deps) };
}
describe("Wave API access", () => {
  it("requires a verified login before reading check-in", async () => {
    const { deps, handler, run } = setup();
    expect((await run(request(slugPath, ""))).status).toBe(401);
    deps.authorize.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "invalid"));
    expect((await run(request(slugPath))).status).toBe(401);
    expect(deps.rpc).not.toHaveBeenCalled(); expect(handler).not.toHaveBeenCalled();
  });
  it("rejects logged-in users without the participation receipt", async () => {
    const { deps, handler, run } = setup(); deps.rpc.mockResolvedValue({ participation: null });
    const response = await run(request(slugPath));
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: { code: "WAVE_CHECKIN_REQUIRED" } });
    expect(handler).not.toHaveBeenCalled();
  });
  it("uses the verified owner and makes checked-in responses private", async () => {
    const { deps, run } = setup(); const response = await run(request(`${slugPath}?appUserId=untrusted`));
    expect(response.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_kyaa_wave_participation", { p_app_user_id: user });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Accept-Encoding, Authorization");
  });
  it("preserves unrelated creators without consulting authentication or storage", async () => {
    const { deps, run } = setup(); const response = await run(request("/api/celebrities/elina/feed", ""));
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(deps.authorize).not.toHaveBeenCalled(); expect(deps.rpc).not.toHaveBeenCalled();
  });
  it.each(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"])("gates %s direct IDs by stored owner despite a forged creator query", async method => {
    const { deps, handler, run } = setup();
    expect((await run(request(`/api/posts/${user}?celebrity=elina`, "", method))).status).toBe(401);
    expect(deps.rpc).toHaveBeenCalledWith("is_kyaa_wave_resource", { p_kind: "fan_post", p_resource_id: user });
    expect(handler).not.toHaveBeenCalled();
  });
  it("decodes direct resource IDs before resolving ownership", async () => {
    const { deps, run } = setup();
    expect((await run(request(`/api/posts/%30${user.slice(1)}`, ""))).status).toBe(401);
    expect(deps.rpc).toHaveBeenCalledWith("is_kyaa_wave_resource", { p_kind: "fan_post", p_resource_id: user });
  });
  it("gates LIVE mission submission by its stored event owner", async () => {
    const { deps, handler, run } = setup();
    expect((await run(request(`/api/missions/${user}/submit`, "", "POST"))).status).toBe(401);
    expect(deps.rpc).toHaveBeenCalledWith("is_kyaa_wave_resource", { p_kind: "live_mission", p_resource_id: user });
    expect(handler).not.toHaveBeenCalled();
  });
  it("preserves asset admin previews only through the original verified admin handler", async () => {
    const { createContentHandlers } = await import("@/server/fan-posts/routes");
    const { deps } = setup();
    const content = { ...deps, authorizeAdmin: vi.fn().mockRejectedValue(new AuthError("ADMIN_NOT_ALLOWLISTED", 403, "forbidden")), upload: vi.fn(), download: vi.fn(), translate: vi.fn() };
    const handler = (input: Request) => createContentHandlers(content).asset(input, user);
    const response = await withWaveAccess(handler, () => content)(request(`/api/content-assets/${user}?admin=1`));
    expect(response.status).toBe(403); expect(content.authorizeAdmin).toHaveBeenCalled();
    expect(content.rpc).not.toHaveBeenCalled(); expect(content.download).not.toHaveBeenCalled();
  });
  it("verifies the separate admin session before public notice media previews", async () => {
    const { deps, handler } = setup();
    const authorizeAdmin = vi.fn().mockRejectedValue(new AuthError("ADMIN_NOT_ALLOWLISTED", 403, "forbidden"));
    const run = withWaveAccess(handler, () => ({ ...deps, authorizeAdmin }));
    const path = `/api/public/notice-media/${user}?admin=1`;
    expect((await run(request(path))).status).toBe(403); expect(handler).not.toHaveBeenCalled();
    authorizeAdmin.mockResolvedValue({ appUserId: user, allowlistId: user, role: "operator", email: "admin@example.test" });
    const response = await run(request(path));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.rpc).not.toHaveBeenCalled(); expect(deps.authorize).not.toHaveBeenCalled();
    expect((await run(request(`/api/posts/${user}?admin=1`, ""))).status).toBe(401);
  });
  it("gates only the scoped Wave LIVE catalog and preserves the global list", async () => {
    const { deps, handler, run } = setup();
    expect((await run(request(`/api/live-events?creator=${WAVE_SLUG}`, ""))).status).toBe(401);
    deps.rpc.mockResolvedValue({ participation: null });
    expect((await run(request(`/api/live-events?creator=${WAVE_SLUG}`))).status).toBe(403);
    deps.rpc.mockResolvedValue(receipt);
    expect((await run(request(`/api/live-events?creator=${WAVE_SLUG}`))).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    deps.authorize.mockClear(); deps.rpc.mockClear();
    expect((await run(request("/api/live-events", ""))).status).toBe(200);
    expect(deps.authorize).not.toHaveBeenCalled(); expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("preserves non-Wave ID resources", async () => {
    const { deps, run } = setup(); deps.rpc.mockResolvedValue(false);
    expect((await run(request(`/api/posts/${user}`, ""))).status).toBe(200);
    expect(deps.authorize).not.toHaveBeenCalled();
  });
  it.each([null, {}, { participation: {} }])("fails closed on malformed check-in data %j", async value => {
    const { deps, handler, run } = setup(); deps.rpc.mockResolvedValue(value);
    expect((await run(request(slugPath))).status).toBe(503); expect(handler).not.toHaveBeenCalled();
  });
  it("fails closed when owner resolution or receipt storage is unavailable", async () => {
    const { deps, run } = setup(); deps.rpc.mockRejectedValue(new Error("unavailable"));
    expect((await run(request(`/api/posts/${user}`))).status).toBe(503);
    expect((await run(request(slugPath))).status).toBe(503);
  });
  it("gates uploaded assets without consuming the original multipart body", async () => {
    const { deps } = setup();
    const handler = vi.fn(async (input: Request) => Response.json({ slug: (await input.formData()).get("celebritySlug") }));
    const run = withWaveAccess(handler, () => deps);
    const body = new FormData(); body.set("celebritySlug", WAVE_SLUG);
    expect((await run(new Request("https://byus.test/api/content-assets", { method: "POST", body }))).status).toBe(401);
    const response = await run(new Request("https://byus.test/api/content-assets", { method: "POST", headers: { authorization: "Bearer verified" }, body }));
    expect(await response.json()).toEqual({ slug: WAVE_SLUG });
  });
  it("gates public notice media HEAD by the stored attachment owner", async () => {
    const { deps, run } = setup();
    expect((await run(request(`/api/public/notice-media/${user}`, "", "HEAD"))).status).toBe(401);
    expect(deps.rpc).toHaveBeenCalledWith("is_kyaa_wave_resource", { p_kind: "media", p_resource_id: user });
  });
  it("bounds cloned translation bodies before owner resolution", async () => {
    const { deps, handler, run } = setup();
    expect((await run(request("/api/content-translations", "", "POST", { targetType: "notice", targetId: user, padding: "x".repeat(2048) }))).status).toBe(413);
    expect(deps.rpc).not.toHaveBeenCalled(); expect(handler).not.toHaveBeenCalled();
  });
  it("gates translations by actual body target and benefits by creator query", async () => {
    const { deps, run } = setup();
    expect((await run(request("/api/content-translations", "", "POST", { targetType: "notice", targetId: user }))).status).toBe(401);
    expect(deps.rpc).toHaveBeenCalledWith("is_kyaa_wave_resource", { p_kind: "notice", p_resource_id: user });
    expect((await run(request(`/api/benefits?celebrity=${WAVE_SLUG}`, ""))).status).toBe(401);
  });
});

it("wraps every exported method in the protected route inventory", () => {
  const api = resolve(process.cwd(), "app/api");
  const directories = ["celebrities/[slug]", "public/celebrities/[slug]/notices", "public/celebrities/[slug]/quiz", "posts", "post-comments", "notice-comments", "content-assets", "cheers", "fan-clips", "fan-clip-comments", "benefits", "quiz-attempts", "live-submissions", "media", "public/notice-media", "live-events/[slug]", "content-translations", "missions"];
  function routes(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? routes(resolve(directory, entry.name)) : entry.name === "route.ts" ? [resolve(directory, entry.name)] : []);
  }
  const files = [...directories.flatMap(directory => routes(resolve(api, directory))), resolve(api, "live-events/route.ts")];
  expect(files.length).toBeGreaterThanOrEqual(71);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    expect(source, file).not.toMatch(/export\s*\{[^}]*\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/);
    const exports = source.matchAll(/export (?:async function|const) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g);
    for (const [, method] of exports) expect(source, `${file}: ${method}`).toMatch(new RegExp(`export const ${method} = withWaveAccess\\(`));
  }
});
