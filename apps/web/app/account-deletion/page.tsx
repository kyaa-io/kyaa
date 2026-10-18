import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { FocusFlowFrame } from "@/components/fan-shell/focus-flow-frame";
import { FanLanguageSwitch } from "@/components/fan-shell/fan-language-switch";
import { legalLabels, resolveLegalLocale } from "@/components/legal-content";
import styles from "@/components/legal-page.module.css";
import { accountDeletionCopy } from "./content";
import pageStyles from "./page.module.css";

type PageProps = { searchParams: Promise<{ locale?: string | string[] }> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const copy = accountDeletionCopy[resolveLegalLocale((await searchParams).locale)];
  return { title: `${copy.title} | kyaa`, description: copy.description };
}

export default async function AccountDeletionPage({ searchParams }: PageProps) {
  const locale = resolveLegalLocale((await searchParams).locale);
  const copy = accountDeletionCopy[locale];
  const labels = legalLabels[locale];
  return (
    <FocusFlowFrame locale={locale} mainId="account-deletion-main" showFooter headerActions={
      <div className={styles.headerActions}>
        <Link className={styles.homeLink} href={`/?locale=${locale}`} aria-label={labels.homeAriaLabel}>
          <ArrowLeft aria-hidden="true" />{labels.home}
        </Link>
        <FanLanguageSwitch locale={locale} href={`/account-deletion?locale=${locale}`} />
      </div>
    }>
      <main className={`${styles.main} ${pageStyles.page}`} id="account-deletion-main" tabIndex={-1}>
        <header className={styles.intro}>
          <p>kyaa · Sallylab Inc.</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </header>
        <article className={styles.document}>
          <section>
            <h2>{copy.requestHeading}</h2>
            <p>{copy.appRequest}</p>
            <p>{copy.emailRequest}</p>
            <p><a href="mailto:support@kyaa.io">support@kyaa.io</a></p>
          </section>
          <section><h2>{copy.deletedHeading}</h2><p>{copy.deleted}</p></section>
          <section><h2>{copy.retainedHeading}</h2><p>{copy.retained}</p></section>
          <section><h2>{copy.timingHeading}</h2><p>{copy.timing}</p></section>
        </article>
      </main>
    </FocusFlowFrame>
  );
}
