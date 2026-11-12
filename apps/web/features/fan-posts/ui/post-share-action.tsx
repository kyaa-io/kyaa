"use client";
import { NoticeShare } from "@/components/notice/notice-share";
import { EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import { useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { todayItem } from "@/features/dukjil/domain/dukjil-ui";
import type { AppLocale } from "@/i18n/locales";

export function PostShareAction({ title, locale, contentType, url }: { title: string; locale: AppLocale; contentType?: "notice" | "post"; url?: string }) {
  const state = useDukjil();
  const item = todayItem(state?.today, "share");
  const points = state?.catalog?.rules.share?.points;
  const eligible = state?.status === "on" && state.authenticated && state.hasPassport && item && !item.stamped && item.remaining !== 0 && typeof points === "number" && points > 0;
  return <span data-share-action=""><EarnBadgeCorner locale={locale} points={eligible && typeof points === "number" ? points : undefined}><NoticeShare title={title} locale={locale} contentType={contentType} url={url} /></EarnBadgeCorner></span>;
}
