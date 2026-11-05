import { z } from "zod";

const balance = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
// exchangesRemainingToday is optional; an older bundle's strict walletSchema rejects it, so ship the app before the database function (migration 20261209260000).
export const walletSchema = z.object({
  sequence: balance, points: balance, tickets: balance,
  policyVersion: z.literal("group-wallet-v1"), pointCost: z.literal(100), rewardsStartOn:z.iso.date().optional(), writeFenced: z.boolean(), exchangesRemainingToday: balance.optional(),
  attendance: z.object({ date: z.iso.date(), checkedIn: z.boolean(), streak: balance, nextBonusIn: z.number().int().min(1).max(7), days:z.array(z.object({date:z.iso.date(),points:z.union([z.literal(10),z.literal(30)])}).strict()).default([]) }).strict(),
});
export const remainingSchema = z.object({ exchangesRemainingToday: balance }).strict();
export const exchangeInputSchema = z.object({ requestKey: z.uuid(), policyVersion: z.literal("group-wallet-v1"), target: z.literal("ticket"), units: z.number().int().min(1).max(1000), adSessionId: z.uuid().optional() }).strict();
export const adSessionInputSchema = z.object({}).strict();
export const adSessionReportInputSchema = z.object({ sessionId: z.uuid(), event: z.enum(["shown", "granted"]) }).strict();
export const adSessionSchema = z.object({ sessionId: z.uuid(), status: z.enum(["issued", "shown", "granted", "invalid"]), expiresAt: z.string().min(1) }).strict();
export const exchangeSchema = z.object({ requestKey: z.uuid(), target: z.literal("ticket"), units: balance, pointsSpent: balance, pointLedgerId: z.uuid(), creditLedgerId: z.uuid(), policyVersion: z.literal("group-wallet-v1"), createdAt: z.string().min(1), replayed: z.boolean() }).strict();
export const checkInSchema = z.object({ requestKey: z.uuid(), date: z.iso.date(), pointsAwarded: z.union([z.literal(10), z.literal(30)]), streak: z.number().int().min(1), ledgerId: z.uuid(), replayed: z.boolean() }).strict();
export const requestSchema = z.discriminatedUnion("status", [z.object({ status: z.literal("unknown") }).strict(), z.object({ status: z.literal("legacy"), requiresOriginalContext: z.literal(true) }).strict(), z.object({ status: z.literal("committed"), result: z.union([exchangeSchema, checkInSchema]) }).strict()]);
export const historySchema = z.object({ entries: z.array(z.object({ id: z.uuid(), asset: z.string().min(1), amount: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER), sourceType: z.string(), sourceId: z.uuid(), celebrityId: z.uuid().nullable(), createdAt: z.string().min(1) }).strict()) }).strict();
