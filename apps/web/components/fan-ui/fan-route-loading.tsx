import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__fan-ui__fan-route-loading";
import { translate } from "@/i18n/messages";
import { FanSkeleton } from "./fan-skeleton";
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
        <FanSkeleton width="55%" height={24} />
        <FanSkeleton width="78%" height={14} className={styles.subheading} />
        <FanSkeleton shape="block" height={48} />
        <FanSkeleton shape="block" height={48} />
        <FanSkeleton shape="block" height={48} className={styles.action} />
      </div>
    </div>
  );
}
