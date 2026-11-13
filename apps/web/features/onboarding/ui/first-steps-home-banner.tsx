"use client";

import { ManagedHomeBanner } from "@/components/home-entry-cards/managed-home-banner";
import type { HomeBanner } from "@/features/home/domain/home-banner";
import type { AppLocale } from "@/i18n/locales";
import { FIRST_STEP_IDS } from "../domain/first-steps";
import { firstStepsCopy } from "./first-steps-copy";
import { useFirstSteps } from "./use-first-steps";

/** 홈 첫 배너. 회원은 설명 줄이 진행(1/3 · 다음 걸음)으로, 버튼이 '이어서 하기'로 바뀐다. 다 마치면 useFirstSteps가 쿠키를 남긴다. */
export function FirstStepsHomeBanner({ banner, locale, priority }: { banner: HomeBanner; locale: AppLocale; priority?: boolean }) {
  const t = firstStepsCopy(locale);
  const view = useFirstSteps(locale);
  const progress = view.status === "member" ? view.progress : null;
  const shown = progress && progress.doneCount > 0
    ? { ...banner, description: progress.next ? `${progress.doneCount}/${FIRST_STEP_IDS.length} · ${t.step[progress.next]}` : `${progress.doneCount}/${FIRST_STEP_IDS.length}`, ctaLabel: progress.next ? t.resume : t.allDone, href: progress.next ? banner.href : "/benefits" }
    : banner;
  return <ManagedHomeBanner banner={shown} locale={locale} priority={priority} />;
}
