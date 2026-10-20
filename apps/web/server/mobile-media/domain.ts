import { z } from "zod";

export const MEDIA_BUCKET = "mobile-media";
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 60;

export const mediaKindSchema = z.enum(["image", "video"]);
export const mediaPurposeSchema = z.enum(["fan_post", "fan_clip", "dm", "certification", "participation", "support", "official_post", "wave_album", "wave_post"]);
export const mediaContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]);
export const reserveMediaSchema = z.object({
  kind: mediaKindSchema,
  purpose: mediaPurposeSchema,
  contentType: mediaContentTypeSchema,
  byteSize: z.number().int().positive().max(VIDEO_MAX_BYTES),
  requestId: z.uuid(),
}).strict().superRefine((value, context) => {
  if (value.kind === "image" && (!value.contentType.startsWith("image/") || value.byteSize > IMAGE_MAX_BYTES)) context.addIssue({ code: "custom", message: "Invalid image" });
  if (value.kind === "video" && !value.contentType.startsWith("video/")) context.addIssue({ code: "custom", message: "Invalid video" });
  if (value.purpose === "certification" && value.kind !== "image") context.addIssue({ code: "custom", message: "Certification requires an image" });
  if (value.purpose === "fan_post" && value.kind !== "image") context.addIssue({ code: "custom", message: "Fan posts require images" });
  if (value.purpose === "wave_post" && value.kind !== "video") context.addIssue({ code: "custom", message: "Wave posts require a video" });
  if (value.purpose === "support" && value.kind !== "image") context.addIssue({ code: "custom", message: "Support attachments require images" });
});

export const mediaStateSchema = z.enum(["uploading", "pending", "processing", "ready", "rejected", "cancelled"]);
export const ownedMediaSchema = z.object({
  assetId: z.uuid(), state: mediaStateSchema, kind: mediaKindSchema, purpose: mediaPurposeSchema,
  contentType: mediaContentTypeSchema, byteSize: z.number().int().positive(), assetVersion: z.number().int().positive(),
  width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable(), durationSeconds: z.number().nonnegative().nullable(),
  failureCode: z.string().nullable(), retryAt: z.iso.datetime({ offset: true }).nullable(), expiresAt: z.iso.datetime({ offset: true }),
}).strict();

export type OwnedMedia = z.infer<typeof ownedMediaSchema>;
