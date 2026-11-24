import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createFanOperationsRouteDependencies } from "@/server/g5/fan-operations-route-dependencies";
import { createAccountDeletionDependencies } from "@/server/profile/account-deletion-dependencies";

export const dynamic = "force-dynamic";
const evidence = z.object({
  confirmation: z.uuid(),
  channel: z.literal("email"),
  receivedAt: z.iso.datetime({ offset: true }).refine(value => Date.parse(value) <= Date.now()),
}).strict();
const result = z.object({ status: z.enum(["pending", "completed"]), completedAt: z.string().nullable() });
const headers = { "cache-control": "private, no-store", vary: "Authorization" };

async function withdrawal(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await createFanOperationsRouteDependencies().authorize({
      authorization: request.headers.get("authorization") ?? "", correlationId: crypto.randomUUID(),
    });
    if (actor.role === "viewer") return Response.json({ error: "FORBIDDEN" }, { status: 403, headers });
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return Response.json({ error: "INVALID_MEMBER" }, { status: 400, headers });
    let body: z.infer<typeof evidence> | undefined;
    if (request.method === "POST") {
      const input = evidence.safeParse(await request.json().catch(() => null));
      if (!input.success || input.data.confirmation !== id) {
        return Response.json({ error: "CONFIRMATION_REQUIRED" }, { status: 400, headers });
      }
      body = input.data;
    }
    const data = await createAccountDeletionDependencies().rpc("admin_member_withdrawal", {
      p_actor: actor.appUserId, p_allowlist: actor.allowlistId, p_member: id,
      p_confirmation: body?.confirmation ?? null, p_received_at: body?.receivedAt ?? null,
      p_channel: body?.channel ?? null,
    });
    if (data === null) return Response.json({ error: "NOT_FOUND" }, { status: 404, headers });
    const deletion = result.parse(data);
    return Response.json({ deletion }, { headers, status: body && deletion.status === "pending" ? 202 : 200 });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 503;
    return Response.json({ error: status === 503 ? "UNAVAILABLE" : "ACCESS_DENIED" }, { status, headers });
  }
}

export { withdrawal as GET, withdrawal as POST };
