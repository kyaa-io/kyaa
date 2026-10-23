import { publicRuntimeConfig } from "../../../../server/config/public-runtime-config";

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(publicRuntimeConfig(), { headers: { "cache-control": "no-store" } });
}
