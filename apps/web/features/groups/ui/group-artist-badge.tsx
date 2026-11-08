"use client";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import type { AppLocale } from "@/i18n/locales";
import { useOptionalGroupPage } from "./group-page-context";

/** 머리 이름 옆 배지. 이 페이지에 접속 공개를 켠 인증 아티스트가 연결돼 있을 때만 그린다. `FanPageHeader`의 `badge`로 넘긴다. */
export function GroupArtistBadge({ locale }: { locale: AppLocale }) {
  const page = useOptionalGroupPage(), loaded = page?.presence.data;
  // 접속 정보를 읽기 전에는 서버가 본 값으로 태그 자리를 잡는다(태그가 늦게 붙어 제목이 접히지 않게).
  const shown = loaded ? loaded.artists.length > 0 : Boolean(page?.artistTag);
  return shown ? <FanTag tone="artist">{fanUiText(locale, "artistTag")}</FanTag> : null;
}
