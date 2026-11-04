import { z } from "zod";
import { AuthError } from "../../../../features/auth/domain/auth-errors";
import { loadServerEnv } from "../../../../server/config/env";
import { createOperatorAuthorizer } from "../../../../server/operator/operator-dependencies";
import { listOperatorChannels } from "../../../../server/operator/supabase-channel-operator-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function GET(request: Request): Promise<Response> {
  try {
    const requested = request.headers.get("x-correlation-id");
    const correlationId = requested && z.string().uuid().safeParse(requested).success ? requested : crypto.randomUUID();
    const session = await createOperatorAuthorizer().authorize(request.headers.get("authorization"), correlationId, null);
    const env = loadServerEnv();
    const celebrities = await listOperatorChannels({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }, session.channelIds);
    return json({ kind: session.kind, role: session.role, celebrities });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" }, error.status === 401 ? 401 : 403);
    return json({ error: "OPERATOR_CHANNELS_UNAVAILABLE" }, 503);
  }
}
