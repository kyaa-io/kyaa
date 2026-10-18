import { z } from "zod";

export const participationPhaseSchema = z.enum(["before", "during", "after"]);
export const participationKindSchema = z.enum(["reservation", "waiting", "song", "text", "url", "image", "attendance", "choice", "quiz", "crew", "return", "bonus"]);
export const participationStateSchema = z.enum(["available", "pending", "approved", "rejected", "closed"]);
const uploads = z.array(z.uuid()).max(3);
const httpUrl = z.url().refine(value => ["https:", "http:"].includes(new URL(value).protocol));
export const participationPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reservation") }).strict(),
  z.object({ kind: z.literal("waiting") }).strict(),
  z.object({ kind: z.literal("song"), submissionId: z.uuid(), text: z.string().trim().max(2000).default(""), uploadIds: uploads.default([]) }).strict(),
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(5000), uploadIds: uploads.default([]) }).strict(),
  z.object({ kind: z.literal("url"), url: httpUrl, text: z.string().trim().max(2000).default(""), uploadIds: uploads.default([]) }).strict(),
  z.object({ kind: z.literal("image"), uploadIds: uploads.min(1), text: z.string().trim().max(2000).default("") }).strict(),
  z.object({ kind: z.literal("attendance"), code: z.string().trim().min(1).max(32) }).strict(),
  z.object({ kind: z.literal("choice"), answers: z.array(z.object({ questionId: z.uuid(), optionIds: z.array(z.uuid()).min(1).max(20) }).strict()).min(1).max(20) }).strict(),
  z.object({ kind: z.literal("quiz"), answers: z.array(z.object({ questionId: z.uuid(), optionIds: z.array(z.uuid()).min(1).max(20) }).strict()).min(1).max(20) }).strict(),
  z.object({ kind: z.literal("crew"), role: z.enum(["recording", "guidance", "highlights"]) }).strict(),
  z.object({ kind: z.literal("return") }).strict(),
]);
export const participationSubmitSchema = z.object({ missionId: z.uuid(), requestKey: z.uuid(), payload: participationPayloadSchema }).strict();
export const participationMissionSchema = z.object({
  id: z.uuid(), key: z.string(), kind: participationKindSchema, phase: participationPhaseSchema,
  title: z.string(), description: z.string(), opensAt: z.string(), closesAt: z.string(), points: z.number().int().nonnegative(),
  rewardMode: z.enum(["fixed", "attendance_highest"]),
  source: z.object({ surveyId: z.uuid().optional(), certificationMissionId: z.uuid().optional(), threadId: z.uuid().optional(), nextLiveSlug: z.string().optional() }),
  state: participationStateSchema, crewRole: z.enum(["recording", "guidance", "highlights"]).nullable().optional(), submittedAnswers: z.array(z.object({questionId: z.uuid(), optionIds: z.array(z.uuid())})).optional(), submittedText: z.string().nullable().optional(), submittedUrl: z.string().nullable().optional(), submissionId: z.uuid().nullable(), rejectionReason: z.string().nullable(), awardedPoints: z.number().int().nonnegative(),
  questions: z.array(z.object({ id: z.uuid(), prompt: z.string(), multiple: z.boolean(), options: z.array(z.object({ id: z.uuid(), label: z.string(), responseCount: z.number().int().nonnegative().optional() })) })).default([]),
  responseCount: z.number().int().nonnegative().default(0),
});
export const participationCatalogSchema = z.object({
  live: z.object({ id: z.uuid(), slug: z.string(), creatorSlug: z.string(), title: z.string(), startsAt: z.string(), endsAt: z.string().nullable(), status: z.string() }),
  phase: participationPhaseSchema, policy: z.object({ status: z.enum(["configured", "unconfigured"]), version: z.string().nullable() }),
  missions: z.array(participationMissionSchema), contributionPoints: z.number().int().nonnegative(),
});
export const participationResultSchema = z.object({ missionId: z.uuid(), sourceId: z.uuid(), state: z.enum(["pending", "approved", "rejected"]), awardedPoints: z.number().int().nonnegative(), replayed: z.boolean() });
export const participationSummarySchema = z.object({ celebrityId: z.uuid(), availablePoints: z.number().int().nonnegative().safe(), hearts: z.number().int().nonnegative().safe(), lifetimePoints: z.number().int().nonnegative().safe(), contributionPoints: z.number().int().nonnegative().safe(), sentHearts: z.number().int().nonnegative().safe(), freeDrawEntries: z.number().int().nonnegative().safe() });
export type ParticipationCatalog = z.infer<typeof participationCatalogSchema>;
export type ParticipationMission = z.infer<typeof participationMissionSchema>;
export type ParticipationSubmit = z.infer<typeof participationSubmitSchema>;
export type ParticipationResult = z.infer<typeof participationResultSchema>;

export const dashboardAggregateSchema = z.object({ approvedParticipation: z.number().int().nonnegative().safe(), participatingBroadcasts: z.number().int().nonnegative().safe(), sentHearts: z.number().int().nonnegative().safe(), process: z.object({ pending: z.number().int().nonnegative().safe(), approved: z.number().int().nonnegative().safe(), rejected: z.number().int().nonnegative().safe() }), asOf: z.string() });
export type PublicLiveDashboard = {
  database: ({ state: "available" } & z.infer<typeof dashboardAggregateSchema>) | { state: "unavailable" };
  onchain: { state: "unavailable" } | { state: "available"; asOf: string; blockTimestamp: string; metrics: { uniqueActiveWallets: number; actionCounts: Record<number, number>; passportCredentials: number; mintedCredentials: number; lifecycleTransactions: number; currentActionTransactions: number } };
};
