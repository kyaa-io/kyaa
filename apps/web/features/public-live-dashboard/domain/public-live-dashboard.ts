import { z } from "zod";

const count = z.number().int().nonnegative().safe().nullable();
const timestamp = z.iso.datetime({ offset: true });
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const proofSchema = z.object({ txHash: hash, blockNumber: z.string().regex(/^(0|[1-9][0-9]*)$/), hubAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/), actionId: hash, easUid: hash, status: z.literal("ACTIVE"), current: z.literal(true), origin: z.literal("NATIVE") }).strict();
const unavailable = z.object({ state: z.literal("unavailable") }).strict();
const databaseSchema = z.discriminatedUnion("state", [unavailable, z.object({
  state: z.literal("available"), approvedParticipation: count, participatingBroadcasts: count, sentHearts: count,
  process: z.object({ pending: count, approved: count, rejected: count }).strict(), asOf: timestamp,
}).strict()]);
const onchainSchema = z.discriminatedUnion("state", [unavailable, z.object({
  state: z.literal("available"), asOf: timestamp, blockTimestamp: timestamp,
  proof: proofSchema.nullable().optional(),
  metrics: z.object({ uniqueActiveWallets: count, actionCounts: z.record(z.string(), count), passportCredentials: count, mintedCredentials: count, lifecycleTransactions: count, currentActionTransactions: count }).strict(),
}).strict()]);
const responseSchema = z.object({ database: z.unknown(), onchain: z.unknown() }).strict();
export type PublicDashboardData = { database: z.infer<typeof databaseSchema>; onchain: z.infer<typeof onchainSchema> };
export function parsePublicDashboard(value: unknown): PublicDashboardData {
  const response = responseSchema.parse(value);
  const database = databaseSchema.safeParse(response.database), onchain = onchainSchema.safeParse(response.onchain);
  return { database: database.success ? database.data : { state: "unavailable" }, onchain: onchain.success ? onchain.data : { state: "unavailable" } };
}
