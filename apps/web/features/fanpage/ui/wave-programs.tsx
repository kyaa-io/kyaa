"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowUpRight, Check, Lightbulb, MessageCircle, Users } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { NoticeBody } from "@/components/notice/notice-body";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { noticeSchema } from "@/features/fan-posts/domain/content";
import { parseNoticeDocument } from "@/server/notice/notice-domain";
import { FanPostFeed } from "@/features/fan-posts/ui/fan-post-feed";
import type { AppLocale } from "@/i18n/locales";
import { waveProgramsCopy } from "@/i18n/catalogs/features__fanpage__wave-programs";
import { WAVE_FANPAGE_SLUG, WAVE_PROGRAMS, waveProgramHref, waveProgramStampsSchema, type WaveProgramKey } from "../domain/wave-programs";
import { useFanpageResource } from "./use-fanpage-resource";
import { useCommunityResource } from "./use-community-resource";
import { NoticeComments } from "./notice-comments";
import styles from "./wave-programs.module.css";

const icons = [MessageCircle, Lightbulb, Users];
const parseStamps = (value: unknown) => waveProgramStampsSchema.parse(value);
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
export function WaveProgramsHome({ locale }: { locale: AppLocale }) {
  const copy = waveProgramsCopy(locale);
  return <section className={styles.home} aria-label={copy.programs}><div className={styles.main}>
    <FanSectionHeader title={copy.programs} description={copy.intro} />
    <ol className={styles.list}>{WAVE_PROGRAMS.map((program, index) => <li key={program.key}><Link className={styles.program} href={waveProgramHref(program.key, locale) as Route}><span aria-hidden="true">0{index + 1}</span><strong>{program.name}</strong><ArrowUpRight aria-hidden="true" size={20} /></Link></li>)}</ol>
  </div><WaveProgramStamps locale={locale} /></section>;
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
    <h1 className={styles.title}>{selected.name}</h1><p className={styles.intro}><time dateTime="2026-10-22">2026. 10. 22.</time> · Dragon Hill Lodge</p>
    <nav className={styles.navigation} aria-label={copy.programs}>{WAVE_PROGRAMS.map((item, index) => <Link key={item.key} href={waveProgramHref(item.key, locale) as Route} aria-current={item.key === program ? "page" : undefined}><span aria-hidden="true">0{index + 1}</span>{item.name}</Link>)}</nav>
    <div className={styles.home}><div className={styles.main}>
      {notice.state.status === "ready" ? <NoticeBody document={notice.state.data.body} locale={locale} /> : notice.state.status === "error" ? <p role="alert">{contentCopy(locale).failed} <FanAction variant="text" onClick={notice.retry}>{copy.retry}</FanAction></p> : <p role="status">{copy.loading}</p>}
      <FanSectionHeader title={copy.photos} />
      <FanPostFeed slug={WAVE_FANPAGE_SLUG} creatorName="Kyaa Wave" locale={locale} program={program} returnTo={returnTo} allowMembers={false} hideHeading intro={copy.intro} onPosted={refresh} />
      <NoticeComments slug={WAVE_FANPAGE_SLUG} noticeSlug={program} locale={locale} returnTo={returnTo} onPosted={refresh} />
    </div><WaveProgramStamps locale={locale} program={program} revision={revision} /></div>
  </FanContentContainer></FanAppFrame>;
}
