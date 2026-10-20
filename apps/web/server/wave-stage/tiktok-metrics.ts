import "server-only";
import { waveStageTikTokCreatorSchema, waveStageTikTokResponseSchema, type WaveStageTikTokCreator } from "@/features/wave-stage/domain/tiktok-metrics";
import { correlation, json } from "@/server/certification/certification-http";
import { contentFailure } from "@/server/fan-posts/routes";
import type { FanpageDependencies } from "@/server/fanpage/routes";
import { fetchTikTokLiveObservation, type TikTokLiveObserver } from "@/server/tiktok/tiktok-live-source";

const profiles = [{ slug: "changha", handle: "chang._.a" }, { slug: "wena", handle: "ifewknow" }] as const;

export function createWaveStageTikTokHandler(
  deps: Pick<FanpageDependencies, "authorizeAdmin">,
  options: { observe?: TikTokLiveObserver; now?: () => Date } = {},
) {
  const observe = options.observe ?? fetchTikTokLiveObservation;
  const now = options.now ?? (() => new Date());
  return async (request: Request) => {
    try {
      await deps.authorizeAdmin(request.headers.get("authorization"), correlation(request));
      const creators = await Promise.all(profiles.map(async ({ slug, handle }): Promise<WaveStageTikTokCreator> => {
        try {
          const observation = await observe(handle);
          const base = { slug, state: observation.state, observedAt: observation.observedAt };
          const result = waveStageTikTokCreatorSchema.safeParse(observation.state === "live"
            ? { ...base, roomId: observation.roomId, viewers: observation.viewers ?? null }
            : base);
          if (result.success) return result.data;
        } catch { /* A source failure must not invent an offline state or viewer count. */ }
        return { slug, state: "unavailable", observedAt: now().toISOString() };
      }));
      return json(waveStageTikTokResponseSchema.parse({ asOf: now().toISOString(), creators }));
    } catch (error) { return contentFailure(error); }
  };
}
