"use client";
import Link from "next/link";
import type { Route } from "next";
import { useId, type ReactNode } from "react";
import { ArrowRight, Check, Stamp } from "lucide-react";
import { activityLabel } from "@/features/dukjil-guide/ui/guide-copy";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanAction } from "@/components/fan-ui/fan-action";
import { fanLoginHref } from "@/components/login-href";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { benefitsRaffleState } from "@/features/groups/ui/group-benefits-copy";
import type { DukjilActionKey } from "@/features/passport/domain/dukjil-types";
import type { AppLocale } from "@/i18n/locales";
import { activeToday, checkinNumbers, missionProgress, todayStampCount } from "../domain/dukjil-ui";
import { dukjilText } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import { EarnBadge } from "./earn-badge";
import styles from "./fan-missions.module.css";
import inkStyles from "@/components/fan-ui/fan-ink.module.css";

type MissionKey = "checkin" | DukjilActionKey;
type Mission = { key: MissionKey; label: string; task?: string; art: string; href: string };

const LEGACY_KEYS: readonly MissionKey[] = ["checkin", "post", "comment"];

/** A page with no creator (모임·취미·브랜드): where its activities happen. Its posts and comments pay no points and have no daily count on the server, so these rows carry neither. */
export type GroupMissionLinks = { write: string; comment: string };

/** One row per fan activity: what to do, the points, today's count against the daily limit, a stamp when done. Pressing a row goes to where that activity happens. `all` lists every catalog activity with an all-clear row on top (the 덕질 tab); without it a page shows its six main ones. */
export function FanMissions({ locale, slug, title, passportHref, proofHref, footer, onAttendance, group, all = false, noPage }: { locale: AppLocale; slug: string; title: string; passportHref: string; proofHref: string; footer?: ReactNode; onAttendance: (trigger: HTMLElement) => void; group?: GroupMissionLinks; all?: boolean; /** Where the activity rows go while the viewer has no page to do them on. */ noPage?: string }) {
  const state = useDukjil();
  const headingId = useId();
  const on = state?.status === "on";
  const guest = state?.status !== "loading" && state?.authenticated === false;
  const today = activeToday(state?.today);
  const pending = !guest && (state?.status === "loading" || (on && !state?.today && !state?.todayFailure));
  const t = (key: Parameters<typeof dukjilText>[1]) => dukjilText(locale, key);
  const board = noPage ?? `/${slug}?tab=board&source=fans&locale=${locale}`, compose = noPage ?? `/${slug}?tab=board&source=fans&compose=1&locale=${locale}`, proof = noPage ?? proofHref, live = `/live?locale=${locale}`;
  const checkinMission: Mission = { key: "checkin", label: t("dukjilTileAttendance"), task: t("missionTaskCheckin"), art: "daily-checkin", href: `/my/wallet?view=attendance&locale=${locale}` };
  const main: Mission[] = group ? [
    checkinMission,
    { key: "post", label: t("dukjilTilePost"), task: t("missionTaskPost"), art: "post", href: group.write },
    { key: "comment", label: t("dukjilTileComment"), task: t("missionTaskComment"), art: "first-comment", href: group.comment },
    { key: "proof", label: t("dukjilTileProof"), task: t("missionTaskProof"), art: "proof", href: proofHref },
  ] : [
    checkinMission,
    { key: "post", label: t("dukjilTilePost"), task: t("missionTaskPost"), art: "post", href: compose },
    { key: "comment", label: t("dukjilTileComment"), task: t("missionTaskComment"), art: "first-comment", href: board },
    { key: "share", label: t("dukjilTileShare"), task: t("missionTaskShare"), art: "share", href: passportHref.includes("/passports/") ? `${passportHref}#stamp-book` : passportHref },
    { key: "invite", label: t("dukjilTileInvite"), task: t("missionTaskInvite"), art: "invite", href: `/my/invitations?locale=${locale}` },
    { key: "proof", label: t("dukjilTileProof"), task: t("missionTaskProof"), art: "proof", href: proof },
  ];
  const more: Mission[] = all && !group ? [
    { key: "reaction", label: activityLabel(locale, "reaction"), art: "first-like", href: board },
    { key: "quiz", label: activityLabel(locale, "quiz"), task: t("missionTaskQuiz"), art: "welcome", href: noPage ?? `/c/${encodeURIComponent(slug)}/verify?locale=${locale}` },
    { key: "subscription", label: activityLabel(locale, "subscription"), task: t("missionTaskSubscription"), art: "subscription", href: proof },
    { key: "live_reserve", label: activityLabel(locale, "live_reserve"), art: "reservation", href: live },
    { key: "live_attend", label: activityLabel(locale, "live_attend"), art: "attendance", href: live },
    { key: "survey", label: activityLabel(locale, "survey"), art: "survey", href: live },
    { key: "mission", label: activityLabel(locale, "mission"), art: "mission", href: live },
    { key: "event_checkin", label: activityLabel(locale, "event_checkin"), art: "event-checkin", href: noPage ?? `/${slug}?locale=${locale}` },
    { key: "event_review", label: activityLabel(locale, "event_review"), art: "event-review", href: noPage ?? `/${slug}?locale=${locale}` },
  ] : [];
  const missions = [...main, ...more];
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
  const counted = view.filter(row => row.limit !== null && row.count !== undefined);
  const cleared = counted.filter(row => row.done).length;
  const stamps = todayStampCount(state?.today);
  const rows = (
    <ul className={styles.cards}>
      {view.map(({ mission, points, count, limit, remaining, done }) => {
        const finished = !guest && done;
        const body = (
          <>
            <img className={styles.art} src={`/images/stamps/ink-v1/${mission.art}.webp`} alt="" width={40} height={40} loading="lazy" />
            <span className={styles.copy}>
              <span className={styles.nameRow}>
                <strong>{mission.label}</strong>
                {on && Boolean(points) && !finished && <EarnBadge variant="inline" locale={locale} points={points} remaining={guest ? null : remaining} className={styles.badge} />}
              </span>
              {mission.task && <span className={styles.task}>{mission.task}</span>}
              {!guest && !group && (pending || count === undefined ? (on || pending) && !state?.todayFailure && <span className={styles.progress} aria-hidden="true"><FanSkeleton width="100%" height={6} /></span>
                : limit !== null && (
                  <span className={styles.progress}>
                    <span className={styles.bar} role="progressbar" aria-label={mission.label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(count, limit)}><i style={{ width: `${Math.min(100, Math.round((count / limit) * 100))}%` }} data-done={done} /></span>
                    <span className={styles.count}>{done && <Check size={12} aria-hidden="true" />}{count.toLocaleString(locale)}/{limit.toLocaleString(locale)}</span>
                  </span>
                ))}
            </span>
            {finished ? <span className={styles.doneMark}><img src={`/images/stamps/ink-v1/${mission.art}.webp`} alt="" width={32} height={32} loading="lazy" />{dukjilText(locale, "missionDoneShort")}</span> : <ArrowRight className={styles.arrow} size={16} aria-hidden="true" />}
          </>
        );
        return (
          <li key={mission.key} data-mission={mission.key} data-done={finished}>
            {guest ? <Link className={styles.card} href={fanLoginHref(locale, mission.href) as Route}>{body}</Link>
              : mission.key === "checkin" ? <Link className={styles.card} href={mission.href as Route} onClick={event => { if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onAttendance(event.currentTarget); }}>{body}</Link>
              : <Link className={styles.card} href={mission.href as Route}>{body}</Link>}
          </li>
        );
      })}
    </ul>
  );
  return (
    <section className={`${styles.section} ${all ? styles.full : ""} ${inkStyles.palette}`} aria-labelledby={headingId} data-fan-missions>
      <div className={styles.head}>
        <h2 id={headingId}>{title}</h2>
        {on && today && !guest && (
          <div className={styles.summary} role="group" aria-label={dukjilText(locale, "dukjilTodaySummary", [today.totalPoints.toLocaleString(locale), stamps])}>
            <EarnBadge variant="inline" locale={locale} points={today.totalPoints} today />
            {stamps > 0 && <span className={styles.stamps} aria-hidden="true"><Stamp size={16} />{stamps.toLocaleString(locale)}</span>}
          </div>
        )}
        {pending && <span className={styles.summary} aria-hidden="true"><FanSkeleton width={96} height={20} /></span>}
        {guest && state?.status === "on" && <div className={styles.summary}><FanLockedValue locale={locale} /></div>}
      </div>
      {all && !group && on ? (
        <div className={styles.box}>
          <div className={styles.allClear} data-all-clear>
            <strong>{dukjilText(locale, "missionsAllClear")}</strong>
            {guest || !today ? <span aria-hidden="true" /> : (
              <span className={styles.allClearBar}>
                <span className={styles.bar} role="progressbar" aria-label={dukjilText(locale, "missionsAllClear")} aria-valuemin={0} aria-valuemax={counted.length} aria-valuenow={cleared}><i style={{ width: `${counted.length ? Math.round((cleared / counted.length) * 100) : 0}%` }} /></span>
                <span className={styles.count}>{cleared.toLocaleString(locale)}/{counted.length.toLocaleString(locale)}</span>
              </span>
            )}
            <span className={styles.allClearSoon}>{benefitsRaffleState(locale, "preparing")}</span>
          </div>
          {rows}
        </div>
      ) : rows}
      {state?.todayFailure && !guest && <FanState inline compact kind="error" title={dukjilText(locale, "dukjilLoadError")} actions={<FanAction variant="text" onClick={state.refresh}>{walletCopy(locale).retry}</FanAction>} />}
      {footer && <div className={styles.footer}>{footer}</div>}
    </section>
  );
}
