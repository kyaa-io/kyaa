import { z } from "zod";
export const groupPeopleModeSchema=z.enum(["members","friends","ranking"]);
export type GroupPeopleMode=z.infer<typeof groupPeopleModeSchema>;
export const groupPeopleSchema=z.object({
 items:z.array(z.object({profileId:z.uuid(),nickname:z.string(),avatarUrl:z.string().nullable(),role:z.enum(["owner","manager","member"]),rank:z.number().int().positive().nullable(),points:z.number().int().nonnegative().nullable(),tier:z.string().nullable().optional(),hearts:z.number().int().nonnegative().nullable().optional()})),
 nextCursor:z.uuid().nullable(),ranking:z.object({available:z.boolean(),reason:z.enum(["creator_required","threshold"]).nullable(),asOf:z.string(),fanCount:z.number().int().nonnegative()}).nullable(),
});
/** Signed-out fan list. Strict on purpose: a field SQL adds later fails closed instead of reaching a visitor. */
export const GROUP_PUBLIC_PEOPLE_PAGE_LIMIT=30;
export const GROUP_PUBLIC_PEOPLE_MAX_OFFSET=270;
export const groupPublicPeopleSchema=z.object({
 items:z.array(z.object({nickname:z.string(),avatarUrl:z.string().nullable(),tier:z.string().nullable()}).strict()).max(GROUP_PUBLIC_PEOPLE_PAGE_LIMIT),
 nextOffset:z.number().int().positive().nullable(),
}).strict();
/** Asked for with ?hearts=1. The plain list above keeps its shape: the deployed web parses it strictly and refuses a new key. */
export const groupPublicPeopleHeartsSchema=z.object({
 items:z.array(z.object({nickname:z.string(),avatarUrl:z.string().nullable(),tier:z.string().nullable(),hearts:z.number().int().nonnegative().nullable()}).strict()).max(GROUP_PUBLIC_PEOPLE_PAGE_LIMIT),
 nextOffset:z.number().int().positive().nullable(),
}).strict();
export const groupPublicRoomsSchema=z.object({
 roomCount:z.number().int().nonnegative(),
 items:z.array(z.object({name:z.string(),minimumTier:z.string().nullable()}).strict()).max(50),
}).strict();
export const groupPublicRankingSchema=z.object({
 computedAt:z.string().nullable(),
 rows:z.array(z.object({rank:z.number().int().positive(),score:z.number().int().nonnegative(),nickname:z.string(),characterId:z.string()}).strict()).max(100),
 available:z.literal(false).optional(),
}).strict();
