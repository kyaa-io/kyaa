import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__fan-ui__fan-route-loading";
import { translate } from "@/i18n/messages";
import styles from "./fan-route-loading.module.css";

type FanRouteLoadingProps = Readonly<{
  locale?: AppLocale;
  presentation?: "page" | "overlay";
}>;

export function FanRouteLoading({
  locale = "ko",
  presentation = "page",
}: FanRouteLoadingProps) {
  return (
    <div className={styles[presentation]} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.label}>
        {locale === "ko" ? "페이지를 불러오는 중이에요." : translate(locale, localizedMessages.m115ef1f104f6, "Loading this page.")}
      </span>
      <div className={styles.skeleton} aria-hidden="true">
        <span className={styles.heading} />
        <span className={styles.subheading} />
        <span className={styles.field} />
        <span className={styles.field} />
        <span className={styles.action} />
      </div>
    </div>
  );
}
