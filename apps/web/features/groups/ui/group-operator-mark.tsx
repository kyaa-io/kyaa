import { FanTag } from "@/components/fan-ui/fan-tag";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import type { AppLocale } from "@/i18n/locales";
import markStyles from "./group-artist-mark.module.css";

// 페이지 소유자·운영진이 쓴 글·댓글의 작성자 옆 표시. 인증 아티스트가 아닐 때만 쓰고, 자리와 간격은 아티스트 표시와 같다.
export function GroupOperatorMark({ locale }: { locale: AppLocale }) {
  return <FanTag tone="neutral" className={markStyles.mark}>{fanUiText(locale, "operatorTag")}</FanTag>;
}
