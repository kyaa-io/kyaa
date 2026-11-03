import { z } from "zod";

const key = { requestId: z.uuid() };
export const giftFields = {
  name: z.string().trim().min(1).max(100),
  imageAssetId: z.uuid(),
  quantity: z.number().int().min(1).max(100000),
  providerName: z.string().trim().min(1).max(120),
  fulfillmentMethod: z.enum(["digital", "physical_shipping", "on_site_pickup"]),
  fulfillmentDescription: z.string().trim().min(1).max(1000),
  conditions: z.string().trim().max(2000),
};
export const giftInputs = {
  submit: z.object({ ...key, ...giftFields }).strict(),
  revise: z.object({ ...key, ...giftFields, expectedRevision: z.number().int().min(1) }).strict(),
  review: z.object({ ...key, expectedRevision: z.number().int().min(1), decision: z.enum(["reviewing", "approved", "rejected", "changes_requested"]), reason: z.string().trim().max(1000) }).strict().refine(v => !["rejected", "changes_requested"].includes(v.decision) || v.reason.length > 0),
};
export type GroupGiftOperation = "list" | "detail" | "admin-list" | "admin-detail" | keyof typeof giftInputs;
