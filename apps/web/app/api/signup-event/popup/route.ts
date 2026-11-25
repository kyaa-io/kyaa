import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { localSignupEnabled } from "@/server/signup-event/local";
import { rafflePolicySchema, signupEvent } from "@/features/benefit/domain/signup-event";
import { AuthError } from "@/features/auth/domain/auth-errors";

export async function POST(request: Request) {
  if (!localSignupEnabled()) return new Response(null, { status: 404 });
  try {
    const deps = createFanpageDependencies();
    const actor = await deps.authorize(request.headers.get("authorization"));
    const { startsAt, closesAt } = rafflePolicySchema.parse({});
    const show = await deps.rpc("claim_signup_raffle_popup", {
      p_user: actor.appUserId, p_event: signupEvent.id, p_start: startsAt, p_end: closesAt,
    });
    return Response.json({ show: show === true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return new Response(null, { status: error instanceof AuthError ? error.status : 503 });
  }
}
