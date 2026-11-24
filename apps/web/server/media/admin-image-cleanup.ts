import "server-only";
import { readFile } from "node:fs/promises";
import { CloudFrontClient, CreateInvalidationCommand } from "@aws-sdk/client-cloudfront";
import { z } from "zod";
import { correlation, json, mapError } from "../certification/certification-http";
import { S3Storage } from "../storage/s3-storage";
import { createPublicImageRouteDependencies } from "./public-image-dependencies";

const sourceIndex = z.record(z.string(), z.array(z.string()));
type Asset = { id: string; content_sha256: string };
export async function handleImageCleanup(request: Request) {
  try {
    const { authorize, database } = createPublicImageRouteDependencies();
    const correlationId = correlation(request);
    const actor = await authorize({ authorization: request.headers.get("authorization") ?? "", correlationId });
    const params = new URL(request.url).searchParams;
    const writing = request.method === "DELETE";
    if (writing && actor.role === "viewer") return json({ error: "FORBIDDEN" }, 403);
    const index = sourceIndex.parse(JSON.parse(await readFile("public-image-source-index.json", "utf8")));
    const args = { p_actor: actor.appUserId, p_allowlist: actor.allowlistId };
    if (!writing) {
      const offset = Number(params.get("offset") ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0) return json({ error: "INVALID_OFFSET" }, 400);
      const { data, error } = await database.rpc("admin_unused_image_assets", { ...args, p_offset: offset });
      if (error) throw error;
      return json({ items: data.map((asset: Asset) => ({ ...asset, sources: [...new Set([...(index[asset.id] ?? []), ...(index[asset.content_sha256] ?? [])])] })) });
    }
    const id = z.uuid().safeParse(params.get("id"));
    if (!id.success) return json({ error: "INVALID_ID" }, 400);
    const storage = database.storage;
    if (!(storage instanceof S3Storage)) return json({ error: "STORAGE_UNAVAILABLE" }, 503);
    const { data: asset, error: readError } = await database.from("public_image_assets").select("content_sha256").eq("id", id.data).maybeSingle();
    if (readError) throw readError;
    if (!asset) return json({ error: "NOT_FOUND" }, 404);
    const sources = Object.fromEntries([asset.content_sha256, id.data.toLowerCase()].map(key => [key, index[key] ?? []]));
    const { data, error } = await database.rpc("admin_delete_image_asset", { ...args, p_id: id.data, p_correlation: correlationId, p_sources: sources });
    if (error) throw error;
    if (data.status !== 200) return json(data, data.status);
    try {
      await storage.finishQueuedDelete(data.bucket, data.path, data.generation);
    } catch {
      return json({ storage: "pending", cache: "remaining" }, 202);
    }
    try {
      await new CloudFrontClient({ region: "us-east-1" }).send(new CreateInvalidationCommand({
        DistributionId: process.env.ASSET_CLOUDFRONT_DISTRIBUTION_ID,
        InvalidationBatch: { CallerReference: crypto.randomUUID(), Paths: { Quantity: 1, Items: [`/public-assets/${data.bucket}/${data.path}*`] } },
      }));
      return json({ storage: "deleted", cache: "requested" });
    } catch {
      return json({ storage: "deleted", cache: "remaining" });
    }
  } catch (error) { return mapError(error); }
}
