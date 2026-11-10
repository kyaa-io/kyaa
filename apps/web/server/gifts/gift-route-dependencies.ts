import "server-only";
import { loadServerEnv } from "../config/env";
import { createBenefitFulfillmentRouteDependencies } from "../g4/benefit-fulfillment-route-dependencies";
import { createSupabaseGiftRepository } from "./gift-repository";
import type { GiftRouteDependencies } from "./gift-route";

export function createGiftRouteDependencies(): GiftRouteDependencies {
  const env = loadServerEnv();
  const { authorize } = createBenefitFulfillmentRouteDependencies();
  return { authorize, repository: createSupabaseGiftRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }) };
}
