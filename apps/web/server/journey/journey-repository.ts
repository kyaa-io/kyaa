import "server-only";
import { z } from "zod";
import { readFanReward } from "../rewards/fan-reward";

import { createClient } from "@/server/data/client";

import {
  journeySnapshotSchema,
  type JourneySnapshot,
} from "../../features/journey/domain/journey";

export type JourneyRepositoryFailureCode =
  | "JOURNEY_NOT_FOUND"
  | "IDEMPOTENCY_CONFLICT"
  | "JOURNEY_UNAVAILABLE";

export class JourneyRepositoryError extends Error {
  constructor(readonly code: JourneyRepositoryFailureCode) {
    super(code);
    this.name = "JourneyRepositoryError";
  }
}

export interface JourneyRepository {
  getOwned(input: {
    appUserId: string;
    fanRewardContract?: boolean;
    liveSlug: string;
  }): Promise<JourneySnapshot>;
  evaluateOwned(input: {
    appUserId: string;
    fanRewardContract?: boolean;
    liveSlug: string;
    idempotencyKey: string;
  }): Promise<JourneySnapshot>;
}

export interface JourneyRpcClient {
  rpc(
    name: string,
    parameters: Record<string, string>,
  ): PromiseLike<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
}

function mapRpcError(error: { message?: string }): JourneyRepositoryError {
  if (error.message?.includes("P3_JOURNEY_NOT_FOUND")) {
    return new JourneyRepositoryError("JOURNEY_NOT_FOUND");
  }
  if (error.message?.includes("P3_JOURNEY_IDEMPOTENCY_CONFLICT")) {
    return new JourneyRepositoryError("IDEMPOTENCY_CONFLICT");
  }
  return new JourneyRepositoryError("JOURNEY_UNAVAILABLE");
}

function projectSnapshot(data: unknown): JourneySnapshot {
  const parsed = journeySnapshotSchema.safeParse(data);
  if (!parsed.success) {
    throw new JourneyRepositoryError("JOURNEY_UNAVAILABLE");
  }
  return parsed.data;
}

export class SupabaseJourneyRepository implements JourneyRepository {
  constructor(private readonly client: JourneyRpcClient) {}

  async getOwned(input: {
    appUserId: string;
    fanRewardContract?: boolean;
    liveSlug: string;
  }): Promise<JourneySnapshot> {
    const { data, error } = await this.client.rpc("get_owned_live_journey", {
      p_app_user_id: input.appUserId,
      p_live_slug: input.liveSlug,
    });
    if (error) throw mapRpcError(error);
    const {completionId,...legacy}=z.object({completionId:z.uuid().nullable().optional()}).passthrough().parse(data);
    const result=projectSnapshot(legacy);
    return input.fanRewardContract && completionId ? {...result,fanReward:await readFanReward(this.client,input.appUserId,completionId)} : result;
  }

  async evaluateOwned(input: {
    appUserId: string;
    fanRewardContract?: boolean;
    liveSlug: string;
    idempotencyKey: string;
  }): Promise<JourneySnapshot> {
    const { data, error } = await this.client.rpc(
      "evaluate_owned_live_journey",
      {
        p_app_user_id: input.appUserId,
        p_live_slug: input.liveSlug,
        p_idempotency_key: input.idempotencyKey,
      },
    );
    if (error) throw mapRpcError(error);
    const {completionId,...legacy}=z.object({completionId:z.uuid().nullable().optional()}).passthrough().parse(data);
    const result=projectSnapshot(legacy);
    return input.fanRewardContract && completionId ? {...result,fanReward:await readFanReward(this.client,input.appUserId,completionId)} : result;
  }
}

export function createJourneyRepositoryFromEnvironment(config: {
  url: string | undefined;
  serviceRoleKey: string | undefined;
}, existingClient?: JourneyRpcClient): JourneyRepository {
  const client = existingClient ?? createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return new SupabaseJourneyRepository(client as unknown as JourneyRpcClient);
}
