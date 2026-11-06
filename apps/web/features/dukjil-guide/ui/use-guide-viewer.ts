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
  | { status: "member"; creator: GuideCreator | null; progress: { filled: number; total: number } | null; unavailable?: boolean; retry?: () => void };

/** /api/me/summary answers { summary: {...} }; unwrap it like the other screens do. */
export const parseSummary = (body: unknown): MySummary => mySummarySchema.parse((body as { summary?: unknown } | null)?.summary);
const parseRoadmap = (value: unknown) => passportRoadmapSchema.parse(value);

type ReadState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; kind: "auth" | "missing" | "network" };
type Roadmap = ReturnType<typeof parseRoadmap>;

/** First creator the member holds a passport for, or null when they hold none. */
export function pickGuideCreator(summary: MySummary | undefined): GuideCreator | null {
  const first = summary?.creators.find((item) => item.passport);
  return first?.passport ? { slug: first.celebrity.slug, name: first.celebrity.name, passportId: first.passport.id } : null;
}

/**
 * Pure viewer state. A failed summary read never looks like "no passport": an auth failure is a guest, and a
 * network failure is a member whose state is unavailable. A failed roadmap read only hides the progress line.
 */
export function buildGuideViewer(input: {
  auth: { ready: boolean; authenticated: boolean };
  summary: ReadState<MySummary>;
  roadmap: ReadState<Roadmap>;
  retry?: () => void;
}): GuideViewer {
  const { auth, summary, roadmap } = input;
  if (!auth.ready) return { status: "loading" };
  if (!auth.authenticated) return { status: "guest" };
  if (summary.status === "loading") return { status: "loading" };
  if (summary.status === "error") {
    if (summary.kind === "auth") return { status: "guest" };
    return { status: "member", creator: null, progress: null, unavailable: true, retry: input.retry };
  }
  const creator = pickGuideCreator(summary.status === "ready" ? summary.data : undefined);
  const page = roadmap.status === "ready" ? roadmap.data.pages[0] : undefined;
  const progress = page ? { filled: page.filled, total: page.slots.length } : null;
  return { status: "member", creator, progress };
}

/** Reads the signed-in viewer on the client; the guide pages themselves stay server-rendered from the catalog. */
export function useGuideViewer(locale: AppLocale, withProgress: boolean): GuideViewer {
  const auth = useByUsAuth();
  const summary = useOwnedFanResource(
    auth.authenticated ? `/api/me/summary?locale=${toContentLocale(locale)}&tierStages=1` : null,
    parseSummary,
    auth,
  );
  const creator = pickGuideCreator(summary.state.status === "ready" ? summary.state.data : undefined);
  const roadmap = useOwnedFanResource(
    withProgress && creator ? `/api/me/passports/${creator.passportId}/roadmap` : null,
    parseRoadmap,
    auth,
  );
  return buildGuideViewer({ auth, summary: summary.state, roadmap: roadmap.state, retry: summary.retry });
}
