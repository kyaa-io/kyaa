"use client";
import Link from "next/link";
import type { Route } from "next";
import { useId, type ReactNode } from "react";
import { BadgeCheck, BellRing, CalendarCheck, CircleHelp, ClipboardList, Heart, MapPin, MessageCircle, Pencil, Radio, Share2, Star, Target, UserPlus, type LucideIcon } from "@/components/fan-ui/stan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import type { MouseEvent } from "react";
import { FanMissionFoldRow, FanMissionList, FanMissionRow, MissionBar, MissionDone, MissionReward } from "./fan-mission-row";
import { activityLabel } from "@/features/dukjil-guide/ui/guide-copy";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanCollapsible } from "@/components/fan-ui/fan-collapsible";
import { CertificationGrid } from "@/features/certification/ui/certification-grid";
import { fanLoginHref } from "@/components/login-href";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import type { DukjilActionKey } from "@/features/passport/domain/dukjil-types";
import type { AppLocale } from "@/i18n/locales";
import { activeToday, checkinNumbers, missionProgress } from "../domain/dukjil-ui";
import { dukjilText } from "./dukjil-copy";
import { useDukjil } from "./dukjil-provider";
import { EarnBadge } from "./earn-badge";
import { useAttendedAnywhereToday } from "./use-attended-anywhere";
import styles from "./fan-missions.module.css";
import inkStyles from "@/components/fan-ui/fan-ink.module.css";

type MissionKey = "checkin" | DukjilActionKey;
type Mission = { key: MissionKey; label: string; art: string; href: string };

/** Mission icons (DESIGN E-2): lucide, stroke 1.5, 20 inside the 40 line circle; the stamp art stays on the passport. */
const MISSION_ICONS: Partial<Record<MissionKey, LucideIcon>> = {
  checkin: CalendarCheck, post: Pencil, comment: MessageCircle, share: Share2, reaction: Heart, invite: UserPlus, proof: BadgeCheck,
  quiz: CircleHelp, live_reserve: Radio, live_attend: Radio, survey: ClipboardList, subscription: BellRing, mission: Target, event_checkin: MapPin, event_review: Star,
};
function MissionIcon({ mission }: { mission: MissionKey }) {
  const Icon = MISSION_ICONS[mission] ?? Target;
  return <FanIcon icon={Icon} size={20} />;
}

const LEGACY_KEYS: readonly MissionKey[] = ["checkin", "post", "comment"];

/** A page with no creator (모임·취미·브랜드): where its activities happen. Its posts and comments pay no points and have no daily count on the server, so these rows carry neither. */
export type GroupMissionLinks = { write: string; comment: string };

/** One row per fan activity: what to do, the points, today's count against the daily limit, a stamp when done. Pressing a row goes to where that activity happens. `all` lists every catalog activity with an all-clear row on top (the 덕질 tab); without it a page shows its six main ones. */
export function FanMissions({ locale, slug, title, passportHref, proofHref, footer, onAttendance, group, all = false, noPage }: { locale: AppLocale; slug: string; title: string; passportHref: string; proofHref: string; footer?: ReactNode; onAttendance: (trigger: HTMLElement) => void; group?: GroupMissionLinks; all?: boolean; /** Where the activity rows go while the viewer has no page to do them on. */ noPage?: string }) {
  const state = useDukjil();
  const anywhere = useAttendedAnywhereToday(!group && state?.authenticated === true);
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
    { key: "share", label: t("dukjilTileShare"), art: "share", href: noPage ?? `/${slug}?tab=certifications&share=1&locale=${locale}` },
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
  // M4-3: the 출석 mission is done when the fan checked in on any page today (the favorite's own read, or the joined-pages read).
  const checkedIn = (state?.attendance?.attendedToday ?? false) || anywhere.attended;
  const checkinKnown = checkedIn || anywhere.known || (anywhere.failed && Boolean(state?.attendanceKnown));
  const view = missions
    .filter(mission => group ? true : on ? Boolean(state?.catalog?.rules[mission.key]) : state?.status === "off" ? LEGACY_KEYS.includes(mission.key) : true)
    .map(mission => {
      if (group) return { mission, points: mission.key === "checkin" ? checkin.points : undefined, count: undefined, limit: null, remaining: null, done: false };
      if (mission.key === "checkin") return { mission, points: checkin.points, count: checkinKnown ? Number(checkedIn) : undefined, limit: 1 as number | null, remaining: null as number | null, done: checkedIn };
      return { mission, ...missionProgress(state?.catalog, state?.today, mission.key) };
    })
    .sort((a, b) => Number(a.done) - Number(b.done));
  const rowList = (list: typeof view) => (
    <FanMissionList className={styles.cards}>
      {list.map(({ mission, points, count, limit, done }) => {
        const finished = !guest && done;
        const known = !guest && !group && !pending && count !== undefined;
        const loadingBar = !guest && !group && (pending || count === undefined) && (on || pending) && !state?.todayFailure;
        const href = guest ? fanLoginHref(locale, mission.href) : mission.href;
        // 출석 is a row like the others (no button inside): pressing it opens the check-in dialog.
        const onClick = !guest && mission.key === "checkin" ? (event: MouseEvent<HTMLAnchorElement>) => { if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onAttendance(event.currentTarget); } : undefined;
        return <FanMissionRow key={mission.key} dataMission={mission.key} done={finished} href={href} onClick={onClick}
          art={<MissionIcon mission={mission.key} />}
          title={<><span>{mission.label}</span>{known && limit !== null ? <span className={styles.count}>{count.toLocaleString(locale)}/{limit.toLocaleString(locale)}</span> : null}</>}
          detail={known && limit !== null ? <MissionBar value={count} max={limit} label={mission.label} /> : loadingBar ? <span className={styles.barPending} aria-hidden="true"><FanSkeleton width="100%" height={2} /></span> : undefined}
          trailing={finished ? <MissionDone label={dukjilText(locale, "missionDoneShort")} /> : (on || group) && points ? <MissionReward points={points} locale={locale} /> : undefined} />;
      })}
    </FanMissionList>
  );
  const rows = rowList(view);
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
  // F3: today's rows open the card under the section head (which says how many are left); the other two groups fold behind heads drawn as rows.
  const folds = (
    <div className={styles.folds}>
      <div className={styles.fold} data-missions-today="">{rowList(todayRows)}</div>
      {moreRows.length > 0 && <FanCollapsible persistKey="dukjil-missions:more" className={styles.fold}
        trigger={({ triggerProps }) => <FanMissionFoldRow {...triggerProps} title={t("missionsGroupMore")} count={t("missionsMoreCount", [moreRows.length.toLocaleString(locale)])}
          points={morePoints ? `+${morePoints.toLocaleString(locale)}P` : undefined} />}>
        {rowList(moreRows)}
      </FanCollapsible>}
      {state?.catalog?.rules.proof && <FanCollapsible persistKey="dukjil-missions:proof" className={styles.fold}
        trigger={({ triggerProps }) => <FanMissionFoldRow {...triggerProps} title={t("missionsGroupProof")} points={proofPoints ? `+${proofPoints.toLocaleString(locale)}P` : undefined} />}>
        <div className={styles.proofRows}><CertificationGrid variant="rows" locale={locale} slug={noPage ? "" : slug} guest={guest} fallbackHref={guest ? `/benefits?locale=${locale}` : proof} /></div>
      </FanCollapsible>}
    </div>
  );
  const folded = all && !group && on;
  return (
    <section className={`${styles.section} ${all ? styles.full : ""} ${inkStyles.palette}`} aria-labelledby={headingId} data-fan-missions data-block={all ? "list" : undefined}>
      <div className={styles.head}>
        <h2 id={headingId}>{title}</h2>
        {folded && !guest && todayKnown && <span className={styles.summary} data-missions-left="" data-mission-reset="" data-meta="">{todayAllDone ? t("missionsTodayDone") : t("missionsGroupLeft", [todayLeft.toLocaleString(locale)])} · {t("missionsReset")}</span>}
        {!folded && on && today && !guest && (
          <div className={styles.summary}>
            {/* C8: no stamp icon box here. Stamps are counted on the passport (덕질 and MY); a finished mission says what it paid. */}
            <EarnBadge variant="inline" locale={locale} points={today.totalPoints} today />
          </div>
        )}
        {pending && <span className={styles.summary} aria-hidden="true"><FanSkeleton width={96} height={20} /></span>}
        {guest && state?.status === "on" && !folded && <div className={styles.summary}><FanLockedValue locale={locale} /></div>}
      </div>
      {folded ? folds : rows}
      {state?.todayFailure && !guest && <FanState inline compact kind="error" title={dukjilText(locale, "dukjilLoadError")} actions={<FanAction variant="text" onClick={state.refresh}>{walletCopy(locale).retry}</FanAction>} />}
      {footer && <div className={styles.footer}>{footer}</div>}
    </section>
  );
}

const ruleDailyLimit = (rule: unknown) => { const value = (rule as { dailyLimit?: unknown } | undefined)?.dailyLimit; return typeof value === "number" && value > 0 ? value : null; };
