import type { AppLocale } from "@/i18n/locales";

/** 온보딩 패키지(M1, 대표 11/12): 처음 온 사람의 세 걸음 — 모임 가입 → 팬 패스포트 → 첫 출석. 새 데이터 규칙 없이 기존 읽기만 본다. */
export type FirstStepId = "join" | "passport" | "attend";
export const FIRST_STEP_IDS: readonly FirstStepId[] = ["join", "passport", "attend"];

/** 세 걸음을 마친 브라우저는 이 쿠키를 받고, 홈 서버는 다음 방문부터 첫 걸음 배너를 빼고 그린다(깜빡임 없음). */
export const FIRST_STEPS_COOKIE = "kyaa_first_steps";
export const FIRST_STEPS_DONE = "done";
export const FIRST_STEPS_PATH = "/onboarding";

export type FirstStepsFacts = {
  /** 가입한 크리에이터 팬페이지(모임 중 celebrityId가 있는 것), 가입 순. */
  joinedPages: ReadonlyArray<{ slug: string; name: string }>;
  /** 패스포트를 가진 크리에이터(/api/me/summary creators 중 passport가 있는 것). */
  passports: ReadonlyArray<{ slug: string; name: string }>;
  /** 오늘 어느 페이지든 출석했거나 연속 출석이 이어지고 있는가. */
  attended: boolean;
};

export type FirstStep = { id: FirstStepId; done: boolean };
export type FirstStepsProgress = {
  steps: readonly FirstStep[];
  doneCount: number;
  complete: boolean;
  /** 아직 안 한 첫 걸음. 다 했으면 null. */
  next: FirstStepId | null;
};

/** 패스포트가 있으면 이미 그 크리에이터를 고른 것이라 가입 걸음도 끝난 것으로 본다(패스포트는 팬페이지 퀴즈로만 생긴다). */
export function firstStepsProgress(facts: FirstStepsFacts): FirstStepsProgress {
  const done: Record<FirstStepId, boolean> = {
    join: facts.joinedPages.length > 0 || facts.passports.length > 0,
    passport: facts.passports.length > 0,
    attend: facts.attended,
  };
  const steps = FIRST_STEP_IDS.map((id) => ({ id, done: done[id] }));
  const doneCount = steps.filter((step) => step.done).length;
  return { steps, doneCount, complete: doneCount === steps.length, next: steps.find((step) => !step.done)?.id ?? null };
}

/** 각 걸음이 가는 곳. 패스포트는 가입한 팬페이지의 팬 인증(퀴즈)으로, 팬페이지가 없으면 모임 찾기로. */
export function firstStepHref(id: FirstStepId, facts: Pick<FirstStepsFacts, "joinedPages" | "passports"> | null, locale: AppLocale): string {
  const query = `?locale=${locale}`;
  if (id === "join") return `/pages/groups${query}`;
  if (id === "passport") {
    const page = facts?.joinedPages.find((joined) => !facts.passports.some((owned) => owned.slug === joined.slug)) ?? facts?.joinedPages[0];
    return page ? `/c/${encodeURIComponent(page.slug)}/verify${query}` : `/pages/groups${query}`;
  }
  return `/benefits${query}`;
}

export function firstStepsDoneCookie(value: string | undefined | null): boolean {
  return value === FIRST_STEPS_DONE;
}

/** 1년. 같은 브라우저에서 다시 보이지 않게 하는 편의 값이고, 서버 규칙이 아니다. */
export function firstStepsCookieString(): string {
  return `${FIRST_STEPS_COOKIE}=${FIRST_STEPS_DONE}; path=/; max-age=31536000; samesite=lax`;
}
