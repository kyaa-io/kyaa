import { z } from "zod";
const nullableString = z.string().nullable();
export const groupEventSchema = z.object({
  id: z.uuid(), title: z.string(), description: z.string(), imageUrl: nullableString,
  startsAt: z.string(), endsAt: z.string(), opensAt: z.string(), closesAt: z.string(), location: z.string(),
  capacity: z.number().int().positive().nullable(), requiresApproval: z.boolean(), state: z.enum(["draft", "published", "cancelled", "ended"]), revision: z.number().int().positive(), official: z.boolean(),
  entryStatus: z.enum(["none", "pending", "confirmed", "rejected", "cancelled"]), ticketAvailable: z.boolean(),
}).strict();
export const groupMissionSchema = z.object({ id: z.uuid(), title: z.string(), instructions: z.string(), imageUrl: nullableString, state: z.enum(["draft", "published", "closed"]), revision: z.number().int().positive(), rewardPoints: z.number().int().nonnegative(), status: z.enum(["available", "pending", "rejected", "completed"]), actionHref: z.string() }).strict();
export const groupActivitiesSchema = z.object({ certificationHref: nullableString, missions: z.array(groupMissionSchema), events: z.array(groupEventSchema), raffles: z.array(z.record(z.string(), z.unknown())) }).strict();
export const groupEventsSchema = z.object({ events: z.array(groupEventSchema), canManage: z.boolean(), nextCursor: z.uuid().nullable() }).strict();
export const groupEventDetailSchema = z.object({ event: groupEventSchema, participation: z.object({ status: z.enum(["none", "pending", "confirmed", "rejected", "cancelled"]), ticketId: z.uuid().nullable(), checkedInAt: nullableString }).strict(), canApply: z.boolean(), canReview: z.boolean(), canManage: z.boolean() }).strict();
export const groupCollectionsSchema = z.object({ items: z.array(z.object({ id: z.uuid(), title: z.string(), imageUrl: nullableString, externalUrl: z.url(), status: z.enum(["active", "sold_out", "hidden"]), revision: z.number().int().positive() }).strict()), canManage: z.boolean(), nextCursor: z.uuid().nullable() }).strict();
export const groupMissionsSchema = z.object({ missions: z.array(groupMissionSchema), canManage: z.boolean(), nextCursor: z.uuid().nullable() }).strict();
export const groupMissionDetailSchema = z.object({ mission: groupMissionSchema, submission: z.object({ id: z.uuid(), body: z.string(), status: z.enum(["pending", "rejected", "completed"]), reason: nullableString, rewardPoints: z.number().int().nonnegative() }).strict().nullable(), canSubmit: z.boolean(), canReview: z.boolean() }).strict();
export const groupTicketSchema = z.object({ qrPayload: z.string().regex(/^kyaa-event:[0-9a-f-]{36}:[0-9a-f]{64}$/), status: z.enum(["valid", "checked_in"]) }).strict();
export type GroupEvent = z.infer<typeof groupEventSchema>;
export type GroupMission = z.infer<typeof groupMissionSchema>;
export type GroupActivities = z.infer<typeof groupActivitiesSchema>;

export const groupParticipantsSchema = z.object({ items: z.array(z.object({ id: z.uuid(), appUserId: z.uuid(), nickname: z.string(), avatarUrl: nullableString, status: z.enum(["pending", "confirmed", "rejected", "cancelled"]), checkedInAt: nullableString }).strict()), nextCursor: z.uuid().nullable() }).strict();
export const groupSubmissionsSchema = z.object({ items: z.array(z.object({ id: z.uuid(), appUserId: z.uuid(), nickname: z.string(), avatarUrl: nullableString, body: z.string(), status: z.enum(["pending", "rejected", "completed"]), reason: nullableString, rewardPoints: z.number().int().nonnegative() }).strict()), nextCursor: z.uuid().nullable() }).strict();
export const groupCheckInSchema=z.object({status:z.literal("checked_in"),registrationId:z.uuid(),checkedInAt:z.string(),alreadyCheckedIn:z.boolean(),replayed:z.boolean()}).strict();
export const groupOfficialApplicationsSchema=z.object({items:z.array(z.object({id:z.uuid(),eventId:z.uuid(),eventRevision:z.number().int().positive(),description:z.string(),sourceUrl:nullableString,status:z.enum(["submitted","reviewing","changes_requested","approved","rejected"]),reason:nullableString,createdAt:z.string(),reviewedAt:nullableString,previousApplicationId:z.uuid().nullable()}).strict()),nextCursor:z.uuid().nullable()}).strict();
export const groupEventSupportSubmissionSchema=z.object({id:z.uuid(),eventId:z.uuid(),revision:z.number().int().positive(),description:z.string(),sourceUrl:z.url(),status:z.enum(["submitted","changes_requested","approved"]),reason:nullableString,createdAt:z.string(),reviewedAt:nullableString,previousSubmissionId:z.uuid().nullable()}).strict();
export const groupEventSupportSchema=z.object({attendanceCount:z.number().int().nonnegative(),reviewCount:z.number().int().nonnegative(),items:z.array(groupEventSupportSubmissionSchema),nextCursor:z.uuid().nullable()}).strict();
