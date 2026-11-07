"use client";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import { FanTag } from "@/components/fan-ui/fan-tag";
import type { MouseEvent } from "react";
import { FanMissionList, FanMissionRow, MissionArt } from "./fan-mission-row";
import { activityLabel } from "@/features/dukjil-guide/ui/guide-copy";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanCollapsible, FanCollapsibleTrigger } from "@/components/fan-ui/fan-collapsible";
import { FanGauge } from "@/components/fan-ui/fan-number";
import { CertificationGrid } from "@/features/certification/ui/certification-grid";
import { fanLoginHref } from "@/components/login-href";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import type { DukjilActionKey } from "@/features/passport/domain/dukjil-types";
import type { AppLocale } from "@/i18n/locales";
import { activeToday, checkinNumbers, missionProgress } from "../domain/dukjil-ui";
import { dukjilText } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import { EarnBadge, EarnRemaining } from "./earn-badge";
import styles from "./fan-missions.module.css";
import inkStyles from "@/components/fan-ui/fan-ink.module.css";

type MissionKey = "checkin" | DukjilActionKey;
type Mission = { key: MissionKey; label: string; art: string; href: string };

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
  const t = (key: Parameters<typeof dukjilText>[1], values?: readonly unknown[]) => dukjilText(locale, key, values);
  const board = noPage ?? `/${slug}?tab=board&source=fans&locale=${locale}`, compose = noPage ?? `/${slug}?tab=board&source=fans&compose=1&locale=${locale}`, proof = noPage ?? proofHref, live = `/live?locale=${locale}`;
  const checkinMission: Mission = { key: "checkin", label: t("dukjilTileAttendance"), art: "daily-checkin", href: `/my/wallet?view=attendance&locale=${locale}` };
  const main: Mission[] = group ? [
    checkinMission,
    { key: "post", label: t("dukjilTilePost"), art: "post", href: group.write },
    { key: "comment", label: t("dukjilTileComment"), art: "first-comment", href: group.comment },
    { key: "proof", label: t("dukjilTileProof"), art: "proof", href: proofHref },
  ] : [
    checkinMission,
    { key: "post", label: t("dukjilTilePost"), art: "post", href: compose },
    { key: "comment", label: t("dukjilTileComment"), art: "first-comment", href: board },
    { key: "share", label: t("dukjilTileShare"), art: "share", href: passportHref.includes("/passports/") ? `${passportHref}#stamp-book` : passportHref },
    { key: "invite", label: t("dukjilTileInvite"), art: "invite", href: `/my/invitations?locale=${locale}` },
    { key: "proof", label: t("dukjilTileProof"), art: "proof", href: proof },
  ];
  const more: Mission[] = all && !group ? [
    { key: "reaction", label: activityLabel(locale, "reaction"), art: "first-like", href: board },
    { key: "quiz", label: activityLabel(locale, "quiz"), art: "welcome", href: noPage ?? `/c/${encodeURIComponent(slug)}/verify?locale=${locale}` },
    { key: "subscription", label: activityLabel(locale, "subscription"), art: "subscription", href: proof },
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
  const rowList = (list: typeof view, compact: boolean) => (
    <FanMissionList className={styles.cards}>
      {list.map(({ mission, points, count, limit, remaining, done }) => {
        const finished = !guest && done;
        const capMax = compact && mission.key === "invite" ? ruleCapMax(state?.catalog?.rules.invite) : null;
        const progress = !guest && !group && (pending || count === undefined ? (on || pending) && !state?.todayFailure && <span className={styles.progress} aria-hidden="true"><FanSkeleton width="100%" height={6} /></span>
          : limit !== null && (compact
            ? <span className={styles.progress}><FanGauge size="sm" className={styles.gauge} value={Math.min(count, limit)} max={limit} label={mission.label} valueText={`${count.toLocaleString(locale)}/${limit.toLocaleString(locale)}`} /></span>
            : (
            <span className={styles.progress}>
              <span className={styles.bar} role="progressbar" aria-label={mission.label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(count, limit)}><i style={{ width: `${Math.min(100, Math.round((count / limit) * 100))}%` }} data-done={done} /></span>
              <span className={styles.count}>{done && <Check size={12} aria-hidden="true" />}{count.toLocaleString(locale)}/{limit.toLocaleString(locale)}</span>
            </span>
          )));
        const checkinAction = compact && mission.key === "checkin" && !finished && !guest && state?.attendanceKnown;
        const href = guest ? fanLoginHref(locale, mission.href) : mission.href;
        const onClick = !guest && mission.key === "checkin" ? (event: MouseEvent<HTMLAnchorElement>) => { if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onAttendance(event.currentTarget); } : undefined;
        // D1: every row is the shared FanMissionRow (art · title + reward · progress · one trailing slot).
        return <FanMissionRow key={mission.key} dataMission={mission.key} done={finished} href={href} onClick={onClick}
          art={<MissionArt src={`/images/stamps/ink-v1/${mission.art}.webp`} />}
          title={mission.label}
          badge={on && Boolean(points) && !finished ? <EarnBadge variant="inline" locale={locale} points={points} remaining={guest ? null : remaining} /> : undefined}
          detail={progress || (capMax !== null && on) ? <>{progress}{capMax !== null && on && <EarnRemaining locale={locale} limit={capMax} />}</> : undefined}
          trailing={finished ? <FanTag tone="fan" icon={<Check size={12} aria-hidden="true" />}>{dukjilText(locale, "missionDoneShort")}</FanTag>
            : checkinAction ? <span className={styles.rowAction} aria-hidden="true">{t("missionsCheckinAction")}</span> : undefined} />;
      })}
    </FanMissionList>
  );
  const rows = rowList(view, false);
  // 덕질 tab: three folds. Today = check-in and every activity with a daily limit; the rest wait in "more"; proof is the certification grid.
  const isDaily = (key: MissionKey) => key === "checkin" || Boolean(ruleDailyLimit(state?.catalog?.rules[key]));
  const todayRows = view.filter(row => isDaily(row.mission.key));
  const moreRows = view.filter(row => !isDaily(row.mission.key) && row.mission.key !== "proof");
  const todayLeft = guest ? todayRows.length : todayRows.filter(row => !row.done).length;
  const todayKnown = !guest && !pending && todayRows.every(row => row.count !== undefined);
  const todayAllDone = todayKnown && todayLeft === 0;
  // V18: a folded head says what it is worth, the sum of one round of each open row.
  const morePoints = moreRows.reduce((sum, row) => sum + (!guest && row.done ? 0 : row.points ?? 0), 0);
  const proofPoints = typeof state?.catalog?.rules.proof?.points === "number" ? state.catalog.rules.proof.points : undefined;
  const nudge = useNudgeOnce(on && !guest && todayKnown && todayLeft > 0);
  const folds = (
    <div className={styles.folds} data-nudge={nudge ? "" : undefined}>
      <FanCollapsible key={todayAllDone ? "done" : "open"} defaultOpen={!todayAllDone} persistKey={todayAllDone ? undefined : "dukjil-missions:today"} className={styles.fold}
        trigger={({ triggerProps }) => <FanCollapsibleTrigger {...triggerProps} label={<span className={styles.foldLabel}>{t("missionsGroupToday")}</span>}
          meta={todayAllDone ? t("missionsGroupAllDone") : todayKnown ? t("missionsGroupLeft", [todayLeft.toLocaleString(locale)]) : undefined} />}>
        {rowList(todayRows, true)}
      </FanCollapsible>
      {moreRows.length > 0 && <FanCollapsible persistKey="dukjil-missions:more" className={styles.fold}
        trigger={({ triggerProps }) => <FanCollapsibleTrigger {...triggerProps} label={<span className={styles.foldLabel}>{t("missionsGroupMore")}{morePoints ? <EarnBadge variant="inline" locale={locale} points={morePoints} /> : null}</span>} meta={moreRows.length.toLocaleString(locale)} />}>
        {rowList(moreRows, true)}
      </FanCollapsible>}
      {state?.catalog?.rules.proof && <FanCollapsible persistKey="dukjil-missions:proof" className={styles.fold}
        trigger={({ triggerProps }) => <FanCollapsibleTrigger {...triggerProps} label={<span className={styles.foldLabel}>{t("missionsGroupProof")}{proofPoints ? <EarnBadge variant="inline" locale={locale} points={proofPoints} /> : null}</span>} />}>
        <div className={styles.proofRows}><CertificationGrid variant="rows" locale={locale} slug={noPage ? "" : slug} guest={guest} fallbackHref={guest ? `/benefits?locale=${locale}` : proof} /></div>
      </FanCollapsible>}
    </div>
  );
  return (
    <section className={`${styles.section} ${all ? styles.full : ""} ${inkStyles.palette}`} aria-labelledby={headingId} data-fan-missions>
      <div className={styles.head}>
        <h2 id={headingId}>{title}</h2>
        {on && today && !guest && (
          <div className={styles.summary}>
            {/* C8: no stamp icon box here. Stamps are counted on the passport (덕질 and MY); a finished mission says what it paid. */}
            <EarnBadge variant="inline" locale={locale} points={today.totalPoints} today />
          </div>
        )}
        {pending && <span className={styles.summary} aria-hidden="true"><FanSkeleton width={96} height={20} /></span>}
        {guest && state?.status === "on" && <div className={styles.summary}><FanLockedValue locale={locale} /></div>}
      </div>
      {all && !group && on ? folds : rows}
      {state?.todayFailure && !guest && <FanState inline compact kind="error" title={dukjilText(locale, "dukjilLoadError")} actions={<FanAction variant="text" onClick={state.refresh}>{walletCopy(locale).retry}</FanAction>} />}
      {footer && <div className={styles.footer}>{footer}</div>}
    </section>
  );
}

const ruleDailyLimit = (rule: unknown) => { const value = (rule as { dailyLimit?: unknown } | undefined)?.dailyLimit; return typeof value === "number" && value > 0 ? value : null; };
const ruleCapMax = (rule: unknown) => { const value = (rule as { pointCap?: { max?: unknown } } | undefined)?.pointCap?.max; return typeof value === "number" && value > 0 ? value : null; };

const NUDGE_KEY = "dukjil-missions:nudged";
/** S3: the reward badges of rows not done yet pulse at most three times, on the first visit of a session only. reduced-motion: none (CSS). */
function useNudgeOnce(ready: boolean) {
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let seen = true;
    try { seen = window.sessionStorage.getItem(NUDGE_KEY) === "1"; window.sessionStorage.setItem(NUDGE_KEY, "1"); } catch { seen = true; }
    if (seen) return;
    setNudge(true);
    const timer = window.setTimeout(() => setNudge(false), 1400);
    return () => window.clearTimeout(timer);
  }, [ready]);
  return nudge;
}
