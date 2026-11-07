"use client";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanPageHeader, FanPageHeaderSkeleton } from "@/components/fan-ui/fan-page-header";
import { FanTabs, type FanTabItem } from "@/components/fan-ui/fan-tabs";
import { FanAppFrame, FanContentContainer } from "@/components/fan-shell/fan-app-shell";
import { TranslationControl, useAutomaticTranslation } from "@/features/content-safety/ui/use-automatic-translation";
import fanpageStyles from "@/features/fanpage/ui/fanpage.module.css";
import type { AppLocale } from "@/i18n/locales";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import type { GroupDetail } from "../domain/contracts";
import { groupsCopy, pageUnavailable } from "./copy";
import { CreatorFanGrade } from "./creator-fan-grade";
import { GroupArtistBadge } from "./group-artist-badge";
import { GroupPageMenu } from "./group-page-menu";
import { GroupPageProvider, useGroupPage } from "./group-page-context";
import { GroupPresence } from "./group-presence";
import { pageHeadCopy } from "./page-head-copy";
import { GroupShell } from "./group-shell";
import { groupTabItems } from "./group-tab-links";
import { SourceStatePanel } from "./source-state-panel";
import styles from "./groups.module.css";

function useTabs(): FanTabItem[] {
  const g = useGroupPage();
  const hideMembers = g.routeSlug !== null && g.error;
  return groupTabItems(g.locale, !hideMembers).map((item) => ({ ...item, href: g.hrefFor(item.key), onSelect: () => g.selectTab(item.key), onPreload: () => g.preloadTab(item.key) }));
}

/** 머리·접속 띠·탭. 레이아웃 안에서 한 번만 마운트되어 탭을 바꿔도 같은 노드로 남는다. */
export function GroupPageHead() {
  const g = useGroupPage();
  const t = groupsCopy(g.locale);
  const items = useTabs();
  const name = g.celebrity?.name ?? g.page?.name;
  // 소개 번역은 원문과 따로 보이고 원문 보기가 있다(F11). 훅은 머리 골격으로 일찍 돌아가기 전에 부른다.
  const summaryText = g.celebrity?.summary ?? "";
  const summaryTexts = useMemo(() => [summaryText], [summaryText]);
  const { observeElement, ...summaryTranslation } = useAutomaticTranslation({ texts: summaryTexts, locale: g.locale, enabled: Boolean(g.celebrity) });
  const tabs = name ? <FanTabs id={g.celebrity ? "celebrity-content" : undefined} label={name} current={g.activeTab} items={items} /> : <FanTabs label={t.groups} current={g.activeTab} items={items} />;
  const memberCount = g.page?.memberCount;
  const stats = <GroupPresence pageId={g.loading ? null : g.page?.id ?? null} locale={g.locale} member={Boolean(g.membership)} memberCount={memberCount} />;
  const waitingForCreator = g.page?.kind === "fan" && !g.celebrity;
  if (!name || !g.kind || waitingForCreator) return <FanPageHeaderSkeleton stats={stats} tabs={tabs} />;
  const summary = g.celebrity ? <span ref={observeElement} lang={summaryTranslation.showing ? g.locale : undefined}>{summaryTranslation.texts[0]}</span> : g.page?.description;
  return <FanPageHeader
    frameId={g.routePageId ?? g.routeSlug ?? g.page?.id}
    image={g.celebrity ? { src: g.celebrity.image.url, slug: g.kind === "fan" ? g.celebrity.slug : undefined, alt: "" } : { src: g.page?.imageUrl, alt: "" }}
    name={name}
    kind={g.kind}
    locale={g.locale}
    description={summary}
    descriptionLabels={pageHeadCopy(g.locale)}
    descriptionAction={g.celebrity ? <TranslationControl locale={g.locale} translation={summaryTranslation} /> : undefined}
    star={g.star}
    badge={<GroupArtistBadge locale={g.locale} />}
    links={g.celebrity?.socialLinks.map((social) => ({ kind: social.platform, href: social.url }))}
    utility={g.kind === "fan" && g.celebrity && g.authenticated ? <CreatorFanGrade slug={g.celebrity.slug} locale={g.locale} resource={g.summary} /> : undefined}
    menu={g.detail?.membership ? <GroupPageMenu key={g.ownerKey} detail={g.detail} locale={g.locale} refresh={g.refresh} /> : g.reserveMenu ? <span aria-hidden="true" /> : undefined}
    stats={stats}
    tabs={tabs}
  />;
}

/** 가입 질문 폼과 가입 실패. 누른 결과로 열릴 때만 그 자리로 스크롤한다(S7). */
export function GroupPageJoin() {
  const g = useGroupPage();
  const t = groupsCopy(g.locale);
  const form = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!g.joinFormOpen) return;
    form.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    form.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
  }, [g.joinFormOpen]);
  return <>
    {g.actionFailed && <SourceStatePanel sourceId={g.joinFailed ? "LAbTd" : undefined} title={g.locale === "ko" && g.joinFailed ? "가입하지 못했어요" : t.error} description={t.error} role="alert" actions={g.joinFailed ? [{ label: t.retry, onClick: g.submitJoin, disabled: g.joinPending, variant: "primary" }] : []} />}
    {g.joinFormOpen && <section ref={form} className={styles.panel}><h2>{t.join}</h2><form className={styles.form} onSubmit={(event) => { event.preventDefault(); g.submitJoin(); }}><label className={styles.field}>{g.page?.question}<textarea className={`${styles.textarea} ${styles.joinAnswer}`} value={g.joinAnswer} onChange={(event) => g.setJoinAnswer(event.target.value)} maxLength={2000} required disabled={g.joinPending} /></label><div className={styles.actions}><FanAction onClick={g.closeJoinForm}>{t.cancel}</FanAction><FanAction type="submit" disabled={g.joinPending}>{t.join}</FanAction></div></form></section>}
  </>;
}

function GroupPageBody({ children }: { children: ReactNode }) {
  const g = useGroupPage();
  const t = groupsCopy(g.locale);
  // 주소 `/pages/groups/{id}`의 페이지가 없거나 볼 수 없으면 머리와 본문을 그리지 않는다.
  if (g.routePageId && g.error) return <div className={styles.status} role="alert">{g.failure && [403, 404].includes(g.failure.status) ? <><LockKeyhole size={32} aria-hidden="true" /><h1>{pageUnavailable[g.locale]}</h1><FanAction href={`/pages/groups?locale=${g.locale}`}>{t.explore}</FanAction></> : <><p>{t.error}</p><FanAction onClick={g.refresh}>{t.retry}</FanAction></>}</div>;
  if (g.routePageId && g.page?.kind === "fan" && g.celebrityFailed) return <div className={styles.status} role="alert"><p>{t.error}</p><FanAction onClick={g.retryCelebrity}>{t.retry}</FanAction></div>;
  return <><GroupPageHead /><GroupPageJoin />{children}</>;
}

/** `/pages/groups/{id}`의 레이아웃. 라우트 그룹 안이라 쿼리가 바뀌어도 다시 그려지지 않는다. */
export function GroupPageFrame({ pageId, locale, initialTab, initialDetail, reserveMenu, celebrity, celebrityLocale, children }: { pageId: string; locale?: AppLocale; initialTab?: string; initialDetail?: GroupDetail; reserveMenu?: boolean; celebrity?: PublishedCelebrity; celebrityLocale?: string; children: ReactNode }) {
  return <GroupPageProvider pageId={pageId} locale={locale} initialTab={initialTab} initialDetail={initialDetail} reserveMenu={reserveMenu} celebrity={celebrity} celebrityLocale={celebrityLocale}><GroupFrameShell locale={locale}>{children}</GroupFrameShell></GroupPageProvider>;
}
function GroupFrameShell({ locale, children }: { locale?: AppLocale; children: ReactNode }) {
  const g = useGroupPage();
  return <GroupShell locale={locale ?? g.locale} fanpage={Boolean(g.celebrity)}><GroupPageBody>{children}</GroupPageBody></GroupShell>;
}

/** `/{slug}`의 레이아웃. 서버가 읽은 크리에이터로 머리를 바로 그린다. */
export function CreatorPageFrame({ slug, celebrity, celebrityLocale, locale, initialTab, children }: { slug: string; celebrity: PublishedCelebrity; celebrityLocale?: string; locale?: AppLocale; initialTab?: string; children: ReactNode }) {
  return <GroupPageProvider slug={slug} celebrity={celebrity} celebrityLocale={celebrityLocale} locale={locale} initialTab={initialTab}><CreatorFrameShell>{children}</CreatorFrameShell></GroupPageProvider>;
}
function CreatorFrameShell({ children }: { children: ReactNode }) {
  const g = useGroupPage();
  const brand = g.celebrity?.roles.includes("brand");
  return <FanAppFrame locale={g.locale} groupsEnabled currentPath="/pages/groups" mainId="celebrity-detail-main">
    <FanContentContainer as="main" id="celebrity-detail-main" className={`${fanpageStyles.page} ${brand ? styles.page : styles.creatorPage}`} tabIndex={-1}><GroupPageBody>{children}</GroupPageBody></FanContentContainer>
  </FanAppFrame>;
}
