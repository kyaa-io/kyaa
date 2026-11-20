"use client";

import { useEffect } from "react";
import { EVENT_SOURCE_EVENT_SOURCE, eventSourceFromSearch, eventSourcePropertiesSchema, withEventSourceReturn, type EventSourceProperties } from "../domain/event-source-tag";
import { pageViewIdempotencyKey, recordProductEventV1 } from "./product-event-client";

const STORAGE_KEY = "byus.event-source.v1";
type Stored = { slug: string; tag: EventSourceProperties; recorded: boolean };

function readStored(slug: string): Stored | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null") as { slug?: unknown; tag?: unknown; recorded?: unknown } | null;
    const tag = eventSourcePropertiesSchema.safeParse(value?.tag);
    return value && value.slug === slug && tag.success ? { slug, tag: tag.data, recorded: value.recorded === true } : null;
  } catch { return null; }
}
function store(value: Stored): void {
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* 저장하지 못해도 이 화면에서는 기록한다 */ }
}

/**
 * 로그인 주소를 다른 브라우저로 넘길 때 쓴다. 세션 저장소는 브라우저를 건너가지 못하므로,
 * 이 탭에 저장된 태그가 돌아갈 팬 페이지의 것이면 돌아갈 주소에 UTM으로 붙인다.
 */
export function withStoredEventSourceReturn(returnTo: string): string {
  try {
    const slug = new URL(returnTo, "https://byus.local").pathname.split("/").filter(Boolean).at(-1);
    const saved = slug ? readStored(slug) : null;
    if (!slug || !saved) return returnTo;
    const search = new URLSearchParams({ utm_source: saved.tag.source, utm_campaign: saved.tag.campaign, utm_content: saved.tag.content });
    return withEventSourceReturn(returnTo, `?${search}`, slug);
  } catch { return returnTo; }
}

/**
 * 태그가 붙은 팬 페이지 링크로 열렸을 때, 로그인한 회원의 방문을 기존 /api/events에 남긴다.
 * 로그인 화면을 거쳐 돌아오면 주소에서 UTM이 사라질 수 있어, 같은 탭의 첫 태그는 세션 저장소에도 둔다.
 */
export function useEventSourceTag({ slug, ready, authenticated, ownerId, getAccessToken }: {
  slug: string; ready: boolean; authenticated: boolean; ownerId: string | null | undefined; getAccessToken: () => Promise<string | null>;
}) {
  useEffect(() => {
    const fromUrl = eventSourceFromSearch(window.location.search, slug);
    if (fromUrl) { const saved = readStored(slug); if (!saved || saved.tag.campaign !== fromUrl.campaign) store({ slug, tag: fromUrl, recorded: false }); }
  }, [slug]);
  useEffect(() => {
    if (!ready || !authenticated || !ownerId) return;
    const fromUrl = eventSourceFromSearch(window.location.search, slug);
    const saved = readStored(slug);
    const tag = fromUrl ?? (saved && !saved.recorded ? saved.tag : null);
    if (!tag) return;
    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (cancelled || !token) return;
      const idempotencyKey = await pageViewIdempotencyKey("creator_page_view", `src-${tag.campaign}-${tag.content}`, ownerId);
      if (cancelled) return;
      const recorded = await recordProductEventV1({ eventName: "creator_page_view", celebrityId: null, liveEventId: null, missionId: null, benefitId: null, source: EVENT_SOURCE_EVENT_SOURCE, idempotencyKey, properties: tag }, token);
      if (recorded && !cancelled) { const current = readStored(slug); if (current && current.tag.campaign === tag.campaign) store({ ...current, recorded: true }); }
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [slug, ready, authenticated, ownerId, getAccessToken]);
}
