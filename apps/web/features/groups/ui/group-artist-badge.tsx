"use client";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import type { AppLocale } from "@/i18n/locales";
import { useOptionalGroupPage } from "./group-page-context";

/** 머리 이름 옆 배지. 이 페이지에 접속 공개를 켠 인증 아티스트가 연결돼 있을 때만 그린다. `FanPageHeader`의 `badge`로 넘긴다. */
export function GroupArtistBadge({ locale }: { locale: AppLocale }) {
  const artists = useOptionalGroupPage()?.presence.data?.artists.length ?? 0;
  return artists > 0 ? <FanTag tone="artist">{fanUiText(locale, "artistTag")}</FanTag> : null;
}
