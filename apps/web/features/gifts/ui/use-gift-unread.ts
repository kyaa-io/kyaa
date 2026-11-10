"use client";

import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { mySummaryPath, mySummarySchema } from "@/features/my/domain/my-summary";
import { toContentLocale, type AppLocale } from "@/i18n/locales";

const parseSummary = (body: unknown) => mySummarySchema.parse((body as { summary?: unknown } | null)?.summary);

/** Unread gifts from the one shared summary read (the header bell reads the same address), so a dot costs no extra request. Signed out or loading: 0. */
export function useGiftUnreadCount(locale: AppLocale): number {
  const auth = useByUsAuth();
  const summary = useOwnedFanResource(auth.authenticated ? mySummaryPath(toContentLocale(locale)) : null, parseSummary, auth);
  return summary.state.status === "ready" ? summary.state.data.gifts?.unreadCount ?? 0 : 0;
}
