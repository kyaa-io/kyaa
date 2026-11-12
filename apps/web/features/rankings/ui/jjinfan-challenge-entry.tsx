"use client";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { fanVerifyHref } from "@/features/quiz/domain/live-return-context";
import type { AppLocale } from "@/i18n/locales";
import { JJINFAN_BANNER_CREATORS } from "../domain/jjinfan-banner";
import { jjinfanBannerCopy } from "./jjinfan-banner-copy";
import styles from "./jjinfan-challenge-entry.module.css";

/** Wait for this account's passport read; a failed read must not invite an already verified fan. */
export function JjinfanChallengeEntry({ slug, locale, ready, verified }: { slug: string; locale: AppLocale; ready: boolean; verified: boolean }) {
  const query = useSearchParams();
  const router = useRouter();
  const t = jjinfanBannerCopy[locale];
  const open = ready && !verified && query?.get("challenge") === "jjinfan100" && JJINFAN_BANNER_CREATORS.some(creator => creator.slug === slug);
  const close = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("challenge");
    router.replace(`${url.pathname}${url.search}${url.hash}` as Route, { scroll: false });
  };
  return <FanDialog size="sm" className={styles.dialog} open={open} onOpenChange={value => { if (!value) close(); }} title={t.invite} closeLabel={t.close}
    primary={{ label: t.join, onClick: () => router.push(fanVerifyHref(slug, locale, `/${encodeURIComponent(slug)}?locale=${locale}`) as Route) }} />;
}
