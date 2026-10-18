import { createAccountDeletionDependencies } from "@/server/profile/account-deletion-dependencies";
import { AuthError } from "@/features/auth/domain/auth-errors";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
export async function GET(request: Request) {
  try {
    const deps = createAccountDeletionDependencies();
    const subject = await deps.verifySubject(request.headers.get("authorization"));
    const deletion = subject.startsWith("supabase-email:")
      ? await deps.rpc("mobile_get_email_account_deletion_status", { p_supabase_user_id: subject.slice(15) })
      : await deps.rpc("mobile_get_account_deletion_status_by_subject", { p_privy_user_id: subject });
    return Response.json({ deletion }, { headers });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 503;
    return Response.json({ error: { code: error instanceof AuthError ? error.code : "ACCOUNT_DELETION_UNAVAILABLE" } }, { status, headers });
  }
}
