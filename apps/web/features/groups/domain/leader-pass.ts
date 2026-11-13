import { z } from "zod";

/** 패스 토큰: 32바이트를 base64url로 쓴 43자. */
export const LEADER_PASS_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const leaderPassCheckSchema = z.object({ valid: z.boolean(), label: z.string().optional() });
export const leaderPassListSchema = z.object({
  items: z.array(z.object({
    id: z.uuid(),
    label: z.string(),
    status: z.enum(["active", "used", "expired", "revoked"]),
    createdAt: z.string(),
    expiresAt: z.string(),
    usedAt: z.string().nullable(),
    pageId: z.uuid().nullable(),
    pageName: z.string().nullable(),
  })),
});
export const leaderPassIssuedSchema = z.object({ id: z.uuid(), label: z.string(), expiresAt: z.string(), token: z.string().regex(LEADER_PASS_TOKEN), path: z.string() });
export const leaderPassOpenedSchema = z.object({ pageId: z.uuid() });
export type LeaderPassItem = z.infer<typeof leaderPassListSchema>["items"][number];
