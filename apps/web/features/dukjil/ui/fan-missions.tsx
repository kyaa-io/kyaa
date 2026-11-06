"use client";
import Link from "next/link";
import type { Route } from "next";
import { useId, type ReactNode } from "react";
import { ArrowRight, Check, Stamp } from "lucide-react";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanAction } from "@/components/fan-ui/fan-action";
import { fanLoginHref } from "@/components/login-href";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import type { DukjilActionKey } from "@/features/passport/domain/dukjil-types";
import type { AppLocale } from "@/i18n/locales";
import { activeToday, checkinNumbers, missionProgress, todayStampCount } from "../domain/dukjil-ui";
import { dukjilText, type DukjilCopyKey } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import { EarnBadge } from "./earn-badge";
import styles from "./fan-missions.module.css";
import inkStyles from "@/components/fan-ui/fan-ink.module.css";

type MissionKey = "checkin" | Extract<DukjilActionKey, "post" | "comment" | "share" | "invite" | "proof">;
type Mission = { key: MissionKey; label: DukjilCopyKey; task: DukjilCopyKey; art: string; href: string };

const LEGACY_KEYS: readonly MissionKey[] = ["checkin", "post", "comment"];

/** A page with no creator (모임·취미·브랜드): where its activities happen. Its posts and comments pay no points and have no daily count on the server, so these rows carry neither. */
export type GroupMissionLinks = { write: string; comment: string };

/** One card per fan activity: what to do, the points, today's count against the daily limit. Pressing a card goes to where that activity happens. Replaces the separate 오늘의 덕질 tiles and 팬 활동 rows of the side column. */
export function FanMissions({ locale, slug, title, passportHref, proofHref, footer, onAttendance, group }: { locale: AppLocale; slug: string; title: string; passportHref: string; proofHref: string; footer?: ReactNode; onAttendance: (trigger: HTMLElement) => void; group?: GroupMissionLinks }) {
  const state = useDukjil();
  const headingId = useId();
  const on = state?.status === "on";
  const guest = state?.status !== "loading" && state?.authenticated === false;
  const today = activeToday(state?.today);
  const pending = !guest && (state?.status === "loading" || (on && !state?.today && !state?.todayFailure));
  const checkinMission: Mission = { key: "checkin", label: "dukjilTileAttendance", task: "missionTaskCheckin", art: "daily-checkin", href: `/my/wallet?view=attendance&locale=${locale}` };
  const missions: Mission[] = group ? [
    checkinMission,
    { key: "post", label: "dukjilTilePost", task: "missionTaskPost", art: "post", href: group.write },
    { key: "comment", label: "dukjilTileComment", task: "missionTaskComment", art: "first-comment", href: group.comment },
    { key: "proof", label: "dukjilTileProof", task: "missionTaskProof", art: "proof", href: proofHref },
  ] : [
    checkinMission,
    { key: "post", label: "dukjilTilePost", task: "missionTaskPost", art: "post", href: `/${slug}?tab=board&source=fans&compose=1&locale=${locale}` },
    { key: "comment", label: "dukjilTileComment", task: "missionTaskComment", art: "first-comment", href: `/${slug}?tab=board&source=fans&locale=${locale}` },
    { key: "share", label: "dukjilTileShare", task: "missionTaskShare", art: "share", href: passportHref.includes("/passports/") ? `${passportHref}#stamp-book` : passportHref },
    { key: "invite", label: "dukjilTileInvite", task: "missionTaskInvite", art: "invite", href: `/my/invitations?locale=${locale}` },
    { key: "proof", label: "dukjilTileProof", task: "missionTaskProof", art: "proof", href: proofHref },
  ];
  const checkin = checkinNumbers(state?.catalog);
  const checkedIn = state?.attendance?.attendedToday ?? false;
  const view = missions
    .filter(mission => group ? true : on ? Boolean(state?.catalog?.rules[mission.key]) : state?.status === "off" ? LEGACY_KEYS.includes(mission.key) : true)
    .map(mission => {
      if (group) return { mission, points: mission.key === "checkin" ? checkin.points : undefined, count: undefined, limit: null, remaining: null, done: false };
      if (mission.key === "checkin") return { mission, points: checkin.points, count: state?.attendanceKnown ? Number(checkedIn) : undefined, limit: 1 as number | null, remaining: null as number | null, done: checkedIn };
      return { mission, ...missionProgress(state?.catalog, state?.today, mission.key) };
    })
    .sort((a, b) => Number(a.done) - Number(b.done));
  return (
    <section className={`${styles.section} ${inkStyles.palette}`} aria-labelledby={headingId} data-fan-missions>
      <div className={styles.head}>
        <h2 id={headingId}>{title}</h2>
        {on && today && !guest && (
          <div className={styles.summary} role="group" aria-label={dukjilText(locale, "dukjilTodaySummary", [today.totalPoints.toLocaleString(locale), todayStampCount(state?.today)])}>
            <span aria-hidden="true"><img src="/images/economy/point-coin.svg" width={24} height={24} alt="" />{today.totalPoints.toLocaleString(locale)}P</span>
            <span aria-hidden="true"><Stamp size={24} />{dukjilText(locale, "dukjilStampCount", [todayStampCount(state?.today)])}</span>
          </div>
        )}
        {pending && <span className={styles.summary} aria-hidden="true"><FanSkeleton width={120} height={36} /></span>}
        {guest && state?.status === "on" && <div className={styles.summary}><FanLockedValue locale={locale} /></div>}
      </div>
      <ul className={styles.cards}>
        {view.map(({ mission, points, count, limit, remaining, done }) => {
          const body = (
            <>
              <img className={styles.art} src={`/images/stamps/ink-v1/${mission.art}.webp`} alt="" width={40} height={40} loading="lazy" />
              <span className={styles.copy}>
                <span className={styles.nameRow}>
                  <strong>{dukjilText(locale, mission.label)}</strong>
                  {!guest && done ? <EarnBadge variant="done" locale={locale} className={styles.badge} /> : on && Boolean(points) && <EarnBadge variant="inline" locale={locale} points={points} remaining={guest ? null : remaining} className={styles.badge} />}
                </span>
                <span className={styles.task}>{dukjilText(locale, mission.task)}</span>
                {!guest && !group && (pending || count === undefined ? (on || pending) && !state?.todayFailure && <span className={styles.progress} aria-hidden="true"><FanSkeleton width="100%" height={6} /></span>
                  : limit !== null && (
                    <span className={styles.progress}>
                      <span className={styles.bar} role="progressbar" aria-label={dukjilText(locale, mission.label)} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(count, limit)}><i style={{ width: `${Math.min(100, Math.round((count / limit) * 100))}%` }} data-done={done} /></span>
                      <span className={styles.count}>{done && <Check size={12} aria-hidden="true" />}{count.toLocaleString(locale)}/{limit.toLocaleString(locale)}</span>
                    </span>
                  ))}
              </span>
              <ArrowRight className={styles.arrow} size={16} aria-hidden="true" />
            </>
          );
          return (
            <li key={mission.key} data-mission={mission.key} data-done={!guest && done}>
              {guest ? <Link className={styles.card} href={fanLoginHref(locale, mission.href) as Route}>{body}</Link>
                : mission.key === "checkin" ? <Link className={styles.card} href={mission.href as Route} onClick={event => { if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onAttendance(event.currentTarget); }}>{body}</Link>
                : <Link className={styles.card} href={mission.href as Route}>{body}</Link>}
            </li>
          );
        })}
      </ul>
      {state?.todayFailure && !guest && <FanState inline compact kind="error" title={dukjilText(locale, "dukjilLoadError")} actions={<FanAction variant="text" onClick={state.refresh}>{walletCopy(locale).retry}</FanAction>} />}
      {footer && <div className={styles.footer}>{footer}</div>}
    </section>
  );
}
