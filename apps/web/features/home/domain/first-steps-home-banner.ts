import type { AppLocale } from "@/i18n/locales";
import { FIRST_STEP_IDS, FIRST_STEPS_PATH } from "@/features/onboarding/domain/first-steps";
import { firstStepsCopy } from "@/features/onboarding/ui/first-steps-copy";
import type { HomeBanner } from "./home-banner";

export const FIRST_STEPS_BANNER_ID = "fd2ba957-c2aa-430d-8acb-42d52c3f66be";

/** 온보딩 패키지(M1): 세 걸음을 마치기 전 홈 첫 배너. 마친 브라우저는 서버가 빼고 그린다(first-steps 쿠키). */
export function firstStepsHomeBanner(locale: AppLocale): HomeBanner {
  const t = firstStepsCopy(locale);
  return {
    id: FIRST_STEPS_BANNER_ID, kind: "announcement", celebrityId: null, category: "guide", placement: "home",
    title: t.bannerTitle, description: FIRST_STEP_IDS.map((id) => t.step[id]).join(" · "),
    ctaLabel: t.start, href: FIRST_STEPS_PATH, alt: t.bannerTitle,
    desktopImage: { id: "5c0f2b8e-7d1a-4f3e-9b6c-2a4d8e1f0c37", url: "/images/onboarding/first-steps-wide.webp", width: 1774, height: 887, mimeType: "image/webp", revision: 2 },
    // 390 전용 정사각 크롭(같은 원본 1:1, 여권·도장 중심). 2:1을 cover로 자르면 절반만 쓰여 확대·흐림이 생긴다(GPT 2차 Top3).
    mobileImage: { id: "9e3d7a41-2b6c-4f58-8a1d-6c0e5b2f7d93", url: "/images/onboarding/first-steps-mobile.webp", width: 887, height: 887, mimeType: "image/webp", revision: 2 },
  };
}
