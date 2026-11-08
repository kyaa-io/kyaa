import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { AuthError } from "../../features/auth/domain/auth-errors";
import { isSignupClientEvent } from "../../features/analytics/domain/signup-funnel-event";
import {
  assertSafeProductEventTime,
  clientProductEventV1Schema,
  type ClientProductEventV1,
} from "../../features/analytics/domain/product-event";
import {
  ProductEventRepositoryError,
  type ProductEventRepository,
} from "./product-event-repository";

export type ProductEventRouteDependencies = {
  identify(authorization: string | null): Promise<{ appUserId: string } | null>;
  repository: ProductEventRepository;
  now(): Date;
  /** Server-only secret the rate bucket key is derived from (requestHashSecret). Without it there is no per-bucket budget. */
  rateSecret?: string;
};

const headers = { "cache-control": "no-store", vary: "Authorization" } as const;
const json = (body: unknown, status: number) => Response.json(body, { status, headers });
/** Over a limit the event is dropped without an error, so a flooding client learns nothing and a real one is not disturbed. */
const dropped = () => new Response(null, { status: 204, headers });

/**
 * HMAC of the rate bucket: the client IP the AWS edge writes (CloudFront function) together with the anonymous session or
 * the member. The key is derived from the server secret with its own label, so this hash cannot be compared with other
 * uses of that secret. Other hosts and local runs (no edge header) have no per-bucket budget.
 */
export function rateBucketHash(secret: string, request: Request, owner: { appUserId: string } | null, anonymousSessionId: string | null): string | null {
  const raw = request.headers.get("x-byus-client-ip")?.trim() ?? "";
  if (!isIP(raw)) return null;
  const key = createHmac("sha256", secret).update("product-event-ip-v1").digest();
  const holder = owner ? `member:${owner.appUserId}` : `anonymous:${anonymousSessionId ?? ""}`;
  return createHmac("sha256", key).update(`${raw.toLowerCase()}|${holder}`).digest("hex");
}

function logIdempotencyConflict(eventName: ClientProductEventV1["eventName"]): void {
  try {
    console.warn("product_event_idempotency_conflict", {
      eventName,
      reason: "strict_replay_mismatch",
      status: 409,
    });
  } catch {
    // Diagnostics must not change the handled conflict response.
  }
}

export function createRecordProductEventHandler(dependencies: ProductEventRouteDependencies) {
  return async (request: Request): Promise<Response> => {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 8_192) return json({ error: { code: "EVENT_INVALID" } }, 413);

    let acceptedEventName: ClientProductEventV1["eventName"] | null = null;
    try {
      const raw = await request.json();
      const input = clientProductEventV1Schema.parse(raw);
      acceptedEventName = input.eventName;
      if ((isSignupClientEvent(input.eventName) || input.eventName === "outbound_link_click") && request.headers.has("authorization")) {
        return json({ error: { code: "EVENT_INVALID" } }, 400);
      }
      assertSafeProductEventTime(input.occurredAt, dependencies.now());
      const owner = await dependencies.identify(request.headers.get("authorization"));
      if (!owner && !input.anonymousSessionId) return json({ error: { code: "EVENT_OWNER_REQUIRED" } }, 400);
      const bucket = dependencies.rateSecret && dependencies.repository.consumeRateBudget
        ? rateBucketHash(dependencies.rateSecret, request, owner, input.anonymousSessionId) : null;
      if (bucket) {
        // A budget lookup failure must not lose events; the per-owner page view cap still holds in the database.
        const allowed = await dependencies.repository.consumeRateBudget!(bucket).catch(() => true);
        if (!allowed) return dropped();
      }
      const result = await dependencies.repository.record({
        ...input,
        appUserId: owner?.appUserId ?? null,
        anonymousSessionId: owner ? null : input.anonymousSessionId,
      });
      return json({ event: result }, result.replayed ? 200 : 201);
    } catch (error) {
      if (error instanceof AuthError) return json({ error: { code: "AUTHENTICATION_REQUIRED" } }, error.status);
      if (error instanceof ProductEventRepositoryError) {
        if (error.code === "RATE_LIMITED") return dropped();
        if (error.code === "IDEMPOTENCY_CONFLICT" && acceptedEventName) {
          logIdempotencyConflict(acceptedEventName);
        }
        return json({ error: { code: error.code } }, error.code === "IDEMPOTENCY_CONFLICT" ? 409 : 503);
      }
      return json({ error: { code: "EVENT_INVALID" } }, 400);
    }
  };
}
