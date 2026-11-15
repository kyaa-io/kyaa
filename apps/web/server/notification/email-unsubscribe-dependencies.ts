import "server-only";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "../config/env";
import type { EmailUnsubscribeRouteDependencies } from "./email-unsubscribe-route";

export function emailUnsubscribeDependencies(): EmailUnsubscribeRouteDependencies {
  const env = loadServerEnv();
  return {
    keyHex: env.EMAIL_UNSUBSCRIBE_KEY,
    client: createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  };
}
