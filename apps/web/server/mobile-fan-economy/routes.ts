import "server-only";
import { z } from "zod";
import {APP_LOCALES,toContentLocale} from "@/i18n/locales";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
import type { VerifiedStoreTransaction } from "@/server/mobile-store/domain";
import { AppleStoreVerificationError } from "@/server/mobile-store/apple-verifier";
import { GoogleStoreVerificationError } from "@/server/mobile-store/google-verifier";
import { earningStatusSchema, activitySourceSchema, activitySourceTypes, supportRewardEnvelopeSchema, fanRewardSchema, supportCancellationSchema, supportSchema, supportWalletSchema, supportHistorySchema, supportRankingsSchema, fanSupportRankingsSchema, cancelledSchema, exchangeSchema, historySchema, missionsSchema, projectSchema, projectsSchema, unknownSchema, voteIntentSchema, voteProductsSchema, voteSchema, voteTransactionSchema, walletSchema } from "./domain";
export interface FanEconomyDependencies {
 publicOrigin?: string;
 authorize(authorization: string | null): Promise<{ appUserId: string }>;
 rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
 verifyApple(signed: string): Promise<VerifiedStoreTransaction>;
 verifyGoogle(token: string, productId: string): Promise<VerifiedStoreTransaction>;
}
const headers = { "cache-control": "private, no-store", vary: "Authorization, X-Kyaa-Asset-Contract" };
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120), version = z.string().min(1).max(80), units = z.number().int().min(1).max(1000);
const exchangeBody = z.object({ requestKey: z.uuid(), celebritySlug: slug, target: z.enum(["free_draw", "free_vote", "support_voucher"]), policyVersion: version, units }).strict();
const supportBody = z.object({requestKey:z.uuid(),celebritySlug:slug,policyVersion:version,units}).strict();
const voteBody = z.object({ requestKey: z.uuid(), policyVersion: version, source: z.enum(["free", "paid"]), quantity: units }).strict();
const intentBody = z.object({ requestKey: z.uuid(), celebritySlug: slug, store: z.enum(["apple", "google"]), productId: z.string().min(1).max(200), policyVersion: version }).strict();
const cancelBody = z.discriminatedUnion("operation",[
 z.object({operation:z.literal("support"),input:supportBody.omit({requestKey:true})}).strict(),
 z.object({operation:z.literal("exchange"),input:exchangeBody.omit({requestKey:true})}).strict(),
 z.object({operation:z.literal("vote"),input:voteBody.omit({requestKey:true}).extend({projectId:z.uuid()}).strict()}).strict(),
 z.object({operation:z.literal("vote_intent"),input:intentBody.omit({requestKey:true})}).strict(),
]);
const verifyBody = z.discriminatedUnion("store", [z.object({ store: z.literal("apple"), signedTransactionInfo: z.string().min(1).max(65536) }).strict(), z.object({ store: z.literal("google"), purchaseToken: z.string().min(1).max(4096), productId: z.string().min(1).max(200) }).strict()]);
function one(request: Request, key: string) { const values = new URL(request.url).searchParams.getAll(key); if (values.length > 1) throw new SyntaxError("duplicate query"); return values[0] ?? null; }
function failure(e: unknown) {
 if (e instanceof AuthError) return Response.json({ error: { code: e.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } }, { status: e.status, headers });
 if (e instanceof z.ZodError || e instanceof SyntaxError) return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400, headers });
 if (e instanceof AppleStoreVerificationError || e instanceof GoogleStoreVerificationError) return Response.json({ error: { code: "INVALID_STORE_TRANSACTION" } }, { status: 400, headers });
 const message = e instanceof Error ? e.message : "";
 const known = [["REQUEST_CANCELLED", 409], ["REQUEST_PENDING", 409], ["ENTITLEMENT_MISMATCH", 409], ["DAILY_LIMIT", 409], ["FAVORITE_UNAVAILABLE", 404], ["PROJECT_UNAVAILABLE", 404], ["REQUEST_CONFLICT", 409], ["POLICY_CHANGED", 409], ["INSUFFICIENT_BALANCE", 409], ["PROJECT_CLOSED", 409], ["POLICY_UNCONFIGURED", 503], ["ACCOUNT_MISMATCH", 403], ["INVALID", 400]] as const;
 const match = known.find(([code]) => message.includes(`FAN_ECONOMY_${code}`));
 return Response.json({ error: { code: match?.[0] ?? "FAN_ECONOMY_UNAVAILABLE" } }, { status: match?.[1] ?? 503, headers });
}
export function createFanEconomyHandlers(deps: FanEconomyDependencies) {
 async function run<T>(request: Request, schema: z.ZodType<T>, name: string, args: () => Promise<Record<string, unknown>> | Record<string, unknown>) {
  try { const owner = await deps.authorize(request.headers.get("authorization")); let value = await deps.rpc(name, { p_app_user_id: owner.appUserId, ...await args() });
   if(name==="read_owned_mobile_fan_support_rankings"||name==="read_owned_mobile_fan_support_fans"){
    const data=z.object({items:z.array(z.record(z.string(),z.unknown()))}).passthrough().parse(value);
    const field=name==="read_owned_mobile_fan_support_rankings"?"imageUrl":"avatarUrl";
    value={...data,items:data.items.map(item=>{let image:null|string=null;const raw=item[field];if(typeof raw==="string"&&(raw.startsWith("https://")||(raw.startsWith("/")&&!raw.startsWith("//")))){const url=new URL(raw,deps.publicOrigin??new URL(request.url).origin);if(url.protocol==="https:"&&!url.username&&!url.password)image=url.href;}return {...item,[field]:image};})};
   }
   const parsed = schema.safeParse(value); if (!parsed.success) throw new Error("FAN_ECONOMY_UNAVAILABLE");return Response.json(parsed.data, { headers }); } catch(e) { return failure(e); }
 }
 async function body<T>(r: Request, s: z.ZodType<T>) { return s.parse(JSON.parse(await boundedText(r, 70000))); }
 const supportContract = (r:Request) => r.headers.get("X-Kyaa-Asset-Contract") === "support-v1";
 const rankingArgs=(r:Request)=>({p_locale:toContentLocale(z.enum(APP_LOCALES).parse(one(r,"locale")??"ko")),p_limit:z.coerce.number().int().min(1).max(100).parse(one(r,"limit")??20),p_offset:z.coerce.number().int().min(0).max(10000).parse(one(r,"offset")??0)});
 const favorite = (r: Request) => ({ p_celebrity_slug: slug.parse(one(r, "celebritySlug")) });
 return {
  cancel: (r: Request,key:string) => run(r,supportCancellationSchema,"cancel_owned_mobile_fan_economy_request",async()=>{const i=await body(r,cancelBody);return {p_request_key:z.uuid().parse(key),p_operation:i.operation,p_input:i.input};}),
  wallet: (r: Request) => supportContract(r) ? run(r,supportWalletSchema,"read_owned_mobile_fan_support_wallet",()=>favorite(r)) : run(r, walletSchema, "read_owned_mobile_fan_economy_wallet", () => favorite(r)),
  history: (r: Request) => run(r, supportContract(r)?supportHistorySchema:historySchema, supportContract(r)?"read_owned_mobile_fan_support_history":"read_owned_mobile_fan_economy_history", () => ({ ...favorite(r), p_limit: z.coerce.number().int().min(1).max(100).parse(one(r,"limit") ?? 30) })),
  checkIn:(r:Request)=>run(r,z.object({awarded:z.boolean(),sourceId:z.uuid(),replayed:z.boolean()}).strict(),"check_in_mobile_fan_support",async()=>{const i=await body(r,z.object({celebritySlug:slug}).strict());return {p_celebrity_slug:i.celebritySlug};}),
  support: (r:Request)=>run(r,supportSchema,"send_owned_mobile_fan_support",async()=>{const i=await body(r,supportBody);return {p_request_key:i.requestKey,p_celebrity_slug:i.celebritySlug,p_policy_version:i.policyVersion,p_units:i.units};}),
  supportStatus:(r:Request,key:string)=>run(r,z.union([supportSchema,unknownSchema,cancelledSchema]),"read_owned_mobile_fan_economy_request",()=>({p_request_key:z.uuid().parse(key),p_operation:"support"})),
  supportRankings:(r:Request)=>run(r,supportRankingsSchema,"read_owned_mobile_fan_support_rankings",()=>rankingArgs(r)),
  supportFanRankings:(r:Request,celebritySlug:string)=>run(r,fanSupportRankingsSchema,"read_owned_mobile_fan_support_fans",()=>({...rankingArgs(r),p_celebrity_slug:slug.parse(celebritySlug)})),
  reward:(r:Request,sourceId:string)=>supportContract(r)&&new URL(r.url).searchParams.has("afterSequence") ? run(r,supportRewardEnvelopeSchema,"read_owned_mobile_fan_support_reward",()=>({p_source_id:z.uuid().parse(sourceId),p_after_sequence:z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(one(r,"afterSequence")),p_celebrity_slug:slug.parse(one(r,"celebritySlug"))})) : run(r,fanRewardSchema,"read_owned_mobile_fan_reward",()=>({p_source_id:z.uuid().parse(sourceId)})),
  earningStatus: (r:Request) => run(r,earningStatusSchema,"read_owned_mobile_fan_earning_status",()=>favorite(r)),
  activitySource: (r:Request) => run(r,activitySourceSchema,"read_owned_mobile_fan_activity_source",()=>({...favorite(r),p_source_type:z.enum(activitySourceTypes).parse(one(r,"sourceType")),p_source_key:z.uuid().parse(one(r,"sourceKey"))})),
  missions: (r: Request) => run(r, missionsSchema, "read_owned_mobile_fan_economy_missions", () => favorite(r)),
  exchange: (r: Request) => run(r, exchangeSchema, "exchange_owned_mobile_fan_economy", async () => { const i = await body(r,exchangeBody);return { p_request_key:i.requestKey,p_celebrity_slug:i.celebritySlug,p_target:i.target,p_policy_version:i.policyVersion,p_units:i.units }; }),
  exchangeStatus: (r: Request, key: string) => run(r,z.union([exchangeSchema,unknownSchema,cancelledSchema]),"read_owned_mobile_fan_economy_request",()=>({p_request_key:z.uuid().parse(key),p_operation:"exchange"})),
  projects: (r: Request) => run(r,projectsSchema,"read_owned_mobile_fan_gift_projects",()=>favorite(r)),
  project: (r: Request,id: string) => run(r,projectSchema,"read_owned_mobile_fan_gift_project",()=>({p_project_id:z.uuid().parse(id)})),
  vote: (r: Request,id: string) => run(r,voteSchema,"vote_owned_mobile_fan_gift",async()=>{const i=await body(r,voteBody);return {p_project_id:z.uuid().parse(id),p_request_key:i.requestKey,p_policy_version:i.policyVersion,p_source:i.source,p_quantity:i.quantity};}),
  voteStatus: (r: Request,key: string) => run(r,z.union([voteSchema,unknownSchema,cancelledSchema]),"read_owned_mobile_fan_economy_request",()=>({p_request_key:z.uuid().parse(key),p_operation:"vote"})),
  voteProducts: (r: Request) => run(r,voteProductsSchema,"read_owned_mobile_vote_products",()=>({...favorite(r),p_store:z.enum(["apple","google"]).parse(one(r,"store"))})),
  voteIntent: (r: Request) => run(r,voteIntentSchema,"create_owned_mobile_vote_intent",async()=>{const i=await body(r,intentBody);return {p_request_key:i.requestKey,p_celebrity_slug:i.celebritySlug,p_store:i.store,p_product_id:i.productId,p_policy_version:i.policyVersion};}),
  voteIntentStatus: (r: Request,key: string) => run(r,z.union([voteIntentSchema,unknownSchema,cancelledSchema]),"read_owned_mobile_vote_intent",()=>({p_request_key:z.uuid().parse(key)})),
  voteTransactions: (r: Request) => run(r,z.object({transactions:z.array(voteTransactionSchema)}).strict(),"read_owned_mobile_vote_transactions",()=>({})),
  async voteVerify(r: Request) { try { const owner=await deps.authorize(r.headers.get("authorization"));const i=await body(r,verifyBody);const v=i.store==="apple"?await deps.verifyApple(i.signedTransactionInfo):await deps.verifyGoogle(i.purchaseToken,i.productId);
   const raw=await deps.rpc("apply_owned_mobile_vote_verified",{p_app_user_id:owner.appUserId,p_store:v.store,p_environment:v.environment,p_external_transaction_id:v.externalTransactionId,p_profile_id:v.profileId,p_product_id:v.productId,p_currency:v.currency,p_amount_krw:v.amountKrw,p_refunded_krw:v.refundedKrw,p_store_state:v.storeState,p_verification_fingerprint:v.verificationFingerprint,p_store_event_at:v.storeEventAt});
   const result=voteTransactionSchema.safeParse(raw);if(!result.success)throw new Error("FAN_ECONOMY_UNAVAILABLE");return Response.json({transaction:result.data},{headers});}catch(e){return failure(e);} },
 };
}
