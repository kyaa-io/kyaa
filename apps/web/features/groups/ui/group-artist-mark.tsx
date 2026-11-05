import { BadgeCheck } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { roomContextCopy } from "./room-entry-copy";
import markStyles from "./group-artist-mark.module.css";

// The verified-artist mark shown next to an author name (same icon and wording as the room messages).
// It never shrinks, so a long name has to be ellipsized by its own element, not by clipping the mark.
export function GroupArtistMark({ locale }: { locale: AppLocale }) {
  return <span className={markStyles.mark}><BadgeCheck size={16} aria-hidden="true" />{roomContextCopy[locale][1]}</span>;
}
