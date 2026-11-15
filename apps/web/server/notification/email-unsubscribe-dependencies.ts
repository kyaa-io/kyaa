import "server-only";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "../config/env";
import { deriveEmailUnsubscribeKey, emailUnsubscribeKeyTag } from "./email-unsubscribe-token";
import type { EmailUnsubscribeRouteDependencies } from "./email-unsubscribe-route";

let logged = false;

/** The link key comes from the PostgREST service token the worker also holds (see the worker's email-unsubscribe.ts). */
export function emailUnsubscribeKey(env: { POSTGREST_SERVICE_TOKEN?: string | undefined }): Buffer | null {
  const key = deriveEmailUnsubscribeKey(env.POSTGREST_SERVICE_TOKEN);
  if (!logged) {
    logged = true;
    if (key) console.info(`email unsubscribe key tag=${emailUnsubscribeKeyTag(key)}`);
    else console.error("EMAIL_UNSUBSCRIBE_UNAVAILABLE: no signing secret; unsubscribe links cannot be checked");
  }
  return key;
}

export function emailUnsubscribeDependencies(): EmailUnsubscribeRouteDependencies {
  const env = loadServerEnv();
  return {
    key: emailUnsubscribeKey(env),
    client: createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
  };
}
