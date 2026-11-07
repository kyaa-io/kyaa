import { messages as localizedMessages } from "@/i18n/catalogs/components__fan-shell__focus-flow-frame";
import { translate } from "@/i18n/messages";
import type { ReactNode } from "react";

import type { FanLocale } from "./fan-app-shell";
import { FanLanguageSwitch } from "./fan-language-switch";
import { FanSiteFooter } from "./fan-site-footer";
import { FocusFlowHeader } from "./focus-flow-header";
import styles from "./focus-flow-frame.module.css";

export function FocusFlowFrame({
  locale,
  children,
  headerActions,
  languageSwitch = false,
  mainId,
  showFooter = false,
  stickyHeader = false,
}: {
  locale: FanLocale;
  children: ReactNode;
  headerActions?: ReactNode;
  /** N19: the main header's language icon after `headerActions`; it keeps the current route and query. */
  languageSwitch?: boolean;
  mainId?: string;
  showFooter?: boolean;
  stickyHeader?: boolean;
}) {
  return (
    <div className={styles.frame} data-fan-surface lang={locale}>
      {mainId ? (
        <a className={styles.skipLink} href={`#${mainId}`}>
          {locale === "ko" ? "본문으로 바로가기" : translate(locale, localizedMessages.m94974679aba5, "Skip to content")}
        </a>
      ) : null}
      <FocusFlowHeader
        className={styles.header}
        innerClassName={styles.headerInner}
        locale={locale}
        sticky={stickyHeader}
      >
        {languageSwitch ? (
          <div className={styles.headerActions}>
            {headerActions}
            <FanLanguageSwitch locale={locale} compact />
          </div>
        ) : headerActions ?? <span />}
      </FocusFlowHeader>
      {children}
      {showFooter ? <FanSiteFooter locale={locale} /> : null}
    </div>
  );
}
