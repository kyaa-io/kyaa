import { createHash } from "node:crypto";
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bucketPolicies, objectKey, type StorageConfig } from "./config";

type Database = Pick<SupabaseClient, "rpc">;
type UploadOptions = { contentType?: string; cacheControl?: string; upsert?: boolean; metadata?: Record<string, unknown>; signal?: AbortSignal };
function failure(error: unknown) {
  const status = error && typeof error === "object" && "$metadata" in error ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode : undefined;
  return { data: null, error: { message: status === 412 ? "Object already exists" : "Storage unavailable", statusCode: String(status === 412 ? 409 : status ?? 503) } };
}
export class S3Storage {
  constructor(readonly config: StorageConfig, private readonly database: Database, private readonly s3 = new S3Client({ region: config.AWS_REGION, requestChecksumCalculation: "WHEN_REQUIRED" })) {}
  private location(bucket: string, path: string) {
    const Key = objectKey(bucket, path), policy = bucketPolicies[bucket as keyof typeof bucketPolicies];
    return { Bucket: policy.public ? this.config.S3_PUBLIC_BUCKET : this.config.S3_PRIVATE_BUCKET, Key: policy.public ? `public-assets/${Key}` : Key };
  }
  private async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.database.rpc(name, args);
    if (error) throw new Error("Storage metadata unavailable");
    return data;
  }
  from(bucket: string) {
    objectKey(bucket, "validation");
    return {
      upload: async (path: string, body: Uint8Array | ArrayBuffer | Blob | string, options: UploadOptions = {}) => {
        try {
          const bytes = typeof body === "string" ? Buffer.from(body) : body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : body instanceof Uint8Array ? Buffer.from(body) : Buffer.from(body);
          const policy = bucketPolicies[bucket as keyof typeof bucketPolicies];
          const type = options.contentType ?? "application/octet-stream";
          if (!bytes.length || bytes.length > policy.maxBytes || !(policy.types as readonly string[]).includes(type)) throw new Error("Invalid storage upload");
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          await this.rpc("reserve_s3_storage_object", { p_bucket: bucket, p_path: path, p_content_type: type, p_size: bytes.length, p_sha256: sha256 });
          await this.s3.send(new PutObjectCommand({ ...this.location(bucket, path), Body: bytes, ContentType: type, ContentLength: bytes.length, CacheControl: policy.public ? options.cacheControl : "private, no-store", Metadata: { sha256 }, ...(options.upsert ? {} : { IfNoneMatch: "*" }) }), { abortSignal: options.signal ?? AbortSignal.timeout(60_000) });
          await this.rpc("confirm_s3_storage_object", { p_bucket: bucket, p_path: path, p_content_type: type, p_size: bytes.length, p_sha256: sha256 });
          return { data: { path, fullPath: `${bucket}/${path}`, id: path }, error: null };
        } catch (error) { return failure(error); }
      },
      download: async (path: string) => {
        try {
          const response = await this.response(bucket, path);
          if (!response.ok) return { data: null, error: { message: "Storage unavailable", statusCode: String(response.status) } };
          return { data: await response.blob(), error: null };
        } catch (error) { return failure(error); }
      },
      remove: async (paths: string[]) => {
        try {
          for (const path of paths) {
            const location = this.location(bucket, path);
            const generation = await this.rpc("queue_s3_storage_delete", { p_bucket: bucket, p_path: path }) as number;
            let succeeded = false;
            try { await this.s3.send(new DeleteObjectCommand(location)); succeeded = true; }
            finally { await this.rpc("finish_s3_storage_delete", { p_bucket: bucket, p_path: path, p_generation: generation, p_succeeded: succeeded }); }
          }
          return { data: paths.map(name => ({ name })), error: null };
        } catch (error) { return failure(error); }
      },
      getPublicUrl: (path: string) => {
        this.location(bucket, path);
        if (!bucketPolicies[bucket as keyof typeof bucketPolicies].public) throw new Error("Private objects have no public URL");
        return { data: { publicUrl: `${this.config.ASSET_PUBLIC_BASE_URL.replace(/\/$/, "")}/${objectKey(bucket, path).split("/").map(encodeURIComponent).join("/")}` } };
      },
      createSignedUrl: async (path: string, expiresIn: number) => {
        try {
          if (!Number.isSafeInteger(expiresIn) || expiresIn < 1 || expiresIn > 7200) throw new Error("Invalid signed URL lifetime");
          return { data: { signedUrl: await getSignedUrl(this.s3, new GetObjectCommand(this.location(bucket, path)), { expiresIn }) }, error: null };
        } catch (error) { return failure(error); }
      },
      createSignedUploadUrl: async (path: string) => {
        try {
          if (bucket !== "mobile-media") throw new Error("Signed upload requires a mobile media reservation");
          const reservation = await this.rpc("reserve_s3_mobile_upload", { p_path: path }) as { contentType: string; byteSize: number };
          if (!reservation || !(bucketPolicies["mobile-media"].types as readonly string[]).includes(reservation.contentType) || !Number.isSafeInteger(reservation.byteSize) || reservation.byteSize < 1 || reservation.byteSize > bucketPolicies["mobile-media"].maxBytes) throw new Error("Invalid upload reservation");
          const signedUrl = await getSignedUrl(this.s3, new PutObjectCommand({ ...this.location(bucket, path), ContentType: reservation.contentType, ContentLength: reservation.byteSize, IfNoneMatch: "*" }), { expiresIn: 7200, signableHeaders: new Set(["content-type", "content-length", "if-none-match"]) });
          const expiry = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 7200 })).toString("base64url");
          return { data: { signedUrl, path, token: `s3.${expiry}.presigned` }, error: null };
        } catch (error) { return failure(error); }
      },
    };
  }
  async response(bucket: string, path: string, init: { method?: string; range?: string | null; signal?: AbortSignal } = {}): Promise<Response> {
    const location = this.location(bucket, path);
    const signal = init.signal ?? AbortSignal.timeout(60_000);
    try {
      const object = await this.database.rpc("get_s3_storage_object_state", { p_bucket: bucket, p_path: path });
      if (object.error) throw new Error("Storage metadata unavailable");
      if (object.data === "delete_pending" || object.data === "deleted") return new Response(null, { status: 404 });
      const result = init.method === "HEAD" ? await this.s3.send(new HeadObjectCommand(location), { abortSignal: signal }) : await this.s3.send(new GetObjectCommand({ ...location, ...(init.range ? { Range: init.range } : {}) }), { abortSignal: signal });
      if (!init.range && result.ContentType && result.ContentLength !== undefined) {
        if (object.data === "uploading") await this.rpc("confirm_s3_storage_object", { p_bucket: bucket, p_path: path, p_content_type: result.ContentType, p_size: result.ContentLength, p_sha256: result.Metadata?.sha256 ?? null });
      }
      const headers = new Headers({ "content-type": result.ContentType ?? "application/octet-stream", "accept-ranges": "bytes", "cache-control": bucketPolicies[bucket as keyof typeof bucketPolicies].public ? result.CacheControl ?? "public, max-age=60" : "private, no-store" });
      if (result.ContentLength !== undefined) headers.set("content-length", String(result.ContentLength));
      if (result.ETag) headers.set("etag", result.ETag);
      if ("ContentRange" in result && result.ContentRange) headers.set("content-range", String(result.ContentRange));
      const body = "Body" in result && result.Body ? result.Body.transformToWebStream() : null;
      return new Response(init.method === "HEAD" ? null : body, { status: headers.has("content-range") ? 206 : 200, headers });
    } catch (error) {
      if (signal.aborted) throw error;
      const status = Number(failure(error).error.statusCode);
      return new Response(null, { status: [404, 416].includes(status) ? status : 503 });
    }
  }
  async drainDeletes(limit = 10) {
    const claims = await this.rpc("claim_s3_storage_deletes", { p_limit: Math.min(limit, 100) }) as Array<{ bucket: string; path: string; generation: number }>;
    let failed = false;
    for (const claim of claims ?? []) {
      let succeeded = false;
      try { await this.s3.send(new DeleteObjectCommand(this.location(claim.bucket, claim.path))); succeeded = true; } catch { failed = true; }
      await this.rpc("finish_s3_storage_delete", { p_bucket: claim.bucket, p_path: claim.path, p_generation: claim.generation, p_succeeded: succeeded });
    }
    if (failed) throw new Error("Storage deletion queued for retry");
  }
}
