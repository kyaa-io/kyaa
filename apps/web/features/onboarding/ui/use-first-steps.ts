"use client";

import { useEffect, useMemo } from "react";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { parseDukjilAttendanceList } from "@/features/dukjil/domain/dukjil-ui";
import { attendanceListPath, JOINED_PAGES_PATH } from "@/features/dukjil/ui/use-attended-anywhere";
import { groupListSchema } from "@/features/groups/domain/contracts";
import { useGroupResource } from "@/features/groups/ui/use-group-resource";
import { mySummaryPath, mySummarySchema } from "@/features/my/domain/my-summary";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { firstStepsCookieString, firstStepsProgress, type FirstStepsFacts, type FirstStepsProgress } from "../domain/first-steps";

export type FirstStepsView =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "error"; retry: () => void }
  | { status: "member"; facts: FirstStepsFacts; progress: FirstStepsProgress; streak: number };

const parseSummary = (body: unknown) => mySummarySchema.parse((body as { summary?: unknown } | null)?.summary);
const parseList = (value: unknown) => groupListSchema.parse(value);

/** 세 걸음의 상태. 헤더·덕질과 같은 주소(요약·가입한 페이지·출석)를 읽어 공유 캐시가 답하므로 새 요청을 거의 늘리지 않는다.
 * 다 마치면 이 브라우저에 쿠키를 남겨 홈 서버가 다음 방문부터 배너를 빼게 한다. */
export function useFirstSteps(locale: AppLocale): FirstStepsView {
  const auth = useByUsAuth();
  const summary = useOwnedFanResource(auth.authenticated ? mySummaryPath(toContentLocale(locale)) : null, parseSummary, auth);
  const joined = useGroupResource(auth.authenticated ? JOINED_PAGES_PATH : null, parseList);
  const pages = useMemo(() => (joined.data?.items ?? []).flatMap((page) => page.celebrityId && page.slug ? [{ slug: page.slug, name: page.name }] : []), [joined.data]);
  const slugs = pages.slice(0, 50).map((page) => encodeURIComponent(page.slug)).join(",");
  const attendance = useGroupResource(slugs ? attendanceListPath(slugs) : null, parseDukjilAttendanceList);

  const view = useMemo<FirstStepsView>(() => {
    if (!auth.ready) return { status: "loading" };
    if (!auth.authenticated) return { status: "guest" };
    if (summary.state.status === "error") return summary.state.kind === "auth" ? { status: "guest" } : { status: "error", retry: summary.retry };
    if (joined.error) return { status: "error", retry: joined.retry };
    if (summary.state.status === "loading" || !joined.data || (slugs && !attendance.data && !attendance.error)) return { status: "loading" };
    const passports = summary.state.data.creators.flatMap((creator) => creator.passport ? [{ slug: creator.celebrity.slug, name: creator.celebrity.name }] : []);
    const items = attendance.data?.items ?? [];
    const streak = items.reduce((longest, item) => Math.max(longest, item.streak), 0);
    const facts: FirstStepsFacts = { joinedPages: pages, passports, attended: items.some((item) => item.attendedToday) || streak > 0 };
    return { status: "member", facts, progress: firstStepsProgress(facts), streak };
  }, [attendance.data, attendance.error, auth.authenticated, auth.ready, joined.data, joined.error, joined.retry, pages, slugs, summary.retry, summary.state]);

  const complete = view.status === "member" && view.progress.complete;
  useEffect(() => {
    if (!complete) return;
    try { document.cookie = firstStepsCookieString(); } catch { /* cookies blocked: the banner simply stays */ }
  }, [complete]);
  return view;
}
