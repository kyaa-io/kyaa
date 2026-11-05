"use client";
import Link from "next/link";
import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";
import type { DukjilActionKey } from "@/features/passport/domain/dukjil-types";
import { activeToday, checkinNumbers, todayItem, todayStampCount } from "../domain/dukjil-ui";
import { dukjilText, type DukjilCopyKey } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import { EarnBadge } from "./earn-badge";
import styles from "./dukjil.module.css";

type Tile = { action: DukjilActionKey | "checkin"; label: DukjilCopyKey; href?: string };

/** "오늘의 덕질" (plan §11.3). Points, remaining counts and stamps are exactly what `today` returns; capped tiles move last. */
const catalogPoints = (catalog: { rules: Record<string, unknown> } | undefined, action: string) => { const points = (catalog?.rules[action] as { points?: unknown } | undefined)?.points; return typeof points === "number" ? points : undefined; };

export function TodayTiles({ locale, slug, passportHref, proofHref, onAttendance }: { locale: AppLocale; slug: string; passportHref: string; proofHref: string; onAttendance: () => void }) {
  const state = useDukjil();
  const today = activeToday(state?.today);
  if (!state || state.status !== "on" || !state.authenticated || !today) return null;
  const home = `/${slug}?locale=${locale}`;
  const tiles: Tile[] = [
    { action: "checkin", label: "dukjilTileAttendance" },
    { action: "post", label: "dukjilTilePost", href: home },
    { action: "comment", label: "dukjilTileComment", href: home },
    { action: "share", label: "dukjilTileShare", href: passportHref },
    { action: "invite", label: "dukjilTileInvite", href: `/my/invitations?locale=${locale}` },
    { action: "proof", label: "dukjilTileProof", href: proofHref },
  ];
  const checkin = checkinNumbers(state.catalog);
  const checkedIn = state.attendance?.attendedToday ?? false;
  const view = tiles.flatMap(tile => {
    if (tile.action === "checkin") return [{ tile, done: checkedIn, points: undefined as number | undefined, remaining: null as number | null, stamped: false }];
    const item = todayItem(state.today, tile.action);
    return item ? [{ tile, done: item.remaining === 0, points: catalogPoints(state.catalog, tile.action), remaining: item.remaining, stamped: item.stamped }] : [];
  }).sort((a, b) => Number(a.done) - Number(b.done));
  return (
    <section className={styles.tiles} aria-labelledby={`dukjil-tiles-${slug}`}>
      <div className={styles.tilesHead}>
        <h2 id={`dukjil-tiles-${slug}`}>{dukjilText(locale, "dukjilTodayTitle")}</h2>
        <p>{dukjilText(locale, "dukjilTodaySummary", [today.totalPoints.toLocaleString(locale), todayStampCount(state.today)])}</p>
      </div>
      <ul className={styles.tileList}>
        {view.map(({ tile, done, points, remaining, stamped }) => {
          const badge = done ? <EarnBadge variant="done" locale={locale} /> : tile.action === "checkin" ? (checkin.points === undefined ? null : <EarnBadge variant="inline" locale={locale} points={checkin.points} stamp />) : <EarnBadge variant="inline" locale={locale} points={points} stamp={stamped} remaining={remaining} />;
          const body = <><span className={styles.tileName}>{dukjilText(locale, tile.label)}</span>{badge}</>;
          return (
            <li key={tile.action}>
              {tile.action === "checkin"
                ? <button type="button" className={styles.tile} data-done={done} onClick={onAttendance}>{body}</button>
                : <Link className={styles.tile} data-done={done} href={tile.href as Route}>{body}</Link>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
