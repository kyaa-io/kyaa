"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowUpRight, Check, Lightbulb, MessageCircle, Users } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { notifyFanActivityUpdated, subscribeFanActivityUpdates } from "@/components/fan-ui/fan-activity-updates";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { NoticeBody } from "@/components/notice/notice-body";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { noticeSchema } from "@/features/fan-posts/domain/content";
import { parseNoticeDocument } from "@/server/notice/notice-domain";
import { FanPostFeed } from "@/features/fan-posts/ui/fan-post-feed";
import type { AppLocale } from "@/i18n/locales";
import { waveEngagementCopy } from "@/i18n/catalogs/features__fanpage__wave-engagement";
import { waveProgramsCopy } from "@/i18n/catalogs/features__fanpage__wave-programs";
import { waveHomeCheerCopy } from "@/i18n/catalogs/features__fanpage__wave-home-cheer";
import { waveMissionsCopy } from "@/i18n/catalogs/features__fanpage__wave-missions";
import { WAVE_FANPAGE_SLUG, WAVE_PROGRAMS, waveProgramHref, waveProgramStampsSchema, type WaveProgramKey } from "../domain/wave-programs";
import { waveMissionProgressSchema } from "../domain/wave-missions";
import { useFanpageResource } from "./use-fanpage-resource";
import { useCommunityResource } from "./use-community-resource";
import { NoticeComments } from "./notice-comments";
import { WaveNavigation } from "./wave-navigation";
import { WaveMissionsHome } from "./wave-missions";
import styles from "./wave-programs.module.css";

const icons = [MessageCircle, Lightbulb, Users];
const parseStamps = (value: unknown) => waveProgramStampsSchema.parse(value);
const parseMissions = (value: unknown) => waveMissionProgressSchema.parse(value);
const parseNotice = (value: unknown) => { const notice = noticeSchema.parse(value); return { ...notice, body: parseNoticeDocument(notice.body) }; };
export function WaveProgramStamps({ locale, program, revision = 0 }: { locale: AppLocale; program?: WaveProgramKey; revision?: number }) {
  const auth = usePrivy(), session = useByUsSession(), copy = waveProgramsCopy(locale);
  const resource = useFanpageResource(auth.ready && auth.authenticated ? `/api/celebrities/${WAVE_FANPAGE_SLUG}/programs/stamps?revision=${revision}` : null, parseStamps);
  const ready = auth.ready && (!auth.authenticated || session.ready || Boolean(session.error));
  const returnTo = program ? waveProgramHref(program, locale) : `/${WAVE_FANPAGE_SLUG}?locale=${locale}`;
  const entries = program ? WAVE_PROGRAMS.filter(item => item.key === program) : WAVE_PROGRAMS;
  return <aside className={styles.panel} aria-label={copy.stamps}>
    <h2 className={styles.heading}>{copy.stamps}</h2>
    <p className={styles.intro}>{copy.stampHelp}</p>
    {!ready || auth.authenticated && resource.state.status === "loading" ? <p role="status">{copy.loading}</p> : !auth.authenticated ? <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{copy.login}</FanAction> : resource.state.status === "error" ? <p role="alert">{copy.error} <FanAction variant="text" onClick={resource.retry}>{copy.retry}</FanAction></p> : null}
    <ul className={styles.stamps}>{entries.map(item => {
      const index = WAVE_PROGRAMS.findIndex(value => value.key === item.key), Icon = icons[index];
      const earned = ready && auth.authenticated && resource.state.status === "ready" && resource.state.data.stamps.some(stamp => stamp.program === item.key);
      const label = !ready || auth.authenticated && resource.state.status === "loading" ? copy.loading : !auth.authenticated ? copy.loginHint : resource.state.status === "error" ? copy.error : earned ? copy.earned : copy.locked;
      return <li className={styles.stamp} key={item.key}><span className={styles.seal} data-earned={earned}><Icon aria-hidden="true" size={28} /></span><div><strong>{item.name}</strong><small>{earned && <Check aria-hidden="true" size={14} />} {label}</small></div></li>;
    })}</ul>
    <div className={styles.event}><h3>{copy.event}</h3><p><time dateTime="2026-10-22">2026. 10. 22.</time><br />Dragon Hill Lodge</p></div>
  </aside>;
}
export function WaveMissionProgress({ locale }: { locale: AppLocale }) {
  const auth = usePrivy(), session = useByUsSession(), copy = waveMissionsCopy(locale), programCopy = waveProgramsCopy(locale);
  const resource = useFanpageResource(auth.ready && auth.authenticated ? `/api/celebrities/${WAVE_FANPAGE_SLUG}/missions` : null, parseMissions);
  useEffect(() => auth.ready && auth.authenticated ? subscribeFanActivityUpdates(session.ownerId ?? auth.user?.id, resource.retry) : undefined, [auth.ready, auth.authenticated, auth.user?.id, session.ownerId, resource.retry]);
  if (auth.ready && auth.authenticated && resource.state.status === "ready") {
    return <WaveMissionsHome locale={locale} progress={resource.state.data.progress} />;
  }
  return <section className={styles.missionState} aria-label={copy.title}>
    <FanSectionHeader title={copy.title} description={copy.description} />
    {!auth.ready || auth.authenticated && resource.state.status === "loading" ? <p role="status">{programCopy.loading}</p>
      : !auth.authenticated ? <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/${WAVE_FANPAGE_SLUG}?locale=${locale}`)}`}>{programCopy.login}</FanAction>
      : resource.state.status === "error" ? <p role="alert">{["FAN_WEB_FORBIDDEN", "WAVE_CHECKIN_REQUIRED"].includes(resource.state.code) ? copy.participationRequired : copy.error} <FanAction variant="text" onClick={resource.retry}>{programCopy.retry}</FanAction></p> : null}
  </section>;
}
export function WaveProgramsHome({ locale }: { locale: AppLocale }) {
  const copy = waveProgramsCopy(locale);
  return <section aria-label={copy.programs}><WaveMissionProgress locale={locale} /><div className={styles.main}>
    <FanSectionHeader title={copy.programs} description={copy.intro} />
    <ol className={styles.list}>{WAVE_PROGRAMS.map((program, index) => <li key={program.key}><Link className={styles.program} href={waveProgramHref(program.key, locale) as Route}><span aria-hidden="true">0{index + 1}</span><strong>{program.name}</strong><ArrowUpRight aria-hidden="true" size={20} /></Link></li>)}</ol>
  </div><WaveHomeCheer locale={locale} /></section>;
}
function WaveHomeCheer({ locale }: { locale: AppLocale }) {
  const auth = usePrivy(), session = useByUsSession(), copy = waveHomeCheerCopy(locale);
  const returnTo = `/${WAVE_FANPAGE_SLUG}?locale=${locale}#wave-home-cheer`;
  return <section id="wave-home-cheer" className={styles.cheer} aria-label={copy.title}>
    <FanSectionHeader title={copy.title} description={copy.description} />
    <NoticeComments slug={WAVE_FANPAGE_SLUG} noticeSlug="wave-home-cheer" locale={locale} returnTo={returnTo} onChanged={() => notifyFanActivityUpdated(session.ownerId ?? auth.user?.id)} />
  </section>;
}
export function WaveProgramPage({ locale, program }: { locale: AppLocale; program: WaveProgramKey }) {
  const copy = waveProgramsCopy(locale), selected = WAVE_PROGRAMS.find(item => item.key === program)!;
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);
  const returnTo = waveProgramHref(program, locale);
  // External program copy stays in its original language across locales.
  const notice = useCommunityResource(`/api/celebrities/${WAVE_FANPAGE_SLUG}/notices/${program}?locale=ko`, parseNotice);
  return <FanAppFrame locale={locale} mainId="wave-program-main"><FanContentContainer as="main" id="wave-program-main" className={styles.detail} tabIndex={-1}>
    <Link className={styles.back} href={`/${WAVE_FANPAGE_SLUG}?locale=${locale}`}><ArrowLeft size={18} aria-hidden="true" />{copy.back}</Link>
    <WaveNavigation locale={locale} active={program === "live-insight" ? "insight" : undefined} />
    <h1 className={styles.title}>{selected.name}</h1><p className={styles.intro}><time dateTime="2026-10-22">2026. 10. 22.</time> · Dragon Hill Lodge</p>
    <div className={styles.home}><div className={styles.main}>
      {notice.state.status === "ready" ? <div className={program === "live-insight" ? styles.programIntro : undefined}><NoticeBody document={notice.state.data.body} locale={locale} /></div> : notice.state.status === "error" ? <p role="alert">{contentCopy(locale).failed} <FanAction variant="text" onClick={notice.retry}>{copy.retry}</FanAction></p> : <p role="status">{copy.loading}</p>}
      <FanPostFeed slug={WAVE_FANPAGE_SLUG} creatorName="Kyaa Wave" locale={locale} program={program} returnTo={returnTo} allowMembers={false} hideHeading intro={program === "live-insight" ? waveEngagementCopy(locale).insightIntro : copy.intro} onPosted={refresh} />
      <NoticeComments slug={WAVE_FANPAGE_SLUG} noticeSlug={program} locale={locale} returnTo={returnTo} onPosted={refresh} />
    </div><WaveProgramStamps locale={locale} program={program} revision={revision} /></div>
  </FanContentContainer></FanAppFrame>;
}
