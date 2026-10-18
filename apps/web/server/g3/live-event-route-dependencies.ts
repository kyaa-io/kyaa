import "server-only";
import { creatorFanRewardModeSchema } from "../../features/rewards/domain/fan-reward";

import { createClient } from "@supabase/supabase-js";

import { createPrivyNodeAccessVerifier } from "../auth/privy-node-verifier";
import { loadServerEnv } from "../config/env";
import { authorizeFanRequest } from "../fan-auth/fan-auth-gate";
import { createSupabaseFanAuthRepository } from "../fan-auth/supabase-fan-auth-repository";
import { createCollectibleRepositoryFromEnvironment, type CollectibleRpcClient } from "../collectible/collectible-repository";
import { createLiveEventRepositoryFromEnvironment } from "./live-event-repository";
import type { LiveEventRepository } from "./live-event-repository";
import type { LiveEventRouteDependencies } from "./live-event-route";

export function createLiveEventRouteDependencies(): LiveEventRouteDependencies & {
  repository: LiveEventRepository;
} {
  const environment = loadServerEnv();
  const database = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const fanRepository = createSupabaseFanAuthRepository(
    { url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY },
    database,
  );
  const verifier = createPrivyNodeAccessVerifier({
    appId: environment.PRIVY_APP_ID,
    appSecret: environment.PRIVY_APP_SECRET,
    appEnvironment: environment.PRIVY_APP_ENVIRONMENT,
    testAccountLoginEnabled: environment.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED, appleLoginEnabled: environment.PRIVY_APPLE_LOGIN_ENABLED,
  });

  return {
    repository: createLiveEventRepositoryFromEnvironment({
      url: environment.SUPABASE_URL,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    }),
    collectibleRepository: createCollectibleRepositoryFromEnvironment({
      url: environment.SUPABASE_URL,
      serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    }, database as unknown as CollectibleRpcClient),
    authorize: (authorization) =>
      authorizeFanRequest({ authorization, verifier, repository: fanRepository }),
    async readRewardMode(celebritySlug) {
      const {data,error}=await database.rpc("read_mobile_fan_economy_reward_mode", {p_celebrity_slug: celebritySlug});
      if(error)throw new Error("FAN_REWARD_UNAVAILABLE");
      return creatorFanRewardModeSchema.parse(data);
    },
    now: () => new Date(),
  };
}

export function liveEventUnavailableResponse(): Response {
  return Response.json(
    { error: { code: "LIVE_UNAVAILABLE" } },
    { status: 503, headers: { "cache-control": "no-store", vary: "Authorization" } },
  );
}
