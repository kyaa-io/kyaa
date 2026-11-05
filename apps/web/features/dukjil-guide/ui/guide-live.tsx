"use client";

import type { Route } from "next";
import Link from "next/link";

import type { AppLocale } from "@/i18n/locales";
import { guideText } from "./guide-copy";
import { useGuideViewer } from "./use-guide-viewer";
import styles from "./guide-content.module.css";

type Target = "mission-book" | "fan-page";

function loginHref(locale: AppLocale, returnPath: string) {
  const back = `${returnPath}?locale=${locale}`;
  return `/login?locale=${locale}&returnTo=${encodeURIComponent(back)}` as Route;
}

/** Signed-in progress line, e.g. "Name mission book 6/9". Hidden for guests, members without a passport, and while loading or failing. */
export function GuideProgress({ locale }: { locale: AppLocale }) {
  const viewer = useGuideViewer(locale, true);
  if (viewer.status !== "member" || !viewer.creator || !viewer.progress) return null;
  const text = guideText(locale, "dkgMyProgress", [viewer.creator.name, viewer.progress.filled, viewer.progress.total]);
  return <p className={styles.progress} role="status">{text}</p>;
}

/** Bottom call to action. Rendered only once the sign-in state is known so the label never flips. */
export function GuideCta({ locale, target, returnPath }: { locale: AppLocale; target: Target; returnPath: string }) {
  const viewer = useGuideViewer(locale, false);
  if (viewer.status === "loading") return null;
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
  return (
    <div className={styles.stickyCta}>
      <Link className={styles.stickyAction} href={href} data-guide-cta={target}>{label}</Link>
    </div>
  );
}
