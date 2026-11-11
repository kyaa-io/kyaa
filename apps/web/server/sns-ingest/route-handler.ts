import { z } from "zod";
import { boundedJson, CertificationBodyError } from "@/server/certification/certification-http";
import { constantTimeEqual } from "../instagram/crypto";
import { snsIngestRequestSchema, SnsIngestSourceError, type createSnsIngestService } from "./service";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export function createSnsIngestHandler(getService: () => ReturnType<typeof createSnsIngestService>, env: Record<string, string | undefined> = process.env) {
  return async function POST(request: Request) {
    const reject = (code: string, status: number) => {
      console.warn("sns_ingest_rejected", { code, status });
      return json({ error: { code } }, status);
    };
    // A dedicated secret, separate from CRON_SECRET. Missing means the path is off.
    const secret = env.SNS_INGEST_SECRET;
    if (!secret || secret.length < 32) return reject("SNS_INGEST_NOT_CONFIGURED", 503);
    if (!constantTimeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return reject("UNAUTHORIZED", 401);
    let body: z.infer<typeof snsIngestRequestSchema>;
    try { body = snsIngestRequestSchema.parse(await boundedJson(request, 512 * 1024)); } catch (error) {
      if (error instanceof CertificationBodyError && error.code === "BODY_TOO_LARGE") return reject("BODY_TOO_LARGE", 413);
      return reject("INVALID_REQUEST", 400);
    }
    const header = request.headers.get("x-correlation-id");
    const correlationId = header && z.uuid().safeParse(header).success ? header : crypto.randomUUID();
    try {
      return json(await getService().ingest(body, correlationId));
    } catch (error) {
      if (error instanceof SnsIngestSourceError) return reject(error.message, 403);
      return json({ error: { code: "SNS_INGEST_FAILED" } }, 503);
    }
  };
}
