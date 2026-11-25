import { createHash } from "node:crypto";
import { AuthError } from "../../features/auth/domain/auth-errors";
import { HOME_BANNER_VIDEO_PREFIX } from "../../features/home/domain/home-banner";
import type { AdminSession } from "../admin/admin-session-gate";
import { boundedMultipart, CertificationBodyError, correlation, json } from "../certification/certification-http";

/** One loop file. The pair stays under 2 MB, so a slide never costs more than its picture by much. */
export const MAX_HOME_BANNER_VIDEO_BYTES = 1_048_576;

type Storage = { from(bucket: "cms-assets"): { upload(path: string, body: Uint8Array, options: { contentType: string; cacheControl: string; upsert: boolean }): Promise<{ error: { message?: string; statusCode?: string | number } | null }> } };
export interface HomeBannerVideoDependencies {
  authorize(input: { authorization: string; correlationId: string }): Promise<AdminSession>;
  storage: Storage;
}
export type HomeBannerVideoProblem = "INVALID_VIDEO" | "VIDEO_TOO_LARGE" | "VIDEO_HAS_SOUND";

function contains(bytes: Uint8Array, at: number, text: string) {
  for (let index = 0; index < text.length; index += 1) if (bytes[at + index] !== text.charCodeAt(index)) return false;
  return true;
}
/** An MP4 starts with an ftyp box; a sound track declares a 'soun' handler (hdlr + version/flags + pre_defined). */
function mp4Problem(bytes: Uint8Array): HomeBannerVideoProblem | null {
  if (bytes.length < 12 || !contains(bytes, 4, "ftyp")) return "INVALID_VIDEO";
  for (let index = 0; index + 16 <= bytes.length; index += 1) if (contains(bytes, index, "hdlr") && contains(bytes, index + 12, "soun")) return "VIDEO_HAS_SOUND";
  return null;
}
/** A WebM starts with the EBML magic and names the webm doctype; an audio track's CodecID (0x86) starts with "A_". */
function webmProblem(bytes: Uint8Array): HomeBannerVideoProblem | null {
  const head = bytes.subarray(0, 64);
  if (bytes.length < 8 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3 || !head.some((_, index) => contains(head, index, "webm"))) return "INVALID_VIDEO";
  for (let index = 0; index + 4 <= bytes.length; index += 1) if (bytes[index] === 0x86 && (bytes[index + 1] & 0x80) && contains(bytes, index + 2, "A_")) return "VIDEO_HAS_SOUND";
  return null;
}
export function homeBannerVideoProblem(mp4: Uint8Array, webm: Uint8Array): HomeBannerVideoProblem | null {
  if (mp4.length > MAX_HOME_BANNER_VIDEO_BYTES || webm.length > MAX_HOME_BANNER_VIDEO_BYTES) return "VIDEO_TOO_LARGE";
  return mp4Problem(mp4) ?? webmProblem(webm);
}

function uploadedFile(form: FormData, name: string): File | null {
  const values = form.getAll(name);
  const value = values[0];
  return values.length === 1 && typeof value === "object" && value !== null && typeof (value as File).arrayBuffer === "function" ? value as File : null;
}

/** Stores an MP4/WebM pair as one extensionless loop (SceneVideo) and returns its path for the banner row. */
export function createPostHomeBannerVideoHandler(dependencies: HomeBannerVideoDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const correlationId = correlation(request);
    try {
      const actor = await dependencies.authorize({ authorization: request.headers.get("authorization") ?? "", correlationId });
      if (actor.role === "viewer") return json({ error: { code: "FORBIDDEN" } }, 403);
      const form = await boundedMultipart(request, 2 * MAX_HOME_BANNER_VIDEO_BYTES + 64_000);
      const mp4File = uploadedFile(form, "mp4"), webmFile = uploadedFile(form, "webm");
      if (!mp4File || !webmFile || [...form.keys()].length !== 2) return json({ error: { code: "INVALID_VIDEO" } }, 400);
      const mp4 = new Uint8Array(await mp4File.arrayBuffer()), webm = new Uint8Array(await webmFile.arrayBuffer());
      const problem = homeBannerVideoProblem(mp4, webm);
      if (problem) return json({ error: { code: problem } }, problem === "VIDEO_TOO_LARGE" ? 413 : 400);
      const name = `admin-${createHash("sha256").update(mp4).update(webm).digest("hex").slice(0, 32)}`;
      const bucket = dependencies.storage.from("cms-assets");
      for (const [extension, bytes, contentType] of [["mp4", mp4, "video/mp4"], ["webm", webm, "video/webm"]] as const) {
        const { error } = await bucket.upload(`home-banners/video/${name}.${extension}`, bytes, { contentType, cacheControl: "public, max-age=31536000, immutable", upsert: false });
        // The name is the content hash: an existing object is this same file.
        if (error && !(Number(error.statusCode) === 409 || /duplicate|already exists/i.test(error.message ?? ""))) return json({ error: { code: "VIDEO_UPLOAD_UNAVAILABLE" } }, 503);
      }
      return json({ video: `${HOME_BANNER_VIDEO_PREFIX}${name}` }, 201);
    } catch (error) {
      if (error instanceof AuthError) return json({ error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } }, error.status);
      if (error instanceof CertificationBodyError) return json({ error: { code: error.code === "BODY_TOO_LARGE" ? "VIDEO_TOO_LARGE" : "INVALID_VIDEO" } }, error.code === "BODY_TOO_LARGE" ? 413 : 400);
      return json({ error: { code: "VIDEO_UPLOAD_UNAVAILABLE" } }, 503);
    }
  };
}
