import "server-only";
import { wantsFanReward } from "../rewards/fan-reward";
import { creatorFanRewardModeSchema } from "../../features/rewards/domain/fan-reward";
import type { z } from "zod";

import { AuthError } from "../../features/auth/domain/auth-errors";
import { parseLiveLocale } from "../../features/live/domain/live-event";
import { FanAuthUnavailableError } from "../fan-auth/fan-auth-gate";
import type { LiveEventRepository } from "./live-event-repository";
import { publicContentCacheHeaders } from "../cache/public-content-cache";
import type { CollectibleRepository } from "../collectible/collectible-repository";

export interface LiveEventRouteDependencies {
  repository: Pick<LiveEventRepository, "findPublishedBySlug">;
  collectibleRepository?: Pick<CollectibleRepository, "getOwned">;
  authorize(authorization: string): Promise<{ appUserId: string }>;
  now(): Date;
  readRewardMode?(celebritySlug: string): Promise<z.infer<typeof creatorFanRewardModeSchema>>;
}

function response(
  code: string,
  status: number,
  authenticated = false,
): Response {
  return Response.json(
    { error: { code } },
    {
      status,
      headers: authenticated
        ? { "cache-control": "private, no-store", vary: "Authorization, X-Kyaa-Reward-Contract" }
        : {
            ...publicContentCacheHeaders(),
            vary: "Authorization, X-Kyaa-Reward-Contract",
          },
    },
  );
}

export function createGetLiveEventHandler(
  dependencies: LiveEventRouteDependencies,
) {
  return async function GET(
    request: Request,
    input: { slug: string },
  ): Promise<Response> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
      return response("LIVE_NOT_FOUND", 404);
    }

    let locale;
    try {
      locale = parseLiveLocale(
        new URL(request.url).searchParams.get("locale") ?? "ko",
      );
    } catch {
      return response("INVALID_LOCALE", 400);
    }

    const authorization = request.headers.get("authorization");
    let appUserId: string | null = null;
    if (authorization !== null) {
      try {
        appUserId = (await dependencies.authorize(authorization)).appUserId;
      } catch (error) {
        if (error instanceof FanAuthUnavailableError) {
          return response("LIVE_UNAVAILABLE", 503, true);
        }
        if (error instanceof AuthError) {
          return response("AUTHENTICATION_REQUIRED", error.status, true);
        }
        return response("AUTHENTICATION_REQUIRED", 401, true);
      }
    }

    try {
      const result = await dependencies.repository.findPublishedBySlug({
        slug: input.slug,
        locale,
        appUserId,
        now: dependencies.now(),
      });
      if (!result) return response("LIVE_NOT_FOUND", 404, appUserId !== null);
      if (appUserId && dependencies.collectibleRepository) {
        try {
          result.viewer.collectible = await dependencies.collectibleRepository.getOwned({ appUserId, liveSlug: input.slug });
        } catch { /* A feature read must not take down the canonical LIVE detail. */ }
      }
      const rewardMode = wantsFanReward(request) && dependencies.readRewardMode
        ? creatorFanRewardModeSchema.parse(await dependencies.readRewardMode(result.live.celebrity.slug)) : null;
      const body = rewardMode?.mode === "fan_point" ? {...result, rewardMode} : result;
      return Response.json(body, {
        status: 200,
        headers: appUserId
          ? { "cache-control": "private, no-store", vary: "Authorization, X-Kyaa-Reward-Contract" }
          : {
              ...publicContentCacheHeaders(),
              vary: "Authorization, X-Kyaa-Reward-Contract",
            },
      });
    } catch {
      return response("LIVE_UNAVAILABLE", 503, appUserId !== null);
    }
  };
}
