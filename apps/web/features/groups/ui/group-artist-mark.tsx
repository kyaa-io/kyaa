import { FanTag } from "@/components/fan-ui/fan-tag";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import type { AppLocale } from "@/i18n/locales";
import markStyles from "./group-artist-mark.module.css";

// The verified-artist mark next to an author name. It never shrinks, so a long name has to be ellipsized by its own element.
export function GroupArtistMark({ locale }: { locale: AppLocale }) {
  return <FanTag tone="artist" className={markStyles.mark}>{fanUiText(locale, "artistTag")}</FanTag>;
}
