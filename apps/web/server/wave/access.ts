import { AuthError } from "@/features/auth/domain/auth-errors";
import { participationResponseSchema } from "@/features/connect/kyaa-wave-participation";
import type { FanpageDependencies } from "@/server/fanpage/routes";

export const WAVE_SLUG = "kyaa-wave-fanpage";
type Dependencies = Pick<FanpageDependencies, "authorize" | "rpc"> & Partial<Pick<FanpageDependencies, "authorizeAdmin">>;
const privateHeaders = { "cache-control": "private, no-store", vary: "Authorization" };
const failure = (code: string, status: number) => Response.json({ error: { code } }, { status, headers: privateHeaders });
const resources: Record<string, string> = {
  posts: "fan_post", "post-comments": "fan_post_comment", "notice-comments": "notice_comment",
  "content-assets": "content_asset", media: "media", "notice-media": "media", cheers: "cheer",
  "fan-clips": "fan_clip", "fan-clip-comments": "fan_clip_comment", benefits: "benefit",
  missions: "live_mission", "quiz-attempts": "quiz_attempt", "live-events": "live_event", "live-submissions": "live_submission",
};

class WaveBodyLimitError extends Error {}
function boundedBody(request: Request, maximum: number): Response {
  let size = 0;
  const body = request.clone().body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maximum) throw new WaveBodyLimitError();
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, { headers: request.headers });
}

async function waveRequest(request: Request, dependencies: () => Promise<Dependencies>): Promise<boolean> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  // The existing asset handler verifies the separate admin session before serving previews.
  if (parts.length === 3 && parts[1] === "content-assets" && url.searchParams.get("admin") === "1") return false;
  const creator = parts.indexOf("celebrities");
  if (creator >= 0) return (parts[creator + 1] ?? "") === WAVE_SLUG;
  if (url.pathname === "/api/live-events") return url.searchParams.getAll("creator").includes(WAVE_SLUG);
  if (url.pathname === "/api/benefits") return url.searchParams.getAll("celebrity").includes(WAVE_SLUG);
  if (url.pathname === "/api/content-assets") {
    try {
      const { MAX_PUBLIC_IMAGE_MULTIPART_BYTES } = await import("@/server/media/public-image-processing");
      return (await boundedBody(request, MAX_PUBLIC_IMAGE_MULTIPART_BYTES).formData()).getAll("celebritySlug").includes(WAVE_SLUG);
    } catch (error) { if (error instanceof WaveBodyLimitError) throw error; return false; }
  }
  let kind = resources[parts[1] === "public" ? parts[2] : parts[1]];
  let id = parts[parts[1] === "public" ? 3 : 2];
  if (url.pathname === "/api/content-translations") {
    try {
      const body = await boundedBody(request, 2048).json();
      kind = body?.targetType; id = body?.targetId;
    } catch (error) { if (error instanceof WaveBodyLimitError) throw error; return false; }
  }
  if (typeof kind !== "string" || typeof id !== "string" || !kind || !id) return false;
  const result = await (await dependencies()).rpc("is_kyaa_wave_resource", { p_kind: kind, p_resource_id: id });
  if (typeof result !== "boolean") throw new Error("Invalid Wave resource response");
  return result;
}

export function withWaveAccess<A extends unknown[]>(handler: (...args: A) => Promise<Response>, dependencies: () => Dependencies | Promise<Dependencies> = async () => {
  const { createFanpageDependencies } = await import("@/server/fanpage/dependencies");
  return createFanpageDependencies();
}): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const request = args[0] as Request;
    let deps: Dependencies | undefined;
    const getDependencies = async () => deps ??= await dependencies();
    try {
      const url = new URL(request.url);
      const adminNoticePreview = /^\/api\/public\/notice-media\/[^/]+$/.test(url.pathname) && url.searchParams.get("admin") === "1";
      if (adminNoticePreview) {
        const authorizeAdmin = (await getDependencies()).authorizeAdmin;
        if (!authorizeAdmin) throw new Error("Admin authorization unavailable");
        await authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID());
      } else {
        if (!await waveRequest(request, getDependencies)) return handler(...args);
        if (!request.headers.get("authorization")) return failure("UNAUTHENTICATED", 401);
        const { appUserId } = await (await getDependencies()).authorize(request.headers.get("authorization"));
        const receipt = participationResponseSchema.parse(await (await getDependencies()).rpc("read_owned_kyaa_wave_participation", { p_app_user_id: appUserId }));
        if (!receipt.participation) return failure("WAVE_CHECKIN_REQUIRED", 403);
      }
      const response = await handler(...args);
      const headers = new Headers(response.headers);
      headers.set("cache-control", "private, no-store");
      const vary = headers.get("vary");
      if (!vary?.split(",").some(value => value.trim().toLowerCase() === "authorization")) headers.set("vary", vary ? `${vary}, Authorization` : "Authorization");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      if (error instanceof WaveBodyLimitError) return failure("BODY_TOO_LARGE", 413);
      if (error instanceof AuthError) return failure(error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", error.status === 401 ? 401 : 403);
      return failure("WAVE_ACCESS_UNAVAILABLE", 503);
    }
  };
}
