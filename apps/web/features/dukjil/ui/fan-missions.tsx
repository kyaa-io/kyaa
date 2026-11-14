"use client";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import { FanMissionList, FanMissionRow, MissionArt, MissionDoneStamp } from "./fan-mission-row";
import { activityLabel } from "@/features/dukjil-guide/ui/guide-copy";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { CertificationGrid } from "@/features/certification/ui/certification-grid";
import { fanLoginHref } from "@/components/login-href";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import type { DukjilActionKey } from "@/features/passport/domain/dukjil-types";
import type { AppLocale } from "@/i18n/locales";
import { activeToday, checkinNumbers, missionProgress } from "../domain/dukjil-ui";
import { dukjilText } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import { useAttendedAnywhereToday } from "./use-attended-anywhere";
import { EarnBadge } from "./earn-badge";
import styles from "./fan-missions.module.css";
import inkStyles from "@/components/fan-ui/fan-ink.module.css";

type MissionKey = "checkin" | DukjilActionKey;
type Mission = { key: MissionKey; label: string; art: string; href: string };

const LEGACY_KEYS: readonly MissionKey[] = ["checkin", "post", "comment"];

/** A page with no creator (모임·취미·브랜드): where its activities happen. Its posts and comments pay no points and have no daily count on the server, so these rows carry neither. */
export type GroupMissionLinks = { write: string; comment: string };

/** One row per fan activity: what to do, the points, today's count against the daily limit, a stamp when done. Pressing a row goes to where that activity happens. `all` lists every catalog activity with an all-clear row on top (the 덕질 tab); without it a page shows its main activities. */
export function FanMissions({ locale, slug, title, titleSuffix, passportHref, proofHref, footer, onAttendance, group, all = false, noPage, preview }: { locale: AppLocale; slug: string; title: string; titleSuffix?: ReactNode; passportHref: string; proofHref: string; footer?: ReactNode; onAttendance: (trigger: HTMLElement) => void; group?: GroupMissionLinks; all?: boolean; /** Where the activity rows go while the viewer has no page to do them on. */ noPage?: string; /** Show only this many rows first; the rest open with `전체 보기 ›` on the title line (팬페이지 390, PM 11/13: no long column of seven rows). */ preview?: number }) {
  const state = useDukjil();
  const anywhere = useAttendedAnywhereToday(!group && state?.authenticated === true);
  const headingId = useId();
  const listId = useId();
  const [showAll, setShowAll] = useState(false);
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
    { key: "reaction", label: activityLabel(locale, "reaction"), art: "first-like", href: board },
    { key: "share", label: t("dukjilTileShare"), art: "share", href: noPage ?? `/${slug}?tab=certifications&share=1&locale=${locale}` },
    { key: "invite", label: t("dukjilTileInvite"), art: "invite", href: `/my/invitations?locale=${locale}` },
    { key: "proof", label: t("dukjilTileProof"), art: "proof", href: proof },
  ];
  const more: Mission[] = all && !group ? [
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
  // M4-3: the 출석 mission is done when the fan checked in on any page today (the favorite's own read, or the joined-pages read).
  const checkedIn = (state?.attendance?.attendedToday ?? false) || anywhere.attended;
  const checkinKnown = checkedIn || anywhere.known || (anywhere.failed && Boolean(state?.attendanceKnown));
  const view = missions
    .filter(mission => group ? true : on ? Boolean(state?.catalog?.rules[mission.key]) : state?.status === "off" ? LEGACY_KEYS.includes(mission.key) : true)
    .map(mission => {
      if (group) return { mission, points: mission.key === "checkin" ? checkin.points : undefined, count: undefined, limit: null, remaining: null, done: false, period: "day" as const };
      if (mission.key === "checkin") return { mission, points: checkin.points, count: checkinKnown ? Number(checkedIn) : undefined, limit: 1 as number | null, remaining: null as number | null, done: checkedIn, period: "day" as const };
      return { mission, ...missionProgress(state?.catalog, state?.today, mission.key) };
    });
  // Catalog order stays put when a mission is done; completion only tints the row.
  const rowList = (list: typeof view, id?: string) => (
    <FanMissionList id={id} className={styles.cards}>
      {list.map(({ mission, points, count, limit, remaining, done, period }, index) => {
        const finished = !guest && done;
        // B3 · D4 (대표 11/14 02:01): the count sits right after the activity's name and the bar fills the line below, on a page's 팬 활동 card and on the 덕질 tab alike.
        const countCell = (className: string, shown: number, max: number) => <span className={className} data-mission-count=""><span className={styles.countCheck} aria-hidden="true">{done && <Check size={12} />}</span><span className={styles.countValue}>{shown.toLocaleString(locale)}/{max.toLocaleString(locale)}</span></span>;
        const nameCount = !guest && !group && !pending && count !== undefined && limit !== null ? countCell(styles.nameCount, count, limit) : null;
        const progress = !guest && !group && (pending || count === undefined ? (on || pending) && !state?.todayFailure && <span className={styles.progress} aria-hidden="true"><FanSkeleton width="100%" height={6} /></span>
          : limit !== null && (
            <span className={styles.progress}>
              <span className={styles.bar} role="progressbar" aria-label={mission.label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(count, limit)}><i style={{ "--mission-fill": Math.min(1, count / limit) } as CSSProperties} data-done={done} /></span>
              {!nameCount && countCell(styles.count, count, limit)}
            </span>
          ));
        const href = guest ? fanLoginHref(locale, mission.href) : mission.href;
        const onClick = !guest && mission.key === "checkin" ? (event: MouseEvent<HTMLAnchorElement>) => { if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onAttendance(event.currentTarget); } : undefined;
        // D1 · F3: every row is the shared FanMissionRow (circle art · title · progress at the title's x · one fixed trailing column).
        // The trailing column holds the done tag or the reward.
        return <FanMissionRow mobileExtra={all && !group && on && index >= 6} key={mission.key} dataMission={mission.key} done={finished} href={href} onClick={onClick}
          art={<MissionArt src={`/images/stamps/ink-v1/${mission.art}.webp`} />}
          title={nameCount ? <>{mission.label}{nameCount}</> : mission.label}
          detail={progress || undefined}
          trailing={finished ? <MissionDoneStamp label={dukjilText(locale, "missionDoneShort")} />
            : on && points ? <EarnBadge variant="inline" className={styles.reward} locale={locale} points={points} remaining={guest ? null : remaining} remainingPer={period} /> : undefined} />;
      })}
    </FanMissionList>
  );
  const capped = !all && preview !== undefined && view.length > preview;
  const rows = rowList(capped && !showAll ? view.slice(0, preview) : view, capped ? listId : undefined);
  // 덕질 tab: three folds. Today = check-in and every activity with a daily limit; the rest wait in "more"; proof is the certification grid.
  const isDaily = (key: MissionKey) => key === "checkin" || Boolean(ruleDailyLimit(state?.catalog?.rules[key]));
  const todayRows = view.filter(row => isDaily(row.mission.key));
  const moreRows = view.filter(row => !isDaily(row.mission.key) && row.mission.key !== "proof");
  const todayLeft = guest ? todayRows.length : todayRows.filter(row => !row.done).length;
  const todayKnown = !guest && !pending && todayRows.every(row => row.count !== undefined);
  const nudge = useNudgeOnce(on && !guest && todayKnown && todayLeft > 0);
  const [expanded, setExpanded] = useState(false);
  const unfoldedRows = [...todayRows, ...moreRows];
  const folds = <div className={styles.unfolded} data-expanded={expanded} data-nudge={nudge ? "" : undefined}>
    <div className={styles.unfoldedGrid}>
      {rowList(unfoldedRows)}
      {state?.catalog?.rules.proof && <CertificationGrid variant="rows" locale={locale} slug={noPage ? "" : slug} guest={guest} fallbackHref={guest ? `/benefits?locale=${locale}` : proof} mobileVisible={Math.max(0, 6 - unfoldedRows.length)} />}
    </div>
    <FanAction variant="text" className={styles.moreButton} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? (locale === "ko" ? "접기" : "Show less") : (locale === "ko" ? "더 보기" : "Show more")}</FanAction>
  </div>;
  const folded = all && !group && on;
  return (
    <section className={`${styles.section} ${all ? styles.full : styles.compact} ${inkStyles.palette}`} aria-labelledby={headingId} data-fan-missions>
      <div className={styles.head}>
        <div className={styles.headingGroup}><h2 id={headingId}>{title}</h2>{titleSuffix}</div>
        {!folded && on && today && !guest && (
          <div className={styles.summary}>
            {/* C8: no stamp icon box here. Stamps are counted on the passport (덕질 and MY); a finished mission says what it paid. */}
            <EarnBadge variant="inline" locale={locale} points={today.totalPoints} today />
          </div>
        )}
        {pending && <span className={styles.summary} aria-hidden="true"><FanSkeleton width={96} height={20} /></span>}
        {guest && state?.status === "on" && !folded && <div className={styles.summary}><FanLockedValue locale={locale} /></div>}
        {capped && <FanSectionLink onClick={() => setShowAll(value => !value)} expanded={showAll} controls={listId}>{fanUiText(locale, showAll ? "collapse" : "viewAll")}</FanSectionLink>}
      </div>
      {folded ? folds : rows}
      {state?.todayFailure && !guest && <FanState inline compact kind="error" title={dukjilText(locale, "dukjilLoadError")} actions={<FanAction variant="text" onClick={state.refresh}>{walletCopy(locale).retry}</FanAction>} />}
      {footer && <div className={styles.footer}>{footer}</div>}
    </section>
  );
}

const ruleDailyLimit = (rule: unknown) => { const value = (rule as { dailyLimit?: unknown } | undefined)?.dailyLimit; return typeof value === "number" && value > 0 ? value : null; };

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
