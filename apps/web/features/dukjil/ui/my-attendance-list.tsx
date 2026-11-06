"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronUp } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { groupApiQuery, groupListSchema, groupHref, type GroupPage } from "@/features/groups/domain/contracts";
import { GroupImage } from "@/features/groups/ui/group-image";
import { groupsCopy } from "@/features/groups/ui/copy";
import { useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { parseDukjilAttendanceList, streakBandPage, type DukjilAttendanceList } from "../domain/dukjil-ui";
import type { AppLocale } from "@/i18n/locales";
import { CreatorAttendanceDialog } from "./creator-attendance-dialog";
import { guideText } from "@/features/dukjil-guide/ui/guide-copy";
import { dukjilText } from "./dukjil-copy";
import { DukjilProvider, useDukjil } from "./dukjil-provider";
import { EarnBadge } from "./earn-badge";
import { StreakBand } from "./streak-band";
import styles from "./dukjil.module.css";

const parseList = (value: unknown) => groupListSchema.parse(value);
type Creator = GroupPage & { slug: string };
/** A joined page without a passport: the entry review itself, not the page. */
const verifyHref = (page: Creator, locale: AppLocale) => `/c/${encodeURIComponent(page.slug)}/verify?locale=${locale}`;

function AttendanceRowsSkeleton({ label }: { label: string }) {
  return <div className={styles.todaySkeleton} role="status" aria-busy="true" aria-label={label}><div aria-hidden="true">{[0, 1].map(index => <div key={index}><i /><span><i /><i /></span></div>)}</div></div>;
}

/** Title row plus row placeholders: holds the section's height while the policy or the lists are still unknown. */
export function AttendanceSkeleton({ title, label }: { title: string; label: string }) {
  return <section className={styles.todaySection} aria-label={title}><div className={styles.todayHead}><FanHeading>{title}</FanHeading></div><AttendanceRowsSkeleton label={label} /></section>;
}

/** Section form on the 덕질 tab: heading row with an expand/collapse control, pending pages first, a fixed row limit, one-line states. */
export type AttendanceSection = {
  title: string; moreLabel: string; lessLabel: string; limit: number;
  emptyAction?: { label: string; href: string };
  /** The first check-in button is the screen's emphasised action (the exchange is not usable yet); every other row stays neutral. */
  emphasise?: boolean;
  onFailure?: (failed: boolean, retry: () => void) => void;
  /** The screen shows one combined alert instead of this section's own error line. */
  hideError?: boolean;
  /** Draw the 연속 일수 band above the rows (덕질 tab). */
  streakBand?: boolean;
};

/** Pages with a check-in button first, then pages that still need an entry review, then the finished ones; API order inside each group. */
const order = (item: DukjilAttendanceList["items"][number] | undefined) => item?.attendedToday ? 2 : item && !item.hasPassport ? 1 : 0;
const canCheckIn = (item: DukjilAttendanceList["items"][number] | undefined) => !item?.attendedToday && (!item || item.hasPassport);

/** Attendance status of every joined creator page (plan §13.5). The page list comes from the joined list; all states from one `GET /api/me/attendance?creators=`. Renders only under an active policy. */
export function MyAttendanceList({ locale, section }: { locale: AppLocale; section?: AttendanceSection }) {
  const auth = useGroupRequest();
  const list = useGroupResource(auth.authenticated ? "/api/groups?mine=joined&limit=50" : null, parseList);
  const [expanded, setExpanded] = useState(false);
  const [bandOpen, setBandOpen] = useState(false);
  const creators = (list.data?.items ?? []).filter((page): page is Creator => Boolean(page.celebrityId && page.slug)).slice(0, 50);
  const slugs = creators.map(page => encodeURIComponent(page.slug)).join(",");
  const status = useGroupResource(slugs ? `/api/me/attendance?creators=${slugs}` : null, parseDukjilAttendanceList);
  const c = walletCopy(locale);
  const loading = !auth.ready || list.loading || Boolean(slugs && status.loading);
  const failed = Boolean(list.error || !list.data || (slugs && (status.error || !status.data)));
  const retry = () => { list.retry(); status.retry(); };
  const retryRef = useRef(retry), callbacks = useRef(section);
  useEffect(() => { retryRef.current = retry; callbacks.current = section; });
  const byId = new Map(status.data?.items.map(item => [item.celebrityId, item]));
  const sorted = section ? [...creators].sort((a, b) => order(byId.get(a.celebrityId!)) - order(byId.get(b.celebrityId!))) : creators;
  const shown = section && !expanded ? sorted.slice(0, section.limit) : sorted;
  const actionPage = !loading && !failed ? shown.find(page => canCheckIn(byId.get(page.celebrityId!))) : undefined;
  useEffect(() => { if (!loading) callbacks.current?.onFailure?.(failed, () => retryRef.current()); }, [loading, failed]);
  if (section) {
    if (auth.ready && !auth.authenticated) return null;
    const toggle = !loading && !failed && sorted.length > section.limit;
    const bandPage = section.streakBand && !loading && !failed ? streakBandPage(creators, page => byId.get(page.celebrityId!)?.streak ?? 0) : undefined;
    const bandItem = bandPage ? byId.get(bandPage.celebrityId!) : undefined;
    return (
      <section className={styles.todaySection} aria-label={section.title}>
        <div className={styles.todayHead}>
          <FanHeading>{section.title}</FanHeading>
          {toggle && <FanAction variant="text" trailingIcon={expanded ? <ChevronUp /> : <ArrowRight />} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? section.lessLabel : section.moreLabel}</FanAction>}
        </div>
        {bandPage && bandItem && <StreakBand locale={locale} href={groupHref(bandPage, locale)} name={bandPage.name} imageUrl={bandPage.imageUrl} streak={bandItem.streak} attendedToday={bandItem.attendedToday} nextBonusIn={bandItem.nextBonusIn} onOpen={() => setBandOpen(true)} />}
        {bandOpen && bandPage && <DukjilProvider slug={bandPage.slug} locale={locale} hasPassport={bandItem?.hasPassport}><CreatorAttendanceDialog open pageName={bandPage.name} reviewHref={verifyHref(bandPage, locale)} onClose={() => { setBandOpen(false); status.retry(); }} /></DukjilProvider>}
        {loading ? <AttendanceRowsSkeleton label={c.loading} />
          : failed ? (section.hideError ? null : <FanState inline compact kind="error" title={dukjilText(locale, "dukjilLoadError")} actions={<FanAction variant="text" onClick={retry}>{c.retry}</FanAction>} />)
          : creators.length === 0 ? <FanState inline compact kind="empty" title={dukjilText(locale, "dukjilListEmpty")} actions={section.emptyAction ? <FanAction variant="text" trailingIcon={<ArrowRight />} href={section.emptyAction.href}>{section.emptyAction.label}</FanAction> : undefined} />
          : <ul className={`${styles.rows} ${styles.todayRows}`}>{shown.map(page => <li key={page.id} className={styles.row}><Row page={page} locale={locale} item={byId.get(page.celebrityId!)} primary={Boolean(section.emphasise) && page === actionPage} onChanged={() => status.retry()} /></li>)}</ul>}
      </section>
    );
  }
  if (loading) return <FanSkeletonRows rows={3} variant="entity" ariaLabel={c.loading} />;
  if (!auth.authenticated) return <FanAction variant="primary" href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/my/wallet?view=attendance&locale=${locale}`)}`}>{c.login}</FanAction>;
  if (failed) return <div className={styles.state} role="alert"><span>{dukjilText(locale, "dukjilLoadError")}</span><FanAction onClick={retry}>{c.retry}</FanAction></div>;
  if (creators.length === 0) return <p className={styles.state}>{dukjilText(locale, "dukjilListEmpty")}</p>;
  return (
    <section aria-label={dukjilText(locale, "dukjilListTitle")}>
      <ul className={styles.rows}>{creators.map(page => <li key={page.id} className={styles.row}><Row page={page} locale={locale} item={byId.get(page.celebrityId!)} onChanged={() => status.retry()} /></li>)}</ul>
    </section>
  );
}

function Row({ page, locale, item, primary = false, onChanged }: { page: Creator; locale: AppLocale; item: DukjilAttendanceList["items"][number] | undefined; primary?: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {page.imageUrl ? <GroupImage locale={locale} src={page.imageUrl} alt="" width={44} height={44} className={styles.rowImage} /> : <span className={styles.rowImage} aria-hidden="true" />}
      <span className={styles.rowText}>
        <strong>{page.name}</strong>
        {item && item.streak > 0 && <small>{dukjilText(locale, "dukjilStreak", [item.streak])}</small>}
      </span>
      {item?.attendedToday ? <EarnBadge variant="done" locale={locale} /> : item && !item.hasPassport
        ? <FanAction className={styles.rowAction} href={verifyHref(page, locale)}>{dukjilText(locale, "dukjilReview")}</FanAction>
        : <FanAction className={styles.rowAction} variant={primary ? "primary" : "neutral"} onClick={() => setOpen(true)}>{dukjilText(locale, "dukjilCheckInShort")}</FanAction>}
      {open && <DukjilProvider slug={page.slug} locale={locale} hasPassport={item?.hasPassport}><CreatorAttendanceDialog open pageName={page.name} reviewHref={verifyHref(page, locale)} onClose={() => { setOpen(false); onChanged(); }} /></DukjilProvider>}
    </>
  );
}

const GUEST_TILES = 4;
const POLICY_ACTIONS = [["checkin", "dukjilTileAttendance"], ["post", "dukjilTilePost"], ["comment", "dukjilTileComment"], ["share", "dukjilTileShare"]] as const;

/** Guest form of the 덕질 tab section: the same outline with the spotlight fan pages (public list) and a check-in button that opens the login. Only public values: the page list and the policy points. */
export function GuestAttendanceList({ locale, title, loginHref, guideHref, emptyAction, onFailure }: {
  locale: AppLocale; title: string; loginHref: string; guideHref: string;
  emptyAction: { label: string; href: string };
  onFailure?: (failed: boolean, retry: () => void) => void;
}) {
  const list = useGroupResource(groupApiQuery({ type: "fan", sort: "today", limit: String(GUEST_TILES) }), parseList);
  const catalog = useDukjil()?.catalog;
  const c = walletCopy(locale);
  const failed = Boolean(list.error);
  const retryRef = useRef(list.retry), callbacks = useRef(onFailure);
  useEffect(() => { retryRef.current = list.retry; callbacks.current = onFailure; });
  useEffect(() => { if (!list.loading) callbacks.current?.(failed, () => retryRef.current()); }, [list.loading, failed]);
  if (list.loading && !list.data) return <AttendanceSkeleton title={title} label={c.loading} />;
  const pages = (list.data?.items ?? []).slice(0, GUEST_TILES);
  const policy = POLICY_ACTIONS.flatMap(([action, label]) => {
    const points = (catalog?.rules[action] as { points?: unknown } | undefined)?.points;
    return typeof points === "number" ? [`${dukjilText(locale, label)} ${points.toLocaleString(locale)}P`] : [];
  });
  return (
    <section className={styles.todaySection} aria-label={title}>
      <div className={styles.todayHead}><FanHeading>{title}</FanHeading></div>
      {failed ? <FanState inline compact kind="error" title={dukjilText(locale, "dukjilLoadError")} actions={<FanAction variant="text" onClick={list.retry}>{c.retry}</FanAction>} />
        : pages.length === 0 ? <div className={styles.todayEmpty}><FanAction variant="neutral" href={emptyAction.href}>{emptyAction.label}</FanAction></div>
        : <ul className={`${styles.rows} ${styles.todayRows}`}>{pages.map(page => (
          <li key={page.id} className={styles.row}>
            {page.imageUrl ? <GroupImage locale={locale} src={page.imageUrl} alt="" width={44} height={44} className={styles.rowImage} /> : <span className={styles.rowImage} aria-hidden="true" />}
            <span className={styles.rowText}>
              <strong>{page.name}</strong>
              <small>{groupsCopy(locale).members} {page.memberCount.toLocaleString(locale)}</small>
            </span>
            <FanAction className={styles.rowAction} variant="neutral" href={loginHref}>{c.attendance}</FanAction>
          </li>
        ))}</ul>}
      {!failed && policy.length > 0 && (
        <div className={styles.todayPolicy}>
          <p>{policy.join(" · ")}</p>
          <FanAction variant="text" trailingIcon={<ArrowRight />} href={guideHref}>{guideText(locale, "dkgLinkDukjil")}</FanAction>
        </div>
      )}
    </section>
  );
}
