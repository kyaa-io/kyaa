import { defaultHeartDonationEvent, type HeartDonationEvent } from "@/features/rankings/domain/heart-donation";

type Env = Record<string, string | undefined>;
const text = (value: string | undefined) => value?.trim().slice(0, 60) || null;

/** 찐팬 하트 후원 이벤트 설정(대표 2026-11-11). 켜고 끄는 것은 KYAA_FEATURE_JJINFAN_GAUGE가 맡고, 여기는 내용만: 함께하는 크리에이터 slug·이름, 후원 대상(예: 불우이웃), 후원처. 비우면 엘리나·불우이웃·후원처 미정. */
export function heartDonationEvent(env: Env = process.env): HeartDonationEvent {
  const slug = env.KYAA_HEART_DONATION_CREATOR_SLUG?.trim().toLowerCase();
  return {
    creatorSlug: slug && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug) ? slug : defaultHeartDonationEvent.creatorSlug,
    creatorName: text(env.KYAA_HEART_DONATION_CREATOR_NAME),
    cause: text(env.KYAA_HEART_DONATION_CAUSE),
    recipient: text(env.KYAA_HEART_DONATION_RECIPIENT),
  };
}
