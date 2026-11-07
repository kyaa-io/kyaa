"use client";
import type { Route } from "next";
import { FanAction } from "@/components/fan-ui/fan-action";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { fanPageReturnPath, fanVerifyHref, sanitizeLiveReturnTo } from "@/features/quiz/domain/live-return-context";
import { groupsCopy } from "@/features/groups/ui/copy";
import { useOptionalGroupPage } from "@/features/groups/ui/group-page-context";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";
import styles from "@/features/content-safety/ui/content.module.css";

/** The attachment-policy read answers 403 when the viewer is not a member of the page; 503 or no answer is not a gate. */
export const isMemberGate = (failure?: { status: number; code: string }) => failure?.status === 403 && failure.code === "FAN_WEB_FORBIDDEN";

/** A fan page opens by passing the entry check; a hobby or brand page opens by joining on its own page. Either way the fan comes back. Drawn only after a client read answered 403. */
export function MemberGate({ slug, locale }: { slug: string; locale: AppLocale }) {
  const kind = useOptionalGroupPage()?.kind, page = `/${slug}?locale=${locale}`;
  const { pathname, search } = window.location, here = `${pathname}${search}`;
  const joinsOnPage = kind === "brand" || kind === "hobby";
  const href = joinsOnPage ? `${page}&returnTo=${encodeURIComponent(here)}` : fanVerifyHref(slug, locale, sanitizeLiveReturnTo(fanPageReturnPath(pathname, search, locale)) ?? page);
  return <div className={styles.gate}><p role="alert" className={styles.error}>{contentCopy(locale).memberRequired}</p><FanAction href={href as Route}>{joinsOnPage ? groupsCopy(locale).join : fanUiText(locale, "starVerify")}</FanAction></div>;
}
