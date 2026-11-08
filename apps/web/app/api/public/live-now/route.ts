import { NextResponse } from "next/server";

import { parseContentLocale } from "../../../../server/content/content-domain";
import {
  createPublishedContentRepositoryFromEnvironment,
  type PublishedContentRepository,
} from "../../../../server/content/published-content-repository";
import { getCachedTikTokLiveObservation } from "../../../../server/tiktok/cached-tiktok-live-source";
import { buildObservedLiveFeed } from "../../../../server/tiktok/observed-live-feed";
import type { TikTokLiveObserver } from "../../../../server/tiktok/tiktok-live-source";
import {
  getCachedInstagramLiveDiscoveryObservation,
  type InstagramLiveDiscoveryObserver,
} from "../../../../server/instagram/cached-live-source";

import { getCachedYouTubeLiveObservation } from "../../../../server/youtube/cached-youtube-live-source";
import type { YouTubeLiveObserver } from "../../../../server/youtube/youtube-live-source";
import { getCachedChzzkLiveObservation, type ChzzkLiveObserver } from "../../../../server/chzzk/cached-live-source";
import type { ObservedLiveFeed } from "../../../../features/live/domain/observed-live";
import { captureYouTubeLiveStartsFromEnvironment } from "../../../../server/youtube/live-start-alerts";

type LiveNowDependencies = Readonly<{
  repository: Pick<PublishedContentRepository, "list" | "listUnlistedSlugs">;
  observe?: TikTokLiveObserver;
  now?: () => Date;
  observeYouTube?: YouTubeLiveObserver;
  observeInstagram?: InstagramLiveDiscoveryObserver;
  observeChzzk?: ChzzkLiveObserver;
  captureLiveStarts?: (feed: ObservedLiveFeed) => Promise<void>;
}>;

const noStoreHeaders = { "Cache-Control": "no-store" } as const;

export function createGetObservedLiveNow(dependencies: LiveNowDependencies) {
  return async function GET(request: Request): Promise<Response> {
    let locale;
    try {
      locale = parseContentLocale(
        new URL(request.url).searchParams.get("locale") ?? "ko",
      );
    } catch {
      return NextResponse.json(
        { error: "invalid_locale" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    try {
      // The unlisted read runs alongside and never blocks the feed or the alert capture; null means it failed.
      const unlistedRead = dependencies.repository.listUnlistedSlugs().catch(() => null);
      const celebrities = await dependencies.repository.list(locale);
      const version = new URL(request.url).searchParams.get("v");
      const feed = await buildObservedLiveFeed(
        celebrities,
        locale,
        dependencies.observe ?? getCachedTikTokLiveObservation,
        dependencies.now ?? (() => new Date()),
        version === "2" || version === "3" || version === "4" ? dependencies.observeYouTube ?? getCachedYouTubeLiveObservation : undefined,
        version === "3" || version === "4" ? dependencies.observeInstagram ?? getCachedInstagramLiveDiscoveryObservation : undefined,
        version === "4" ? dependencies.observeChzzk ?? getCachedChzzkLiveObservation : undefined,
      );
      // Live start alerts go to an unlisted creator's subscribers too; only the public strip leaves it out.
      try { await dependencies.captureLiveStarts?.(feed); }
      catch { console.error("YOUTUBE_LIVE_ALERT_CAPTURE_FAILED"); }
      // Without the unlisted set nothing counts as listed: the strip gets no cards rather than a test page's card.
      const unlisted = await unlistedRead;
      const shown = (item: { celebritySlug: string }) => unlisted !== null && !unlisted.has(item.celebritySlug);
      return NextResponse.json({ ...feed, items: feed.items.filter(shown), ...(feed.targets ? { targets: feed.targets.filter(shown) } : {}) }, {
        status: 200,
        headers: noStoreHeaders,
      });
    } catch {
      return NextResponse.json(
        { error: "content_unavailable" },
        { status: 503, headers: noStoreHeaders },
      );
    }
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    return createGetObservedLiveNow({
      repository: createPublishedContentRepositoryFromEnvironment(),
      captureLiveStarts: captureYouTubeLiveStartsFromEnvironment,
    })(request);
  } catch {
    return NextResponse.json(
      { error: "content_unavailable" },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
