import { AuthError } from "@/features/auth/domain/auth-errors";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const event = "new-year-2027";
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

async function handle(request: Request) {
  if (process.env.DONATION_VOTE_ENABLED !== "true") return new Response(null, { status: 404, headers });
  try {
    const deps = createFanpageDependencies();
    const actor = await deps.authorize(request.headers.get("authorization"));
    const args = { p_user: actor.appUserId, p_event: event };
    if (request.method === "GET") {
      return Response.json(await deps.rpc("donation_vote_state", args), { headers });
    }
    const body = await request.json().catch(() => null);
    if (!body || !uuid.test(body.requestId) || !uuid.test(body.creatorId) ||
      !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 1500) {
      return new Response(null, { status: 400, headers });
    }
    const receipt = await deps.rpc("cast_donation_vote", {
      ...args, p_request: body.requestId, p_creator: body.creatorId, p_quantity: body.quantity,
    });
    return Response.json({ receipt }, { headers });
  } catch (error) {
    if (error instanceof AuthError) return new Response(null, { status: error.status, headers });
    const conflict = error instanceof Error && /VOTE_(LIMIT|UNAVAILABLE|REQUEST_CONFLICT)|INSUFFICIENT_BALANCE/.test(error.message);
    return new Response(null, { status: conflict ? 409 : 503, headers });
  }
}

export const GET = handle;
export const POST = handle;

export async function PATCH(request: Request) {
  if (process.env.DONATION_VOTE_ENABLED !== "true") return new Response(null, { status: 404, headers });
  try {
    const deps = createFanpageDependencies();
    const admin = await deps.authorizeAdmin(request.headers.get("authorization"), crypto.randomUUID());
    const body = await request.json().catch(() => null);
    if (body?.action === "approveUnderidolWinner") {
      if (!uuid.test(body.creatorId) || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(body.month) ||
        ![body.teamConsent, body.officialAccount].every(value =>
          typeof value === "string" && value.trim().length > 0 && value.length <= 1000)) {
        return new Response(null, { status: 400, headers });
      }
      await deps.rpc("approve_underidol_vote_winner", {
        p_admin: admin.appUserId, p_allowlist: admin.allowlistId, p_month: body.month,
        p_creator: body.creatorId, p_consent: body.teamConsent, p_account: body.officialAccount,
      });
      return new Response(null, { status: 204, headers });
    }
    if (!body || !uuid.test(body.creatorId) || typeof body.name !== "string" || body.name.length > 100) {
      return new Response(null, { status: 400, headers });
    }
    await deps.rpc("set_donation_vote_fandom", {
      p_admin: admin.appUserId, p_allowlist: admin.allowlistId, p_creator: body.creatorId, p_name: body.name,
    });
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return new Response(null, { status: error instanceof AuthError ? error.status : 503, headers });
  }
}
