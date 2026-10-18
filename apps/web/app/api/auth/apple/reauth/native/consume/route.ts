import { createReauthenticationDependencies, reauthenticationUnavailableResponse } from "@/server/auth/apple-notifications/reauthentication-dependencies";
import { consumeNativeReauthentication } from "@/server/auth/apple-notifications/native-reauthentication-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try { return await consumeNativeReauthentication(request, createReauthenticationDependencies()); }
  catch { return reauthenticationUnavailableResponse(); }
}
