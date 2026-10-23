import "server-only";
import { type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/server/data/client";
import {
  raffleListSchema,
  type RaffleList,
} from "../../features/benefit/domain/raffle";

type RpcClient = Pick<SupabaseClient, "rpc">;
export interface RaffleRepository {
  list(input: {
    celebritySlug: string;
    locale: "ko" | "en";
    now: Date;
  }): Promise<RaffleList>;
}

export function createSupabaseRaffleRepository(
  config: { url: string | undefined; serviceRoleKey: string | undefined },
  client?: RpcClient,
): RaffleRepository {
  const database =
    client ??
    createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  return {
    async list(input) {
      const { data, error } = await database.rpc("get_public_raffles", {
        p_celebrity_slug: input.celebritySlug,
        p_locale: input.locale,
        p_now: input.now.toISOString(),
      });
      if (error) throw new Error(error.message);
      return raffleListSchema.parse(data);
    },
  };
}
