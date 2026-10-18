import "server-only";
import { voteTransactionSchema } from "@/server/mobile-fan-economy/domain";
import { intentSchema, productSchema, supportSchema, transactionSchema, type MobileStore, type VerifiedStoreTransaction } from "./domain";

type RpcResult = PromiseLike<{ data: unknown; error: { message?: string } | null }>;
export interface MobileStoreDatabase { rpc(name: string, parameters: Record<string, unknown>): RpcResult }

export class MobileStoreRepository {
  constructor(private readonly database: MobileStoreDatabase) {}
  private async rpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.database.rpc(name, parameters);
    if (error) throw new Error(error.message ?? "MOBILE_STORE_DATABASE_ERROR");
    return data;
  }
  async listProducts(appUserId: string, store: MobileStore, celebritySlug: string) {
    const raw = await this.rpc("mobile_store_list_products", { p_app_user_id: appUserId, p_store: store, p_celebrity_slug: celebritySlug });
    return { products: productSchema.array().parse((raw as { products?: unknown }).products) };
  }
  async createIntent(appUserId: string, input: { store: MobileStore; productId: string; celebritySlug: string; policyVersion: string; requestKey: string; expectedPaidCampaign: { benefitId: string; policyVersion: string } }) {
    return intentSchema.parse(await this.rpc("mobile_store_create_intent", {
      p_app_user_id: appUserId, p_store: input.store, p_product_id: input.productId,
      p_celebrity_slug: input.celebritySlug, p_policy_version: input.policyVersion,
      p_expected_benefit_id: input.expectedPaidCampaign.benefitId,
      p_expected_campaign_policy_version: input.expectedPaidCampaign.policyVersion, p_request_key: input.requestKey,
    }));
  }
  async applyVerified(input: VerifiedStoreTransaction) {
    return transactionSchema.or(voteTransactionSchema).parse(await this.rpc("mobile_store_apply_entitlement_verified", {
      p_store: input.store, p_environment: input.environment, p_external_transaction_id: input.externalTransactionId,
      p_profile_id: input.profileId, p_product_id: input.productId, p_currency: input.currency,
      p_amount_krw: input.amountKrw, p_refunded_krw: input.refundedKrw, p_store_state: input.storeState,
      p_verification_fingerprint: input.verificationFingerprint, p_store_event_at: input.storeEventAt,
    }));
  }
  async applyOwnedVerified(appUserId: string, input: VerifiedStoreTransaction) {
    return transactionSchema.parse(await this.rpc("mobile_store_apply_owned_verified_transaction", {
      p_app_user_id: appUserId, p_store: input.store, p_environment: input.environment,
      p_external_transaction_id: input.externalTransactionId, p_profile_id: input.profileId,
      p_product_id: input.productId, p_currency: input.currency, p_amount_krw: input.amountKrw,
      p_refunded_krw: input.refundedKrw, p_store_state: input.storeState,
      p_verification_fingerprint: input.verificationFingerprint, p_store_event_at: input.storeEventAt,
    }));
  }
  async getOwnedTransactions(appUserId: string) {
    const raw = await this.rpc("mobile_store_get_owned_transactions", { p_app_user_id: appUserId });
    return { transactions: transactionSchema.array().parse((raw as { transactions?: unknown }).transactions) };
  }
  async getOwnedSupport(appUserId: string, celebritySlug: string, limit: number, cursor: { createdAt: string; id: string } | null = null, transactionId: string | null = null) {
    const result = supportSchema.safeParse(await this.rpc("mobile_store_get_owned_support_page", {
      p_app_user_id: appUserId, p_celebrity_slug: celebritySlug, p_limit: limit,
      p_cursor_created_at: cursor?.createdAt ?? null, p_cursor_id: cursor?.id ?? null, p_transaction_id: transactionId,
    }));
    if (!result.success) throw new Error("MOBILE_STORE_DATABASE_ERROR");
    return result.data;
  }
}
