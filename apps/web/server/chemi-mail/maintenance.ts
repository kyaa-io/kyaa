import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/server/data/client";
import { loadServerEnv } from "@/server/config/env";
import { cronOwnerResponse } from "@/server/cron/owner";
import { runChemiMaintenance } from "@byus/chemi-maintenance";

export async function chemiMaintenanceRoute(request: Request) {
  const ownership = cronOwnerResponse(request);
  if (ownership) return ownership;
  const headers = { "cache-control": "no-store" };
  const secret = process.env.CRON_SECRET;
  const authorization = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
    return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
  }
  try {
    const result = await runChemiMaintenance(async (name, args) => {
      const env = loadServerEnv();
      const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { data, error } = await db.rpc(name, args);
      if (error) throw new Error("CHEMI_MAIL_QUEUE_UNAVAILABLE");
      return data;
    }, process.env);
    return Response.json(result, { headers });
  } catch {
    return Response.json({ error: { code: "CHEMI_MAINTENANCE_UNAVAILABLE" } }, { status: 503, headers });
  }
}
