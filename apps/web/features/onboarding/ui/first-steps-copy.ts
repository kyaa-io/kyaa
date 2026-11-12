import type { AppLocale } from "@/i18n/locales";
import type { FirstStepId } from "../domain/first-steps";

const ko = {
  title: "첫 걸음",
  bannerTitle: "kyaa 첫 걸음",
  start: "시작하기",
  resume: "이어서 하기",
  login: "로그인",
  allDone: "덕질하러 가기",
  progressLabel: "첫 걸음 진행",
  done: "완료",
  retry: "다시 시도",
  error: "첫 걸음을 불러오지 못했습니다.",
  step: { join: "모임 가입", passport: "팬 패스포트 받기", attend: "첫 출석" },
  action: { join: "가입", passport: "인증", attend: "출석" },
  next: { join: "모임 가입하기", passport: "팬 인증하기", attend: "출석하기" },
  streak: (days: number) => `연속 ${days}일`,
};

const en: typeof ko = {
  title: "First steps",
  bannerTitle: "First steps on kyaa",
  start: "Start",
  resume: "Continue",
  login: "Sign in",
  allDone: "Go to Fan activity",
  progressLabel: "First steps progress",
  done: "Done",
  retry: "Try again",
  error: "We couldn't load your first steps.",
  step: { join: "Join a page", passport: "Get a Fan Passport", attend: "First check-in" },
  action: { join: "Join", passport: "Verify", attend: "Check in" },
  next: { join: "Join a page", passport: "Verify as a fan", attend: "Check in" },
  streak: (days: number) => `${days}-day streak`,
};

export type FirstStepsCopy = typeof ko;
export function firstStepsCopy(locale: AppLocale): FirstStepsCopy {
  return locale === "ko" ? ko : en;
}

export function firstStepNames(locale: AppLocale): Record<FirstStepId, string> {
  return firstStepsCopy(locale).step;
}
