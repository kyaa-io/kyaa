"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { CreatorAvatar } from "@/components/fan-ui/creator-avatar";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { FanState } from "@/components/fan-ui/fan-state";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { favoriteSupportRankingsCopy } from "@/i18n/catalogs/features__favorite-support-rankings";
import { supportCopy } from "@/i18n/catalogs/features__support";
import type { AppLocale } from "@/i18n/locales";
import { supportRankingsSchema } from "@/server/mobile-fan-economy/domain";
import styles from "./favorite-support-rankings.module.css";

const parseRankings = (value: unknown) => supportRankingsSchema.parse(value);

export function FavoriteSupportRankings({ locale }: { locale: AppLocale }) {
  const auth = usePrivy();
  const session = useByUsSession();
  const t = favoriteSupportRankingsCopy(locale);
  const common = supportCopy(locale);
  const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
  const { state, retry, refreshFailed } = useOwnedFanResource(`/api/me/mobile-fan-economy/support/rankings?locale=${locale}&limit=20&offset=0`, parseRankings, auth);
  const loginHref = `/login?${new URLSearchParams({ locale, returnTo: `/celebrities?locale=${locale}` })}`;
  const login = <FanAction href={loginHref} variant="primary">{common.login}</FanAction>;

  return <section className={styles.section} aria-labelledby="favorite-support-heading">
    <FanSectionHeader id="favorite-support-heading" title={t.title} description={t.intro} />
    <div className={styles.balance}><strong>{t.balance}</strong><span>{t.balanceHint}</span></div>
    {!auth.ready || !session.ready || state.status === "loading" ? <FanState kind="loading" title={common.loading} />
      : !auth.authenticated || (state.status === "error" && state.kind === "auth") ? <FanState kind="auth" title={common.guest} actions={login} />
      : state.status === "error" ? <FanState kind="error" title={common.error} actions={<FanAction onClick={retry}>{common.retry}</FanAction>} />
      : <>
        {refreshFailed ? <div className={styles.refresh} role="status"><p>{t.stale}</p><FanAction onClick={retry}>{common.retry}</FanAction></div> : null}
        {state.data.items.length === 0 ? <FanState kind="empty" title={t.empty} actions={<FanAction href={`/support?locale=${locale}`}>{common.send}</FanAction>} /> : <ol className={styles.list}>
          {state.data.items.map((item) => {
            const percent = item.supportKrw / 1_000_000 * 100;
            const progress = `${percent.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
            return <li key={item.celebrityId} value={item.rank} className={styles.row}>
              <div className={styles.identity}><CreatorAvatar slug={item.celebritySlug} src={item.imageUrl} photos={undefined} size={72} /><div><span className={styles.rank}>{item.rank}</span><h3>{item.name}</h3></div></div>
              <div className={styles.progress}>
                <div className={styles.progressLabel}><span>{t.progress}</span><strong>{progress}</strong></div>
                <div role="progressbar" aria-label={`${item.name} · ${t.progress}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)} aria-valuetext={progress} className={styles.track}><span style={{ width: `${Math.min(100, percent)}%` }} /></div>
                <p className={styles.amount}>{currency.format(item.supportKrw)} / {currency.format(1_000_000)}</p>
                <p className={styles.hearts}><strong>{item.supportUnits.toLocaleString(locale)}</strong> {t.hearts} · {t.goal}</p>
              </div>
              <FanAction href={`/support?${new URLSearchParams({ locale, creator: item.celebritySlug })}`} ariaLabel={`${item.name} · ${common.send}`} className={styles.send}>{common.send}</FanAction>
            </li>;
          })}
        </ol>}
        {state.data.nextOffset !== null ? <p className={styles.limit}>{t.top}</p> : null}
      </>}
  </section>;
}
