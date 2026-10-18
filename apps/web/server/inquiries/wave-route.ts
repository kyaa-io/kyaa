import { createHmac } from "node:crypto";
import { z } from "zod";
import { inquirySchema, InquiryError, inquiryFailure, normalizedClientIp } from "./fanmeeting-route";

export const waveOrigins = new Set(["https://kyaawave.com", "https://www.kyaawave.com"]);
const attribution = {
  requestId: z.uuid(), sessionId: z.uuid(), channel: z.enum(["google", "bing", "naver", "telegram", "direct", "other"]),
  locale: inquirySchema.shape.locale,
};
export const waveInquirySchema = inquirySchema.pick({ name: true, email: true, message: true, consent: true }).extend({
  ...attribution, interest: z.enum(["creator", "partnership"]), website: z.literal(""),
}).strict();
export const waveEngagementSchema = z.object({ ...attribution, event: z.enum(["page_view", "inquiry_open", "inquiry_submit"]) }).strict();
export type WaveInquiry = z.infer<typeof waveInquirySchema>;
export type WaveEngagement = z.infer<typeof waveEngagementSchema>;
export type WaveRepository = {
  submit(input: WaveInquiry, ipHash: string, payloadHash: string, sessionHash: string): Promise<boolean>;
  engage(input: WaveEngagement, ipHash: string, sessionHash: string): Promise<boolean>;
};
export function waveCors(request: Request, response: Response): Response {
  response.headers.set("vary", "Origin");
  response.headers.set("cache-control", "no-store");
  const origin = request.headers.get("origin");
  if (origin && waveOrigins.has(origin)) response.headers.set("access-control-allow-origin", origin);
  return response;
}
export function waveOptions(request: Request): Response {
  const headers = request.headers.get("access-control-request-headers")?.toLowerCase().split(",").map(value => value.trim()) ?? [];
  const valid = waveOrigins.has(request.headers.get("origin") ?? "") && request.headers.get("access-control-request-method") === "POST" && headers.every(value => value === "content-type");
  const response = new Response(null, { status: valid ? 204 : 400 });
  if (valid) {
    response.headers.set("access-control-allow-methods", "POST");
    response.headers.set("access-control-allow-headers", "Content-Type");
  }
  return waveCors(request, response);
}
async function readJson(request: Request, limit: number): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !request.body) throw new InquiryError("INQUIRY_INVALID");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new InquiryError("INQUIRY_INVALID"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally { reader.releaseLock(); }
}
export function createWaveHandler(deps: { repository: WaveRepository; secret: string; vercel: boolean; localDevelopment?: boolean }, engagement = false) {
  return async (request: Request): Promise<Response> => {
    let response: Response;
    try {
      if (!waveOrigins.has(request.headers.get("origin") ?? "")) throw new InquiryError("INQUIRY_INVALID");
      if (!deps.vercel && !deps.localDevelopment) throw new InquiryError("INQUIRY_UNAVAILABLE");
      const raw = await readJson(request, engagement ? 2048 : 16384);
      const hash = (purpose: string, value: string) => createHmac("sha256", deps.secret).update(`byus-inquiry-v1:${purpose}:${value}`).digest("hex");
      const ipHash = hash("ip", normalizedClientIp(request, deps.vercel));
      let replayed: boolean;
      if (engagement) {
        const parsed = waveEngagementSchema.safeParse(raw);
        if (!parsed.success) throw new InquiryError("INQUIRY_INVALID");
        replayed = await deps.repository.engage(parsed.data, ipHash, hash("wave-session", parsed.data.sessionId));
      } else {
        const parsed = waveInquirySchema.safeParse(raw);
        if (!parsed.success) throw new InquiryError("INQUIRY_INVALID");
        const input = parsed.data;
        const sessionHash = hash("wave-session", input.sessionId);
        const payloadHash = hash("payload", JSON.stringify([input.interest === "creator" ? "wave_creator" : "wave_partner", input.locale, input.name, "kyaa wave", input.email, input.message, input.consent, sessionHash, input.channel]));
        replayed = await deps.repository.submit(input, ipHash, payloadHash, sessionHash);
      }
      response = Response.json({ status: "accepted" }, { status: replayed ? 200 : 202 });
    } catch (error) {
      response = inquiryFailure(error instanceof InquiryError ? error.code : error instanceof SyntaxError ? "INQUIRY_INVALID" : "INQUIRY_UNAVAILABLE");
    }
    return waveCors(request, response);
  };
}
