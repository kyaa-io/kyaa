import { z } from "zod";

const balance = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const walletSchema = z.object({
  sequence: balance, points: balance, hearts: balance, tickets: balance,
  policyVersion: z.literal("group-wallet-v1"), pointCost: z.literal(100), rewardsStartOn:z.iso.date().optional(), writeFenced: z.boolean(),
  attendance: z.object({ date: z.iso.date(), checkedIn: z.boolean(), streak: balance, nextBonusIn: z.number().int().min(1).max(7), days:z.array(z.object({date:z.iso.date(),points:z.union([z.literal(10),z.literal(30)])}).strict()).default([]) }).strict(),
}).strict();
export const exchangeInputSchema = z.object({ requestKey: z.uuid(), policyVersion: z.literal("group-wallet-v1"), target: z.enum(["heart", "ticket"]), units: z.number().int().min(1).max(1000), adSessionId: z.uuid().optional() }).strict();
export const adSessionInputSchema = z.object({}).strict();
export const adSessionReportInputSchema = z.object({ sessionId: z.uuid(), event: z.enum(["shown", "granted"]) }).strict();
export const adSessionSchema = z.object({ sessionId: z.uuid(), status: z.enum(["issued", "shown", "granted", "invalid"]), expiresAt: z.string().min(1) }).strict();
export const exchangeSchema = z.object({ requestKey: z.uuid(), target: z.enum(["heart", "ticket"]), units: balance, pointsSpent: balance, pointLedgerId: z.uuid(), creditLedgerId: z.uuid(), policyVersion: z.literal("group-wallet-v1"), createdAt: z.string().min(1), replayed: z.boolean() }).strict();
export const checkInSchema = z.object({ requestKey: z.uuid(), date: z.iso.date(), pointsAwarded: z.union([z.literal(10), z.literal(30)]), streak: z.number().int().min(1), ledgerId: z.uuid(), replayed: z.boolean() }).strict();
export const supportInputSchema = z.object({ requestKey: z.uuid(), policyVersion: z.literal("group-wallet-v1"), celebritySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120), units: z.number().int().min(1).max(1000) }).strict();
export const supportSchema = z.object({ requestKey: z.uuid(), celebrityId: z.uuid(), units: z.number().int().min(1).max(1000), voucherLedgerId: z.uuid(), policyVersion: z.literal("group-wallet-v1"), createdAt: z.string().min(1), replayed: z.boolean() }).strict();
export const requestSchema = z.discriminatedUnion("status", [z.object({ status: z.literal("unknown") }).strict(), z.object({ status: z.literal("legacy"), requiresOriginalContext: z.literal(true) }).strict(), z.object({ status: z.literal("committed"), result: z.union([exchangeSchema, checkInSchema, supportSchema]) }).strict()]);
export const historySchema = z.object({ entries: z.array(z.object({ id: z.uuid(), asset: z.enum(["fan_point", "support_voucher", "ticket"]), amount: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER), sourceType: z.string(), sourceId: z.uuid(), celebrityId: z.uuid().nullable(), createdAt: z.string().min(1) }).strict()) }).strict();
