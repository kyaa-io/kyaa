"use client";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { fanLoginHref } from "@/components/login-href";
import { dukjilText, type DukjilCopyKey } from "@/features/dukjil/ui/dukjil-copy";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { certificationListItemSchema, type CertificationListItem } from "../domain/certification";
import { certificationStampSrc } from "../domain/certification-stamp";
import styles from "./certification-grid.module.css";

const listSchema = z.object({ certifications: z.array(certificationListItemSchema) }).passthrough();

/** The six kinds the 2026-11-07 request names, in its order. Shown as fixed tiles while there is no page to read (guest without a favorite, no passport). */
export const CERTIFICATION_KINDS: ReadonlyArray<{ key: DukjilCopyKey; art: string }> = [
  { key: "certKindReceipt", art: "proof" },
  { key: "certKindInstagram", art: "membership" },
  { key: "certKindTiktok", art: "membership" },
  { key: "certKindYoutube", art: "subscription" },
  { key: "certKindDonation", art: "support" },
  { key: "certKindFancafe", art: "welcome" },
];

const STATE_KEY: Record<CertificationListItem["status"], DukjilCopyKey> = { available: "certAvailable", preparing: "certPreparing", closed: "certClosed" };

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; items: CertificationListItem[] };

/** Compact certification tiles (tab1 12): stamp 32 + name + one state tag, 2 columns at 390, 3 from 1024. Each tile opens that certification's own page,
 * the same place the fan page's certification tab sends it, so the list here and the submit screen never disagree. Closed ones go last. */
export function CertificationGrid({ locale, slug, guest, fallbackHref }: { locale: AppLocale; slug: string; guest: boolean; /** Where the fixed tiles go without a page. */ fallbackHref: string }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    setLoad({ status: "loading" });
    fetch(`/api/celebrities/${encodeURIComponent(slug)}/certifications?locale=${toContentLocale(locale)}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(String(response.status)); return listSchema.parse(await response.json()); })
      .then(data => setLoad({ status: "ready", items: data.certifications.filter(item => item.kind !== "live_mission") }))
      .catch(() => { if (!controller.signal.aborted) setLoad({ status: "error" }); });
    return () => controller.abort();
  }, [slug, locale, attempt]);
  const go = (href: string) => (guest ? fanLoginHref(locale, href) : href) as Route;
  if (!slug) {
    return <ul className={styles.grid} data-certification-grid="kinds">{CERTIFICATION_KINDS.map(kind => <li key={kind.key}><Link className={styles.tile} href={go(fallbackHref)}>
      <img src={`/images/stamps/ink-v1/${kind.art}.webp`} alt="" width={32} height={32} loading="lazy" /><strong>{dukjilText(locale, kind.key)}</strong>
    </Link></li>)}</ul>;
  }
  if (load.status === "loading") return <ul className={styles.grid} aria-busy="true" aria-hidden="true">{CERTIFICATION_KINDS.map(kind => <li key={kind.key}><span className={styles.tile}><FanSkeleton width={32} height={32} /><FanSkeleton width="70%" height={16} /></span></li>)}</ul>;
  if (load.status === "error") return <FanState inline compact kind="error" title={dukjilText(locale, "certLoadError")} actions={<FanAction variant="text" onClick={() => setAttempt(value => value + 1)}>{walletCopy(locale).retry}</FanAction>} />;
  if (!load.items.length) return <FanState inline compact kind="empty" title={dukjilText(locale, "certEmpty")} />;
  const order = { available: 0, preparing: 1, closed: 2 } as const;
  const items = [...load.items].sort((a, b) => order[a.status] - order[b.status]);
  return <ul className={styles.grid} data-certification-grid="items">{items.map(item => <li key={item.id}><Link className={styles.tile} href={go(item.actionHref)} data-status={item.status}>
    <img src={certificationStampSrc(item)} alt="" width={32} height={32} loading="lazy" />
    <strong>{item.title}</strong>
    <span className={styles.state} data-status={item.status}>{dukjilText(locale, STATE_KEY[item.status])}</span>
  </Link></li>)}</ul>;
}
