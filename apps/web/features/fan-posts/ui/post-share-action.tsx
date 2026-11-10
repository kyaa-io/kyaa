"use client";
import cornerStyles from "@/components/fan-ui/earn-corner.module.css";
import { NoticeShare } from "@/components/notice/notice-share";
import type { AppLocale } from "@/i18n/locales";

/**
 * 글·공지의 공유 버튼. 링크를 열어도 포인트가 없으므로(`fan_share_settings.visit_payouts` 꺼짐) 포인트 배지를 붙이지 않는다(BUGS-261110 B6).
 * 공유 미션(05)은 SNS 글 주소 인증, SNS 올리기(07)는 캡처 인증으로 받는다. 누르면 지금의 공유 창을 그대로 연다.
 */
export function PostShareAction({ title, locale, contentType }: { title: string; locale: AppLocale; contentType?: "notice" | "post" }) {
  return <span className={cornerStyles.host} data-share-action="">
    <NoticeShare title={title} locale={locale} contentType={contentType} />
  </span>;
}
