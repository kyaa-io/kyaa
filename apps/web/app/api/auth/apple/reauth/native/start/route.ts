import { createReauthenticationDependencies, reauthenticationUnavailableResponse } from "@/server/auth/apple-notifications/reauthentication-dependencies";
import { startNativeReauthentication } from "@/server/auth/apple-notifications/native-reauthentication-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try { return await startNativeReauthentication(request, createReauthenticationDependencies()); }
  catch { return reauthenticationUnavailableResponse(); }
}
