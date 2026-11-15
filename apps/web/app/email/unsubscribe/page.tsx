import type { Metadata } from "next";

import { FanAction } from "@/components/fan-ui";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanText } from "@/components/fan-ui/fan-text";
import { FocusFlowFrame } from "@/components/fan-shell/focus-flow-frame";
import { resolveLegalLocale } from "@/components/legal-content";
import legalStyles from "@/components/legal-page.module.css";
import { loadServerEnv } from "@/server/config/env";
import { emailUnsubscribeKey } from "@/server/notification/email-unsubscribe-dependencies";
import { resolveEmailUnsubscribeTarget, unsubscribeEndsRequiredNotices, type EmailUnsubscribeScope } from "@/server/notification/email-unsubscribe";
import { emailUnsubscribeCopy } from "./content";
import styles from "./page.module.css";

type SearchParams = { t?: string | string[]; locale?: string | string[]; done?: string | string[] };
type PageProps = { searchParams: Promise<SearchParams> };

export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const locale = resolveLegalLocale((await searchParams).locale);
  return { title: `${emailUnsubscribeCopy[locale === "ko" ? "ko" : "en"].title} | kyaa`, robots: { index: false, follow: false } };
}

function linkKey(): Buffer | null {
  try { return emailUnsubscribeKey(loadServerEnv()); } catch { return null; }
}

export default async function EmailUnsubscribePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const locale = resolveLegalLocale(params.locale);
  const copy = emailUnsubscribeCopy[locale === "ko" ? "ko" : "en"];
  const token = first(params.t);
  const done = first(params.done) ?? "";
  const target = resolveEmailUnsubscribeTarget(linkKey(), token);
  const usable = target.state === "ok" && done !== "invalid" && done !== "expired";
  const action = `/api/email/unsubscribe?t=${encodeURIComponent(token ?? "")}&locale=${locale}`;

  const options: { scope: EmailUnsubscribeScope; name: string }[] = [];
  if (target.state === "ok") {
    if (target.preference) options.push({ scope: "preference", name: copy.preferenceLabels[target.preference] });
    options.push({ scope: "email", name: copy.emailLabel });
  }
  const stopped = done === "off-preference" || done === "off-email" ? (done === "off-email" ? "email" : "preference") : null;

  return (
    <FocusFlowFrame locale={locale} mainId="email-unsubscribe-main" showFooter>
      <main className={`${legalStyles.main} ${styles.page}`} id="email-unsubscribe-main" tabIndex={-1}>
        <FanHeading as="h1">{copy.title}</FanHeading>
        {!usable ? (
          <>
            <FanText role="item" as="p">{copy.unusable}</FanText>
            <div><FanAction href={`/settings?locale=${locale}`} variant="neutral">{copy.settings}</FanAction></div>
          </>
        ) : (
          <>
            {done === "failed" ? <div role="alert"><FanText role="item" as="p">{copy.failed}</FanText></div> : null}
            {stopped ? <FanText role="item" as="p">{copy.saved}</FanText> : null}
            <ul className={styles.rows}>
              {options.filter((option) => !stopped || option.scope === stopped).map((option) => {
                const resume = stopped === option.scope;
                const preference = target.state === "ok" ? target.preference : null;
                return (
                  <li className={styles.row} key={option.scope} data-row="">
                    <form method="post" action={action}>
                      <input type="hidden" name="scope" value={option.scope} />
                      <input type="hidden" name="enabled" value={resume ? "true" : "false"} />
                      <FanText role="item" as="p">{option.name}</FanText>
                      <FanAction type="submit" variant={resume || option.scope === "email" ? "neutral" : "primary"}>{resume ? copy.resume : copy.stop}</FanAction>
                    </form>
                    {!resume && unsubscribeEndsRequiredNotices(option.scope, option.scope === "preference" ? preference : null)
                      ? <FanText role="meta" as="p">{copy.requiredWarning}</FanText> : null}
                  </li>
                );
              })}
            </ul>
            {stopped ? <div><FanAction href={`/settings?locale=${locale}`} variant="neutral">{copy.settings}</FanAction></div> : null}
          </>
        )}
      </main>
    </FocusFlowFrame>
  );
}
