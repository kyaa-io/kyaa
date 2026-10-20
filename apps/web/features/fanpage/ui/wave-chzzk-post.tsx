"use client";
import type { AppLocale } from "@/i18n/locales";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { participationCopy } from "@/features/connect/kyaa-wave-participation-copy";
import { chzzkPostSchema } from "../domain/chzzk-posts";
import { chzzkPostTitle } from "../domain/creator-news";
import { ChzzkPostBody } from "./chzzk-posts";
import { useFanpageResource } from "./use-fanpage-resource";
import { WAVE_FANPAGE_SLUG } from "../domain/wave-programs";
const parse = (value: unknown) => chzzkPostSchema.parse(value);
export function WaveChzzkPost({ postId, locale, channelId, name }: { postId: string; locale: AppLocale; channelId: string; name: string }) {
  const resource = useFanpageResource(`/api/celebrities/${WAVE_FANPAGE_SLUG}/chzzk/${postId}`, parse), copy = participationCopy[locale];
  return <FanAppFrame locale={locale} mainId="chzzk-detail-main"><FanContentContainer as="main" id="chzzk-detail-main" tabIndex={-1}>
    {resource.state.status === "ready" ? <article><h1>{chzzkPostTitle(resource.state.data, locale) || "CHZZK"}</h1><ChzzkPostBody post={resource.state.data} name={name} locale={locale} communityUrl={`https://chzzk.naver.com/${channelId}/community`} /></article>
      : resource.state.status === "error" ? <><p role="alert">{copy.unavailable}</p><FanAction onClick={resource.retry}>{copy.retry}</FanAction></> : <p role="status">{copy.loading}</p>}
  </FanContentContainer></FanAppFrame>;
}
