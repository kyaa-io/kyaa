"use client";
import cornerStyles from "@/components/fan-ui/earn-corner.module.css";
import { NoticeShare } from "@/components/notice/notice-share";
import { todayItem } from "@/features/dukjil/domain/dukjil-ui";
import { EarnActionBadge } from "@/features/dukjil/ui/earn-badge";
import { useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import type { AppLocale } from "@/i18n/locales";

/** 공유 미션 배지를 보일지. 미션 데이터에 `share`가 없거나, 로그인한 팬이 오늘 다 받았거나 아직 오늘 값을 모르면 숨긴다. */
export function shareBadgeVisible(state: ReturnType<typeof useDukjil>): boolean {
  if (!state?.catalog?.rules.share) return false;
  if (!state.authenticated) return true;
  const item = todayItem(state.today, "share");
  return Boolean(item && item.remaining !== 0);
}

/**
 * H2(감독 22:14): 글·공지의 공유 버튼. 기존 공유 미션(공유 인증 뒤 지급)의 포인트를 👍와 같은 자리·모양(`corner`)으로 붙인다.
 * 값은 미션 데이터에서 읽고, 누르면 지금의 공유 창을 그대로 연다(새 지급 규칙 없음).
 */
export function PostShareAction({ title, locale, contentType }: { title: string; locale: AppLocale; contentType?: "notice" | "post" }) {
  const visible = shareBadgeVisible(useDukjil());
  return <span className={cornerStyles.host} data-share-action="">
    <NoticeShare title={title} locale={locale} contentType={contentType} />
    {visible && <EarnActionBadge action="share" locale={locale} variant="corner" />}
  </span>;
}
