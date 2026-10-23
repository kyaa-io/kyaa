import type { SupabaseClient } from "@supabase/supabase-js";
import { S3Storage } from "./s3-storage";
export type StorageConnection = { database: Pick<SupabaseClient, "storage">; url: string | undefined; key: string | undefined };
export function storageObjectResponse(connection: StorageConnection, bucket: string, path: string, init: { method?: string; range?: string | null; signal?: AbortSignal } = {}) {
  if (connection.database.storage instanceof S3Storage) return connection.database.storage.response(bucket, path, init);
  if (!connection.url || !connection.key) throw new Error("Legacy storage connection not configured");
  if (!connection.url || !connection.key) throw new Error("Supabase storage configuration is missing");
  const url = `${connection.url.replace(/\/$/, "")}/storage/v1/object/authenticated/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
  return fetch(url, { method: init.method ?? "GET", headers: { apikey: connection.key, authorization: `Bearer ${connection.key}`, ...(init.range ? { range: init.range } : {}) }, cache: "no-store", ...(init.signal ? { signal: init.signal } : {}) });
}
export async function retryStorageDeletes(database: Pick<SupabaseClient, "storage">) {
  if (database.storage instanceof S3Storage) await database.storage.drainDeletes();
}
