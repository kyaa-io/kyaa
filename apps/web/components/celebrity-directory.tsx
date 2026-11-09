"use client";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";

import { toContentLocale } from "@/i18n/locales";
import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__celebrity-directory";
import { messages as roleMessages } from "@/i18n/catalogs/components__fan-ui__creator-roles";
import { additionalLocales, translate } from "@/i18n/messages";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";

import Image from "next/image";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { LiveStatusIndicator } from "./live-status-indicator";
import { useOwnedFanResource } from "./fan-ui/use-owned-fan-resource";
import { CreatorRoleFilterControl, CreatorRolesText } from "./fan-ui/creator-roles";
import { CreatorAvatar } from "./fan-ui/creator-avatar";
import { availableCreatorRoles, creatorRoleFilterLabel, matchesCreatorRole, type CreatorRoleFilter } from "@/features/creator/domain/creator-role";
import { orderCreatorsForDiscovery } from "../server/content/creator-discovery";
import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { FanAppFrame, FanContentContainer } from "./fan-shell/fan-app-shell";
import type { ContentLocale, PublishedCelebrity, PublishedCelebrityLive } from "../server/content/content-domain";
import { FanStageTooltip } from "../features/rewards/ui/fan-stage-tooltip";
import { passportDirectoryResponseSchema, type PassportDirectory } from "../features/passport/domain/passport-collection";
import { fanUtilityCanvasClassName } from "./fan-ui/fan-surface";
import { discoveryCopy } from "@/i18n/catalogs/features__fan_posts__discovery";
import { FanAction } from "./fan-ui/fan-action";
import { Plus } from "lucide-react";
import { FanHeading } from "./fan-ui/fan-heading";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { WavePrivateBadge } from "@/features/fanpage/ui/wave-privacy";
import { wavePrivacyCopy } from "@/i18n/catalogs/features__fanpage__wave-privacy";
import styles from "./celebrity-directory.module.css";

type PassportState =
  | Readonly<{ status: "guest" | "loading" }>
  | Readonly<{ status: "ready"; passports: ReadonlyMap<string, PassportDirectory[number]> }>
  | Readonly<{ status: "error" }>;
type SortOrder = "published" | "name-asc" | "live-first";
type DirectoryCelebrity = PublishedCelebrity & Readonly<{ upcomingLive: PublishedCelebrityLive | null }>;

function formatLiveDate(value: string, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, { calendar: "gregory",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: locale === "ko" ? false : locale === "en" ? true : undefined,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

const copy = {
  ko: { home: "홈으로", heading: "최애 찾기", search: "이름으로 찾기", searchPlaceholder: "이름으로 검색", sort: "정렬", defaultSort: "기본순", nameSort: "이름순", liveSort: "LIVE 우선", loadingPassport: "보유한 팬 패스포트를 확인하고 있어요.", noPublished: "지금 공개된 셀럽이 없어요.", back: "LIVE 둘러보기", searchEmpty: "검색 결과가 없어요.", reset: "필터 초기화", list: "최애 목록", fanPage: "만나보기", fanPageMove: "팬페이지로 이동", liveSoon: "LIVE 예정", livePreparing: "예정된 LIVE가 없어요." },
  en: { home: "Home", heading: "Find your favorite", search: "Search celebrities", searchPlaceholder: "Search by name", sort: "Sort", defaultSort: "Default", nameSort: "Name", liveSort: "LIVE first", loadingPassport: "Loading your Fan Passports.", noPublished: "No profiles are available yet.", back: "Explore LIVE events", searchEmpty: "No search results.", reset: "Clear filters", list: "Celebrities and creators", fanPage: "View fan page", fanPageMove: "open fan page", liveSoon: "Upcoming LIVE", livePreparing: "No upcoming LIVE events." },

  ...additionalLocales((translationLocale) => ({ home: localizedMessages.mda6909bdf841[translationLocale], heading: localizedMessages.mab373172560f[translationLocale], search: localizedMessages.m9e8df343175e[translationLocale], searchPlaceholder: localizedMessages.mc64d8e801119[translationLocale], sort: localizedMessages.m025626c0e4cd[translationLocale], defaultSort: localizedMessages.m2c77fa082979[translationLocale], nameSort: localizedMessages.m3a9719ad7ac1[translationLocale], liveSort: localizedMessages.m54b70197c3c1[translationLocale], loadingPassport: localizedMessages.mbed47a1091b0[translationLocale], noPublished: localizedMessages.m7a9a0aa09f21[translationLocale], back: localizedMessages.m6583b95908cf[translationLocale], searchEmpty: localizedMessages.m17edf81f334e[translationLocale], reset: localizedMessages.m90e01a3bc89a[translationLocale], list: localizedMessages.m0a48aa274797[translationLocale], fanPage: localizedMessages.m1e780ecb9a9b[translationLocale], fanPageMove: localizedMessages.m467b7a8a93a1[translationLocale], liveSoon: localizedMessages.md17036c0cfa4[translationLocale], livePreparing: localizedMessages.m85d27e25d314[translationLocale] }))
} as const;

function passportsBySlug(value: unknown) {
  return new Map(passportDirectoryResponseSchema.parse(value).passports.map((passport) => [passport.celebrity.slug, passport]));
}

/** Directory copy ends at a complete published sentence, never a visual ellipsis. */
export function directoryIntroduction(summary: string, locale: AppLocale) {
  const sentences = new Intl.Segmenter(locale, { granularity: "sentence" }).segment(summary.trim());
  return Array.from(sentences)[0]?.segment.trim() ?? "";
}

export function CelebrityDirectory({ celebrities, locale, initialQuery = "", initialSort = "published", initialRole = "all" }: { celebrities: readonly DirectoryCelebrity[]; locale: AppLocale; initialQuery?: string; initialSort?: SortOrder; initialRole?: CreatorRoleFilter }) {
  const t = copy[locale], discovery = discoveryCopy(locale);
  const localeQuery = `?locale=${locale}`;
  const auth = usePrivy();
  const { ready, authenticated } = auth;
  const [query, setQuery] = useState(initialQuery);
  const requestHref = `/pages/groups/apply?kind=fan&locale=${locale}${query.trim() ? `&name=${encodeURIComponent(query.trim().slice(0, 120))}` : ""}`;
  const [role, setRole] = useState<CreatorRoleFilter>(initialRole);
  const [sort, setSort] = useState<SortOrder>(initialSort);
  const { state } = useOwnedFanResource(`/api/passports?locale=${toContentLocale(locale)}&tierStages=1&view=directory`, passportsBySlug, auth);
  const passportState = useMemo<PassportState>(() => ready && !authenticated ? { status: "guest" }
    : state.status === "ready" ? { status: "ready", passports: state.data }
    : { status: state.status }, [ready, authenticated, state]);
  // Resolve auth, ownership and ordering before revealing rows so the owned rows never jump after paint.
  const isDirectoryLoading = passportState.status === "loading";
  const filtersActive = query.trim().length > 0 || role !== "all";

  const visibleCelebrities = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    const ownedSlugs = passportState.status === "ready" ? passportState.passports : new Set<string>();
    const filtered = celebrities.filter((celebrity) => {
      const matchesQuery = !normalized || celebrity.name.toLocaleLowerCase("ko-KR").includes(normalized);
      return matchesQuery && matchesCreatorRole(celebrity.roles, role);
    });
    if (sort === "name-asc") {
      return filtered.toSorted((left, right) => left.name.localeCompare(right.name, locale));
    }
    if (sort === "live-first") {
      return filtered.toSorted((left, right) => Number(Boolean(right.upcomingLive)) - Number(Boolean(left.upcomingLive)));
    }
    return orderCreatorsForDiscovery(filtered).toSorted((left, right) =>
      Number(ownedSlugs.has(right.slug)) - Number(ownedSlugs.has(left.slug)),
    );
  }, [celebrities, locale, passportState, query, sort, role]);

  // "My favorites" is its own block above the list, only for a signed-in owner and only in the unfiltered view.
  const ownedRows = !filtersActive && passportState.status === "ready"
    ? visibleCelebrities.filter((celebrity) => passportState.passports.has(celebrity.slug)) : [];
  const listRows = ownedRows.length > 0 ? visibleCelebrities.filter((celebrity) => !ownedRows.includes(celebrity)) : visibleCelebrities;

  const replaceFilterUrl = (next: { role: CreatorRoleFilter; query: string; sort: SortOrder }) => {
    const url = new URL(window.location.href);
    url.searchParams.set("role", next.role);
    url.searchParams.delete("owned");
    if (next.query.trim()) url.searchParams.set("q", next.query);
    else url.searchParams.delete("q");
    if (next.sort !== "published") url.searchParams.set("sort", next.sort);
    else url.searchParams.delete("sort");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const changeRole = (nextRole: CreatorRoleFilter, clearFilters = false) => {
    setRole(nextRole);
    if (clearFilters) {
      setQuery("");
    }
    replaceFilterUrl({ role: nextRole, query: clearFilters ? "" : query, sort });
  };

  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    replaceFilterUrl({ role, query: nextQuery, sort });
  };

  const changeSort = (nextSort: SortOrder) => {
    setSort(nextSort);
    replaceFilterUrl({ role, query, sort: nextSort });
  };

  const renderCreator = (celebrity: DirectoryCelebrity) => {
    const passport = passportState.status === "ready" ? passportState.passports.get(celebrity.slug) : undefined;
    const wave = celebrity.slug === WAVE_FANPAGE_SLUG;
    return (<article key={celebrity.slug} className={styles.row} data-wave={wave || undefined} data-passport-owned={passport ? "true" : undefined}>
      <Link className={styles.rowLink} href={`${creatorHomeHref(celebrity.slug)}${localeQuery}`} aria-label={locale === "ko" ? `${celebrity.name} ${t.fanPage}` : translate(locale, localizedMessages.m11a1d75c5b58, "View {0}’s fan page", [celebrity.name])}>
        <span className={styles.avatar}>
          {wave
            ? <Image className={styles.waveVenuePhoto} src="/images/kyaa-wave/dragon-hill-lodge-exterior.jpg" alt="Dragon Hill Lodge" width={96} height={96} sizes="48px" />
            : <CreatorAvatar slug={celebrity.slug} src={celebrity.image.url} photos={celebrity.image.photos} position={celebrity.image.position} size={48} />}
        </span>
        <div className={styles.rowText}>
          <strong className={styles.name}>{celebrity.name}</strong>
          <div className={styles.rowMeta}>
            <CreatorRolesText roles={celebrity.roles} locale={locale} />
            {wave ? <WavePrivateBadge locale={locale} /> : null}
            {wave ? <TranslatedText as="p" className={styles.audience} text={wavePrivacyCopy(locale).audience} locale={locale} controls={false} /> : null}
            {celebrity.upcomingLive ? <span className={styles.liveSchedule}>
              <LiveStatusIndicator status={celebrity.upcomingLive.effectiveStatus === "live" ? "live" : "scheduled"} locale={locale} density="compact" />
              <time dateTime={celebrity.upcomingLive.startsAt}>{formatLiveDate(celebrity.upcomingLive.startsAt, locale)}</time>
            </span> : null}
          </div>
        </div>
        <span className={styles.rowEnd} aria-hidden="true">{passport ? null : <ChevronRight size={16} />}</span>
      </Link>
      {passport ? <FanStageTooltip
        className={styles.passportStage}
        celebrityName={celebrity.name}
        tier={passport.score.level}
        points={passport.score.points}
        stageProgress={passport.score.stageProgress}
        locale={locale}
      /> : null}
    </article>);
  };

  const sectionHeader = (title: string, id: string, count?: number) => (
    <div className={styles.sectionHeader}>
      <FanHeading as="h2" id={id}>{title}</FanHeading>
      {count === undefined ? null : <p aria-live="polite">{locale === "ko" ? `총 ${count}개` : translate(locale, localizedMessages.m2755e20a87be, "{0} profiles", [count])}</p>}
    </div>
  );

  return (
    <FanAppFrame locale={locale} className={fanUtilityCanvasClassName} mainId="celebrity-directory-content">
    <FanContentContainer as="main" className={styles.page} id="celebrity-directory-content" tabIndex={-1}>
      <section className={styles.content} aria-labelledby="directory-heading">
        <div className={styles.introRow}><FanHeading as="h1" id="directory-heading" variant="personal-page">{t.heading}</FanHeading><FanAction href={requestHref} leadingIcon={<Plus />} variant="neutral">{discovery.requestFavorite}</FanAction></div>
        {celebrities.length === 0 ? (
          <div className={styles.empty} role="status"><p>{t.noPublished}</p><Link href={`/${localeQuery}`}>{t.back}</Link></div>
        ) : isDirectoryLoading ? (
          <div role="status" aria-label={t.loadingPassport} aria-busy="true">
            <span className={styles.srOnly}>{t.loadingPassport}</span>
            <div aria-hidden="true">
              <div className={`${styles.skeletonBlock} ${styles.skeletonSearch}`} />
              <div className={styles.skeletonFilters}>{Array.from({ length: 3 }, (_, index) => <span key={index} className={`${styles.skeletonBlock} ${styles.skeletonChip}`} />)}</div>
              <div className={styles.list}>{Array.from({ length: 6 }, (_, index) => (
                <div key={index} className={styles.row}>
                  <div className={styles.rowLink}>
                    <span className={`${styles.avatar} ${styles.skeletonBlock}`} />
                    <div className={styles.rowText}><span className={`${styles.skeletonBlock} ${styles.skeletonTitle}`} /><span className={`${styles.skeletonBlock} ${styles.skeletonLabel}`} /></div>
                    <span className={styles.rowEnd} />
                  </div>
                </div>
              ))}</div>
            </div>
          </div>
        ) : <>
          <form className={styles.controls} role="search" onSubmit={(event) => event.preventDefault()}>
            <label className={styles.searchField} htmlFor="celebrity-search"><span className={styles.srOnly}>{t.search}</span><span className={styles.inputControl}><input id="celebrity-search" type="search" value={query} onChange={(event) => changeQuery(event.target.value)} placeholder={t.searchPlaceholder} /></span></label>
            <label className={styles.sortField} htmlFor="celebrity-sort"><span className={styles.srOnly}>{t.sort}</span><span className={styles.selectControl}><select id="celebrity-sort" value={sort} onChange={(event) => changeSort(event.target.value as SortOrder)}><option value="published">{t.defaultSort}</option><option value="name-asc">{t.nameSort}</option><option value="live-first">{t.liveSort}</option></select><ChevronDown aria-hidden="true" /></span></label>
          </form>
          <CreatorRoleFilterControl roles={availableCreatorRoles(celebrities)} value={role} onChange={changeRole} locale={locale} controls="directory-results" compact />
          {ownedRows.length > 0 ? <section className={styles.block} aria-labelledby="directory-owned-heading">
            {sectionHeader(locale === "ko" ? "내 최애" : translate(locale, roleMessages.mc53f55277fa2, "My favorites"), "directory-owned-heading")}
            <div className={styles.list}>{ownedRows.map(renderCreator)}</div>
          </section> : null}
          {ownedRows.length > 0 && listRows.length === 0 ? null : <section className={styles.block} aria-labelledby="directory-all-heading">
            {sectionHeader(creatorRoleFilterLabel("all", locale), "directory-all-heading", listRows.length)}
            {listRows.length === 0 ? (
              <div id="directory-results" className={styles.empty} role="status"><p>{t.searchEmpty}</p>{filtersActive ? <FanAction variant="text" onClick={() => changeRole("all", true)}>{t.reset}</FanAction> : null}<FanAction variant="text" href={requestHref} leadingIcon={<Plus />}>{discovery.requestFavorite}</FanAction></div>
            ) : (
              <div id="directory-results" className={styles.list} aria-label={t.list}>
                {listRows.map(renderCreator)}
              </div>
            )}
          </section>}
        </>}
      </section>
    </FanContentContainer>
    </FanAppFrame>
  );
}
