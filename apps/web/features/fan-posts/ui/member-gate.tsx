"use client";
import type { Route } from "next";
import { FanAction } from "@/components/fan-ui/fan-action";
import { groupsCopy } from "@/features/groups/ui/copy";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";
import styles from "@/features/content-safety/ui/content.module.css";

/** The attachment-policy read answers 403 when the viewer is not a member of the page; 503 or no answer is not a gate. */
export const isMemberGate = (failure?: { status: number; code: string }) => failure?.status === 403 && failure.code === "FAN_WEB_FORBIDDEN";

export function MemberGate({ slug, locale }: { slug: string; locale: AppLocale }) {
  return <div className={styles.gate}><p role="alert" className={styles.error}>{contentCopy(locale).memberRequired}</p><FanAction href={`/${slug}?locale=${locale}` as Route}>{groupsCopy(locale).join}</FanAction></div>;
}
