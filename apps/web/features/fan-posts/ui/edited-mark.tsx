import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import type { AppLocale } from "@/i18n/locales";

export function EditedMark({ locale, className }: { locale: AppLocale; className?: string }) {
  return <span className={className} data-edited-mark="">{fanUiText(locale, "editedMark")}</span>;
}
