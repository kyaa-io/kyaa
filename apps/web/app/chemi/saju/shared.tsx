"use client";

import { ShareLanding } from "@/features/chemi/ui/result/share-landing";
import type { AppLocale } from "@/i18n/locales";

/** 친구가 자랑한 사주 카드. 줄이 없거나 지났어도 그 최애의 사주 첫 장면으로 가는 길을 남긴다. */
export function SajuShared({ locale, from }: { locale: AppLocale; from: string }) {
  return <ShareLanding locale={locale} from={from} content="saju" />;
}
