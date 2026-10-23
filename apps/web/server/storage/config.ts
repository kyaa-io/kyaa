import { z } from "zod";
const schema = z.object({
  AWS_REGION: z.string().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/),
  S3_PUBLIC_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  S3_PRIVATE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  ASSET_PUBLIC_BASE_URL: z.url().refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash; }),
}).refine(value => value.S3_PUBLIC_BUCKET !== value.S3_PRIVATE_BUCKET, "public and private buckets must differ");
export type StorageConfig = z.infer<typeof schema>;
export function storageConfig(source: Record<string, string | undefined>): StorageConfig | null {
  if (source.AWS_STORAGE_ENABLED === undefined || source.AWS_STORAGE_ENABLED === "false") return null;
  if (source.AWS_STORAGE_ENABLED !== "true") throw new Error("AWS_STORAGE_ENABLED must be true or false");
  return schema.parse(source);
}
export const bucketPolicies = {
  "cms-assets": { public: true, maxBytes: 10485760, types: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "video/mp4"] },
  "fan-avatars": { public: false, maxBytes: 4194304, types: ["image/webp"] },
  "certification-proofs": { public: false, maxBytes: 3145728, types: ["image/webp"] },
  "fan-content-assets": { public: false, maxBytes: 8388608, types: ["image/webp"] },
  "mobile-media": { public: false, maxBytes: 52428800, types: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"] },
  "cheer-photocards": { public: false, maxBytes: 8388608, types: ["image/webp", "image/png", "image/jpeg"] },
} as const;
export function objectKey(bucket: string, path: string) {
  if (!(bucket in bucketPolicies) || !path || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === ".." || /[\x00-\x1f\x7f]/.test(part))) throw new Error("Invalid storage object");
  return `${bucket}/${path}`;
}
