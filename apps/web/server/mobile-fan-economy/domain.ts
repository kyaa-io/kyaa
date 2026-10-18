import { z } from "zod";
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positive = count.refine(n => n > 0);
const uuid = z.uuid();
export const policySchema = z.object({ status: z.enum(["configured", "unconfigured"]) }).strict();
export const exchangePolicySchema = z.union([z.object({status:z.literal("unconfigured")}).strict(),z.object({status:z.literal("configured"),version:z.string(),freeDrawPointCost:positive.nullable(),freeVotePointCost:positive.nullable(),maxUnits:positive.max(1000),dailyRemaining:count.nullable()}).strict()]);
export const influencePolicySchema = z.union([z.object({status:z.literal("unconfigured")}).strict(),z.object({status:z.literal("configured"),version:z.string(),freeEnabled:z.boolean(),paidEnabled:z.boolean(),maxUnits:positive.max(1000),influenceAlgorithm:z.string().nullable(),maxPaidInfluenceBps:count.max(2000).nullable()}).strict()]);
export const walletSchema = z.object({ celebrityId: uuid, fanPoints: count, freeDrawEntries: count, freeVotes: count, paidVotes: z.object({ available: count, held: count }).strict(), legacyPaidDraw: count, policy: exchangePolicySchema }).strict();
export const historySchema = z.object({ entries: z.array(z.object({ id: uuid, asset: z.enum(["fan_point", "free_vote", "paid_vote"]), amount: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER), sourceType: z.string(), sourceId: uuid, createdAt: z.string() }).strict()) }).strict();
export const missionsSchema = z.object({ celebrityId: uuid, policy: policySchema, missions: z.array(z.object({ key: z.string(), status: z.enum(["available", "awarded", "processing"]), pointAmount: positive, policyVersion: z.string(), sourceId: uuid.nullable(), ledgerId: uuid.nullable() }).strict()) }).strict();
export const exchangeSchema = z.object({ requestKey: uuid, celebrityId: uuid, target: z.enum(["free_draw", "free_vote", "support_voucher"]), units: positive, pointsSpent: positive, pointLedgerId: uuid, creditLedgerId: uuid, policyVersion: z.string(), createdAt: z.string(), replayed: z.boolean() }).strict();
export const voteSchema = z.object({ requestKey: uuid, projectId: uuid, celebrityId: uuid, source: z.enum(["free", "paid"]), quantity: positive, ledgerId: uuid, policyVersion: z.string(), createdAt: z.string(), replayed: z.boolean() }).strict();
export const cancelledSchema = z.object({status:z.literal("cancelled"),requestKey:z.uuid(),operation:z.enum(["exchange","vote","vote_intent","support"])}).strict();
export const unknownSchema = z.object({ status: z.literal("unknown") }).strict();
export const projectSchema = z.object({ id: uuid, celebrityId: uuid, title: z.string(), summary: z.string(), imageUrl: z.string().nullable(), securedBudgetKrw: count, announcedAmountKrw: count.nullable(), opensAt: z.string(), closesAt: z.string(), status: z.enum(["open", "closed", "delivered"]), freeVotes: count, paidVotes: count, goal: positive.nullable(), influencePolicy: influencePolicySchema, deliveryEvidenceUrl: z.string().nullable() }).strict();
export const projectsSchema = z.object({ items: z.array(projectSchema) }).strict();
export const voteProductSchema = z.object({ productId: z.string(), currency: z.literal("KRW"), voteQuantity: positive, policyVersion: z.string(), entitlementKind: z.literal("paid_vote") }).strict();
export const voteProductsSchema = z.object({ policy: policySchema, products: z.array(voteProductSchema) }).strict();
export const voteIntentSchema = z.object({ id: uuid, requestKey: uuid, celebrityId: uuid, store: z.enum(["apple", "google"]), environment: z.literal("sandbox"), productId: z.string(), currency: z.literal("KRW"), voteQuantity: positive, policyVersion: z.string(), entitlementKind: z.literal("paid_vote"), appAccountToken: uuid.nullable(), obfuscatedProfileId: uuid.nullable(), createdAt: z.string(), replayed: z.boolean() }).strict();
export const voteTransactionSchema = z.object({ store: z.enum(["apple", "google"]), environment: z.enum(["sandbox", "production"]), transactionId: z.string(), intentId: uuid.nullable(), entitlementKind: z.literal("paid_vote"), celebrityId: uuid.nullable(), productId: z.string(), voteQuantity: positive.nullable(), policyVersion: z.string().nullable(), state: z.enum(["pending", "granted", "revoked"]), pendingReason: z.string().nullable(), amountKrw: positive.nullable(), refundedKrw: count, availableVotes: count, heldVotes: count, finishAllowed: z.boolean(), consumeAllowed: z.boolean(), verifiedAt: z.string() }).strict();
import {fanRewardSchema} from "@/features/rewards/domain/fan-reward";
export {fanRewardSchema};

export const cancellationSchema = z.union([cancelledSchema,z.object({status:z.literal("committed"),result:z.union([exchangeSchema,voteSchema,voteIntentSchema])}).strict()]);

export const supportExchangePolicySchema = z.union([exchangePolicySchema.options[0], exchangePolicySchema.options[1].extend({supportVoucherPointCost:z.literal(100).nullable(),supportVoucherAmountKrw:z.literal(100).nullable()}).strict()]);
export const supportWalletSchema = walletSchema.extend({supportVouchers:count,fanPointLedgerSequence:count,policy:supportExchangePolicySchema}).strict();
export const supportHistorySchema = z.object({entries:z.array(historySchema.shape.entries.element.extend({asset:z.enum(["fan_point","free_vote","paid_vote","support_voucher"])}).strict())}).strict();
export const supportSchema = z.object({requestKey:uuid,celebrityId:uuid,units:positive.max(1000),supportKrw:positive,voucherLedgerId:uuid,policyVersion:z.string(),createdAt:z.string(),replayed:z.boolean()}).strict().refine(v=>v.supportKrw===v.units*100);
const supportTotals = {supportUnits:count,supportKrw:count};
export const supportRankingsSchema = z.object({items:z.array(z.object({rank:positive,celebrityId:uuid,celebritySlug:z.string(),name:z.string(),imageUrl:z.string().nullable(),...supportTotals}).strict()),nextOffset:count.nullable()}).strict();
const fanSupportRankSchema = z.object({rank:positive,profileId:uuid,nickname:z.string(),avatarUrl:z.string().nullable(),...supportTotals}).strict();
export const fanSupportRankingsSchema = z.object({celebrityId:uuid,items:z.array(fanSupportRankSchema),me:z.object({rank:positive.nullable(),...supportTotals}).strict(),nextOffset:count.nullable()}).strict();
export const supportCancellationSchema = z.union([cancelledSchema,z.object({status:z.literal("committed"),result:z.union([exchangeSchema,voteSchema,voteIntentSchema,supportSchema])}).strict()]);

export const supportRewardEnvelopeSchema = z.object({reward:fanRewardSchema,ledgerSequence:count.nullable(),newlyAwarded:z.boolean()}).strict().refine(v=>!v.newlyAwarded||(v.ledgerSequence!==null&&v.reward.asset==="fan_point"&&v.reward.status==="awarded"&&v.reward.amount>0));

export const earningActionKeys = ["verification","reaction","comment","checkin","certification","membership_instagram","membership_tiktok","membership_youtube","share","live_reservation","live_attendance","mission_completion","first_clip","journey_completion","invitation_milestone"] as const;
export const activitySourceTypes = ["fan_post_likes","fan_clip_likes","celebrity_notice_likes","fan_lounge_messages","celebrity_notice_comments","fan_posts","fan_post_comments","fan_clip_comments","quiz_attempts","live_survey_responses"] as const;
export const earningStatusSchema = z.object({celebrityId:uuid,policy:z.object({status:z.enum(["configured","unconfigured"]),version:z.string().min(1).max(80).nullable()}).strict(),actions:z.array(z.object({key:z.enum(earningActionKeys),pointAmount:count,scope:z.enum(["daily","lifetime","source"]),dailyLimit:count.nullable(),usedToday:count,remainingToday:count.nullable(),lifetimeLimit:count.nullable(),lifetimeUsed:count,status:z.enum(["available","daily_limit","lifetime_limit","disabled","not_eligible"]),sourceId:uuid.nullable(),ledgerId:uuid.nullable()}).strict()).max(15)}).strict().refine(v=>new Set(v.actions.map(a=>a.key)).size===v.actions.length&&(v.policy.status==="configured"?v.policy.version!==null:v.policy.version===null&&v.actions.length===0));
export const activitySourceSchema = z.object({sourceId:uuid.nullable()}).strict();
