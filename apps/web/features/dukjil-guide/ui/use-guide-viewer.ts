"use client";

import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { mySummarySchema, type MySummary } from "@/features/my/domain/my-summary";
import { passportRoadmapSchema } from "@/features/passport/domain/dukjil-types";
import { toContentLocale, type AppLocale } from "@/i18n/locales";

export type GuideCreator = { slug: string; name: string; passportId: string };
export type GuideViewer =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "member"; creator: GuideCreator | null; progress: { filled: number; total: number } | null };

const parseSummary = (value: unknown): MySummary => mySummarySchema.parse(value);
const parseRoadmap = (value: unknown) => passportRoadmapSchema.parse(value);

/** Reads the signed-in viewer on the client; the guide pages themselves stay server-rendered from the catalog. */
export function useGuideViewer(locale: AppLocale, withProgress: boolean): GuideViewer {
  const auth = useByUsAuth();
  const summary = useOwnedFanResource(
    auth.authenticated ? `/api/me/summary?locale=${toContentLocale(locale)}&tierStages=1` : null,
    parseSummary,
    auth,
  );
  const first = summary.state.status === "ready" ? summary.state.data.creators.find((item) => item.passport) : undefined;
  const creator: GuideCreator | null = first?.passport
    ? { slug: first.celebrity.slug, name: first.celebrity.name, passportId: first.passport.id }
    : null;
  const roadmap = useOwnedFanResource(
    withProgress && creator ? `/api/me/passports/${creator.passportId}/roadmap` : null,
    parseRoadmap,
    auth,
  );

  if (!auth.ready) return { status: "loading" };
  if (!auth.authenticated) return { status: "guest" };
  if (summary.state.status === "loading") return { status: "loading" };
  const page = roadmap.state.status === "ready" ? roadmap.state.data.pages[0] : undefined;
  const progress = page ? { filled: page.filled, total: page.slots.length } : null;
  return { status: "member", creator, progress };
}
