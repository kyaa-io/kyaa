"use client";

import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { AppLocale } from "@/i18n/locales";
import { messages as loadMessages } from "@/i18n/catalogs/components__celebrity-fan-page";
import { translate } from "@/i18n/messages";
import { FanAction } from "@/components/fan-ui/fan-action";
import { groupsCopy } from "@/features/groups/ui/copy";
import { guideText } from "./guide-copy";
import { useGuideViewer } from "./use-guide-viewer";
import styles from "./guide-content.module.css";

type Target = "mission-book" | "fan-page";

function loginHref(locale: AppLocale, returnPath: string) {
  const back = `${returnPath}?locale=${locale}`;
  return `/login?locale=${locale}&returnTo=${encodeURIComponent(back)}` as Route;
}

/** Signed-in progress line, e.g. "Mission book 6/9". Hidden for guests, members without a passport, and while loading or failing. */
export function GuideProgress({ locale }: { locale: AppLocale }) {
  const viewer = useGuideViewer(locale, true);
  if (viewer.status !== "member" || !viewer.creator || !viewer.progress) return null;
  const text = guideText(locale, "dkgMyProgress", [viewer.progress.filled, viewer.progress.total]);
  return <p className={styles.progress} role="status">{text}</p>;
}

/** Main call to action, used in the hero and again in the closing band. Rendered only once the sign-in state is known so the label never flips. */
export function GuideCta({ locale, target, returnPath }: { locale: AppLocale; target: Target; returnPath: string }) {
  const viewer = useGuideViewer(locale, false);
  if (viewer.status === "loading") return null;
  if (viewer.status === "member" && viewer.unavailable) {
    const message = locale === "ko" ? "내 팬 활동을 불러오지 못했어요." : translate(locale, loadMessages.m0aea4924b59e, "Couldn't load your fan activity.");
    return (
      <div className={styles.ctaError} role="alert">
        <span>{message}</span>
        <FanAction variant="text" onClick={viewer.retry}>{groupsCopy(locale).retry}</FanAction>
      </div>
    );
  }
  let href: Route;
  let label: string;
  if (viewer.status === "guest") {
    href = loginHref(locale, returnPath);
    label = guideText(locale, "dkgCtaLogin");
  } else if (!viewer.creator) {
    href = `/celebrities?locale=${locale}` as Route;
    label = guideText(locale, "dkgCtaFans");
  } else if (target === "mission-book") {
    href = `/passports/${viewer.creator.passportId}?locale=${locale}#mission-book` as Route;
    label = guideText(locale, "dkgCtaMyBook");
  } else {
    href = `/${viewer.creator.slug}?locale=${locale}` as Route;
    label = guideText(locale, "dkgCtaStartToday");
  }
  return <Link className={styles.cta} href={href} data-guide-cta={target}>{label}<ArrowRight size={18} aria-hidden="true" /></Link>;
}

/** Secondary "browse fan pages" link. Hidden when the sticky CTA already leads to the same place (signed in without a passport). */
export function GuideFansLink({ locale }: { locale: AppLocale }) {
  const viewer = useGuideViewer(locale, false);
  if (viewer.status === "member" && (viewer.unavailable || !viewer.creator)) return null;
  return <Link className={styles.secondary} href={`/celebrities?locale=${locale}` as Route}>{guideText(locale, "dkgCtaFans")}</Link>;
}
