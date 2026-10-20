"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Clock3, RefreshCw } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { publicLiveDashboardCopy } from "@/i18n/catalogs/features__public-live-dashboard";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { parsePublicDashboard, type PublicDashboardData } from "../domain/public-live-dashboard";
import styles from "./public-live-dashboard.module.css";

const unavailable: PublicDashboardData = { database: { state: "unavailable" }, onchain: { state: "unavailable" } };

export function PublicLiveDashboard({ locale }: { locale: AppLocale }) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{ revision: number; data: PublicDashboardData }>();
  const pending = snapshot?.revision !== revision;
  useEffect(() => {
    const controller = new AbortController();
    void withRequestDeadline(async signal => {
      const response = await fetch("/api/public/live-dashboard", { signal, cache: "no-store", credentials: "omit", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("DASHBOARD_UNAVAILABLE");
      return parsePublicDashboard(await response.json());
    }, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setSnapshot({ revision, data });
    }).catch(() => {
      if (!controller.signal.aborted) setSnapshot({ revision, data: unavailable });
    });
    return () => controller.abort();
  }, [revision]);
  return <FanAppFrame locale={locale} currentPath="/support" mainId="public-live-dashboard">
    <PublicLiveDashboardContent locale={locale} data={pending ? unavailable : snapshot?.data ?? unavailable} pending={pending} onRefresh={() => setRevision(value => value + 1)} />
  </FanAppFrame>;
}

export function PublicLiveDashboardContent({ locale, data, pending, onRefresh }: { locale: AppLocale; data: PublicDashboardData; pending: boolean; onRefresh: () => void }) {
  const t = publicLiveDashboardCopy(locale);
  const db = data.database.state === "available" ? data.database : null;
  const chain = data.onchain.state === "available" ? data.onchain : null;
  const count = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat(locale).format(value);
  const measuredAt = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul", calendar: "gregory" }).format(new Date(value));
  const sourceState = (available: boolean) => pending ? "pending" : available ? "confirmed" : "error";
  const badge = (available: boolean) => {
    const state = sourceState(available);
    const Icon = state === "pending" ? Clock3 : state === "confirmed" ? CheckCircle2 : CircleAlert;
    return <span className={styles.badge} data-state={state}><Icon aria-hidden="true" />{t[state]}</span>;
  };
  const metric = (title: string, value: number | null | undefined, description?: string) => <div className={styles.metric} key={title}><dt>{title}</dt><dd>{count(value)}{description && <span className={styles.metricHelp}>{description}</span>}</dd></div>;
  return <FanContentContainer as="main" id="public-live-dashboard" className={styles.page}>
    <header className={styles.header}><h1>{t.heading}</h1><p>{t.intro}</p></header>
    <dl className={styles.metrics} aria-busy={pending}>
      {metric(t.activities, db?.approvedParticipation, t.activitiesHelp)}
      {metric(t.broadcasts, db?.participatingBroadcasts, t.broadcastsHelp)}
      {metric(t.hearts, db?.sentHearts, t.heartsHelp)}
    </dl>
    <section className={styles.records} aria-labelledby="record-status-heading" aria-busy={pending}>
      <header className={styles.sectionHeader}><h2 id="record-status-heading">{t.status}</h2><p>{t.statusHelp}</p></header>
      <div className={styles.sourceList}>
        <article className={styles.source} aria-label="DB"><div className={styles.sourceHeading}><h3>DB</h3>{badge(!!db)}</div>
          {db ? <><p className={styles.timestamp}>{t.asOf} · <time dateTime={db.asOf}>{measuredAt(db.asOf)} KST</time></p><h4 className={styles.processTitle}>{t.certifications}</h4><dl className={styles.process}>{metric(t.processPending, db.process.pending)}{metric(t.processApproved, db.process.approved)}{metric(t.processRejected, db.process.rejected)}</dl></> : <p className={styles.sourceMessage}>{pending ? t.refreshing : t.unknown}</p>}
        </article>
        <article className={styles.source} aria-label="GIWA"><div className={styles.sourceHeading}><h3>GIWA <span>Sepolia</span></h3>{badge(!!chain)}</div>
          {chain ? <div className={styles.chainTimes}><p className={styles.timestamp}>{t.asOf} · <time dateTime={chain.asOf}>{measuredAt(chain.asOf)} KST</time></p><p className={styles.timestamp}>{t.finalized} · <time dateTime={chain.blockTimestamp}>{measuredAt(chain.blockTimestamp)} KST</time></p></div> : <p className={styles.sourceMessage}>{pending ? t.refreshing : t.unknown}</p>}
        </article>
      </div>
      <p className={styles.unknown}>{t.unknown}</p>
    </section>
    <section className={styles.records} aria-labelledby="onchain-metrics-heading" aria-busy={pending}>
      <header className={styles.sectionHeader}><h2 id="onchain-metrics-heading">{t.onchainMetrics}</h2><p>{t.onchainScope}</p></header>
      <dl className={styles.chainMetrics}>{metric(t.actions, chain?.metrics.currentActionTransactions)}{metric(t.passports, chain?.metrics.passportCredentials)}{metric(t.minted, chain?.metrics.mintedCredentials)}{metric(t.wallets, chain?.metrics.uniqueActiveWallets)}</dl>
    </section>
    <aside className={styles.privacy}><h2>{t.privacyTitle}</h2><p>{t.privacy}</p><p className={styles.manual}>{t.manual}</p><FanAction variant="text" leadingIcon={<RefreshCw />} onClick={onRefresh} disabled={pending} ariaBusy={pending}>{t.refresh}</FanAction></aside>
    <span className={styles.srOnly} role="status">{pending ? t.refreshing : ""}</span>
  </FanContentContainer>;
}
