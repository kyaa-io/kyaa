import "server-only";
import { createClient } from "@supabase/supabase-js";
import { loadServerEnv } from "@/server/config/env";
import { inquiryFailure } from "./fanmeeting-route";
import { createWaveRepository } from "./wave-repository";
import { createWaveHandler, waveCors } from "./wave-route";
export async function wavePost(request: Request, engagement = false) {
  try {
    const env = loadServerEnv();
    const database = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) },
    });
    return createWaveHandler({ repository: createWaveRepository(database), secret: env.SUPABASE_SERVICE_ROLE_KEY, vercel: process.env.VERCEL === "1", localDevelopment: process.env.NODE_ENV === "development" }, engagement)(request);
  } catch { return waveCors(request, inquiryFailure("INQUIRY_UNAVAILABLE")); }
}
