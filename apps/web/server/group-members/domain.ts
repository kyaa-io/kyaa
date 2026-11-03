import { z } from "zod";
export const groupPeopleModeSchema=z.enum(["members","friends","ranking"]);
export type GroupPeopleMode=z.infer<typeof groupPeopleModeSchema>;
export const groupPeopleSchema=z.object({
 items:z.array(z.object({profileId:z.uuid(),nickname:z.string(),avatarUrl:z.string().nullable(),role:z.enum(["owner","manager","member"]),rank:z.number().int().positive().nullable(),points:z.number().int().nonnegative().nullable()})),
 nextCursor:z.uuid().nullable(),ranking:z.object({available:z.boolean(),reason:z.enum(["creator_required","threshold"]).nullable(),asOf:z.string(),fanCount:z.number().int().nonnegative()}).nullable(),
});
