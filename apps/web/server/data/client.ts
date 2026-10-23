import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { PostgrestClient } from "@supabase/postgrest-js";
import { z } from "zod";
import { storageConfig } from "../storage/config";
import { S3Storage } from "../storage/s3-storage";

const sourceSchema = z.object({ POSTGREST_URL: z.url().refine(value => ["https:", "http:"].includes(new URL(value).protocol)).optional(), POSTGREST_SERVICE_TOKEN: z.string().min(40).optional() }).superRefine((value, ctx) => {
  if ((value.POSTGREST_URL === undefined) !== (value.POSTGREST_SERVICE_TOKEN === undefined)) ctx.addIssue({ code: "custom", message: "POSTGREST_URL and POSTGREST_SERVICE_TOKEN must be configured together" });
});
export type DataClient = Pick<SupabaseClient, "from" | "rpc" | "storage">;
export function createClient(url: string | undefined, key: string | undefined, options?: Parameters<typeof createSupabaseClient>[2]): DataClient {
  const source = sourceSchema.parse(process.env);
  const config = storageConfig(process.env);
  if ((url === undefined) !== (key === undefined)) throw new Error("Legacy database credentials must be configured together");
  const legacy = url && key ? createSupabaseClient(url, key, options) : undefined;
  if (!source.POSTGREST_URL || !source.POSTGREST_SERVICE_TOKEN) {
    if (!legacy) throw new Error("Database connection not configured");
    if (config) legacy.storage = new S3Storage(config, legacy) as unknown as typeof legacy.storage;
    return legacy;
  }
  const rest = new PostgrestClient(source.POSTGREST_URL, {
    headers: { Authorization: `Bearer ${source.POSTGREST_SERVICE_TOKEN}` },
    ...(options?.global?.fetch ? { fetch: options.global.fetch } : {}),
  });
  const database = { from: rest.from.bind(rest), rpc: rest.rpc.bind(rest) };
  const storage = config ? new S3Storage(config, database) as unknown as DataClient["storage"] : legacy?.storage;
  if (!storage) throw new Error("Storage connection not configured");
  return { ...database, storage };
}
