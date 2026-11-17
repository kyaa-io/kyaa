import { z } from "zod";
import { eventParticipantPresets } from "@/features/admin/event-participants";

/** 팬 페이지 이벤트 유입 태그. 링크의 utm_source/campaign/content만 쓰며 허용 목록 밖의 값은 통째로 버린다. */
export const EVENT_SOURCE_EVENT_SOURCE = "fan_event_source.identified";
export const eventSourceValues = ["telegram", "x", "kol"] as const;
export const eventSourceContentPattern = /^[a-z0-9-]{1,24}$/;
const mediumPattern = /^[a-z0-9-]{1,24}$/;

const campaignKeys = eventParticipantPresets.map((preset) => preset.key) as [string, ...string[]];

export const eventSourcePropertiesSchema = z.object({
  source: z.enum(eventSourceValues),
  campaign: z.enum(campaignKeys),
  content: z.string().regex(eventSourceContentPattern),
}).strict();
export type EventSourceProperties = z.infer<typeof eventSourcePropertiesSchema>;

/** 이 팬 페이지(slug)의 캠페인 태그가 맞으면 기록할 속성, 아니면 null. */
export function eventSourceFromSearch(search: string, slug: string): EventSourceProperties | null {
  const query = new URLSearchParams(search);
  const parsed = eventSourcePropertiesSchema.safeParse({
    source: query.get("utm_source"), campaign: query.get("utm_campaign"), content: query.get("utm_content"),
  });
  if (!parsed.success) return null;
  return eventParticipantPresets.find((preset) => preset.key === parsed.data.campaign)?.slug === slug ? parsed.data : null;
}

/** 로그인 뒤 돌아올 주소에 검증된 태그의 UTM만 이어 붙인다. 태그가 아니면 주소를 그대로 둔다. */
export function withEventSourceReturn(returnTo: string, search: string, slug: string): string {
  const tag = eventSourceFromSearch(search, slug);
  if (!tag) return returnTo;
  const url = new URL(returnTo, "https://byus.local");
  const medium = new URLSearchParams(search).get("utm_medium");
  url.searchParams.set("utm_source", tag.source);
  if (medium && mediumPattern.test(medium)) url.searchParams.set("utm_medium", medium);
  url.searchParams.set("utm_campaign", tag.campaign);
  url.searchParams.set("utm_content", tag.content);
  return `${url.pathname}${url.search}${url.hash}`;
}
