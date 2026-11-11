import "server-only";
import { createClient } from "../../data/client";
import { loadServerEnv } from "../../config/env";

export interface IdentityRpc { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> }
export function identityDatabase(): IdentityRpc {
  const env = loadServerEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as IdentityRpc;
}
