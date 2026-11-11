"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import { FanLoginScene } from "@/components/fan-ui/fan-login-scene";
import { FanCellGauge } from "@/components/fan-ui/fan-cell-gauge";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { communityStampLabel, communityStampThumb, type CommunityStamp } from "@/features/community-stamps/domain/community-stamps";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { DukjilProvider, useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { useGroupResource } from "@/features/groups/ui/use-group-resource";
import { passportRoadmapSchema, type PassportRoadmapSlot } from "@/features/passport/domain/dukjil-types";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import { GuestLoginAction } from "./guest-login";
import { PassportIdentityArtwork } from "@/features/passport/ui/passport-identity-artwork";
import { GuestMissionBook, SLOT, openingPage } from "@/features/passport/ui/passport-mission-book";
import { fanStageLabel, type FanStageProgress } from "@/features/rewards/domain/fan-stage";
import { fanStageNextText } from "@/features/rewards/ui/fan-stage-next";
import type { AppLocale } from "@/i18n/locales";
import type { MySummary } from "../domain/my-summary";
import { myHomeText } from "./my-home-copy";
import styles from "./my-passport-card.module.css";

type Creator = MySummary["creators"][number];

const parseRoadmap = (value: unknown) => passportRoadmapSchema.parse(value);

/** 한 최애의 미션북 1쪽. 정책이 켜져 있을 때만 읽는다. */
export function usePassportBook(passportId: string | null | undefined) {
  const dukjil = useDukjil();
  const on = dukjil?.status === "on";
  const roadmap = useGroupResource(on && passportId ? `/api/me/passports/${encodeURIComponent(passportId)}/roadmap` : null, parseRoadmap);
  // 스탬프 수는 어디서나 "지금 채우는 미션북 쪽의 찍힌 칸/그 쪽의 칸"이다. 패스포트 상세가 여는 쪽과 같다.
  const pages = roadmap.data?.pages ?? [];
  const page = pages[openingPage(pages)];
  return { status: !dukjil || dukjil.status === "off" ? "off" as const : roadmap.error && !roadmap.data ? "error" as const : page ? "ready" as const : "loading" as const, page, retry: roadmap.retry };
}

const MAX_STAGE_CELLS = 10;

/** 다음 단계 게이지의 칸. 남은 수가 작으면 (찬 칸 + 남은 칸)을 그대로 칸으로 쓰고, 10칸을 넘기면 10칸에 비율로 채운다. 다음 단계가 없으면 가득 찬 10칸. */
export function stageGaugeCells(stage: Pick<FanStageProgress, "next" | "remaining" | "progressPercent">) {
  const percent = Math.min(100, Math.max(0, stage.progressPercent));
  if (!stage.next) return { cells: MAX_STAGE_CELLS, filled: MAX_STAGE_CELLS };
  const total = percent >= 100 ? stage.remaining : Math.round(stage.remaining / (1 - percent / 100));
  if (total >= 1 && total <= MAX_STAGE_CELLS && stage.remaining <= total) return { cells: total, filled: total - stage.remaining };
  const ratio = Math.round(percent / 10);
  return { cells: MAX_STAGE_CELLS, filled: stage.remaining > 0 ? Math.min(MAX_STAGE_CELLS - 1, percent > 0 ? Math.max(1, ratio) : 0) : MAX_STAGE_CELLS };
}

const GAUGE_ICON = { ink: "/images/passport/gauge/ink.webp", stamp: "/images/passport/gauge/stamp.webp", heart: "/images/passport/gauge/heart.webp" } as const;

/** 다음 단계까지: 서버의 단계 진행(stageProgress)만 읽는다(BUGS-1846). 없으면 다음 단계를 말하지 않는다. */
export function nextTierStep(locale: AppLocale, passport: NonNullable<Creator["passport"]>) {
  const stage = passport.stageProgress;
  if (!stage) return null;
  return { percent: stage.progressPercent, text: fanStageNextText(locale, stage) ?? myHomeText(locale, "topTier"), icon: stage.unit === "stamps" ? GAUGE_ICON.stamp : stage.unit === "hearts" ? GAUGE_ICON.heart : GAUGE_ICON.ink, ...stageGaugeCells(stage) };
}

/** 이름 옆 태그와 카드가 같은 등급 이름을 쓴다. */
export function passportTierName(locale: AppLocale, passport: NonNullable<Creator["passport"]>) {
  return passport.stageProgress ? fanStageLabel(locale, passport.stageProgress.current) : levelLabel(locale, passport.tier);
}

/** 찍힌 칸의 그림. 미션이 정해지지 않은 2쪽부터는 공통 미션 스탬프를 쓴다. */
const slotArtSrc = (slot: PassportRoadmapSlot) => `/images/stamps/ink-v1/${(slot.kind ? SLOT[slot.kind]?.art : undefined) ?? "mission"}.webp`;

/** 여권 그림의 칸에 찍을 스탬프들. 숫자와 같은 쪽에서 가져온다. */
export function filledSlotArt(page: NonNullable<ReturnType<typeof usePassportBook>["page"]> | undefined) {
  return page?.slots.flatMap((slot) => slot.state === "filled" ? [{ key: String(slot.slotNo), src: slotArtSrc(slot) }] : []) ?? [];
}

/** 미션북 한 쪽의 스탬프 줄. 카드 안에서 스탬프 수와 같은 쪽을 보여 준다. */
export function PassportSlotRow({ page, locale }: { page: NonNullable<ReturnType<typeof usePassportBook>["page"]>; locale: AppLocale }) {
  return <ul className={styles.slots}>{page.slots.map((slot) => <SlotItem key={slot.slotNo} slot={slot} locale={locale} />)}</ul>;
}

function SlotItem({ slot, locale }: { slot: PassportRoadmapSlot; locale: AppLocale }) {
  const meta = slot.kind ? SLOT[slot.kind] : undefined;
  const name = meta ? dukjilText(locale, meta.label) : String(slot.slotNo);
  const earned = slot.state === "filled";
  return <li className={styles.slot} data-state={slot.state} aria-label={myHomeText(locale, earned ? "slotEarned" : "slotLocked", [name])}>
    <span className={styles.slotArt} aria-hidden="true">
      <img src={earned ? slotArtSrc(slot) : `/images/stamps/ghost-v1/${(slot.kind ? SLOT[slot.kind]?.art : undefined) ?? "frame"}.webp`} alt="" width={56} height={56} loading="lazy" />
    </span>
    <span className={styles.slotName} aria-hidden="true">{name}</span>
  </li>;
}

export type MyPassportLabels = { title: string; detail: string; noCreators: string; findCreator: string; loadError: string; retry: string; creators: string };

type CardProps = {
  creators: Creator[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  communityStamps: CommunityStamp[];
  stampsError: boolean;
  retryStamps: () => void;
  locale: AppLocale;
  labels: MyPassportLabels;
};

/** MY에서 가장 큰 덩어리. 여권, 등급, 스탬프 진행과 등급 진행, 그 아래 받은 스탬프(색)과 못 받은 스탬프(회색 잠금)을 한 카드에 둔다. */
export function MyPassportCard({ creators, selectedSlug, onSelect, communityStamps, stampsError, retryStamps, locale, labels }: CardProps) {
  const eligible = creators.filter((creator) => creator.passport);
  const selected = eligible.find((creator) => creator.celebrity.slug === selectedSlug) ?? eligible[0];
  const passport = selected?.passport ?? null;
  const book = usePassportBook(passport?.id);
  const href = passport ? `/passports/${passport.id}?locale=${locale}` : `/passports?locale=${locale}`;
  const stage = passport?.stageProgress ?? null;
  const tierName = passport ? passportTierName(locale, passport) : "";
  const earnedKinds = communityStamps.filter((stamp) => stamp.kind === "welcome" || (["first_comment", "daily_checkin"].includes(stamp.kind) && stamp.celebritySlug === selected?.celebrity.slug));
  const fallbackStamps = ["welcome", "first_comment", "daily_checkin"].flatMap((kind) => {
    const latest = earnedKinds.filter((stamp) => stamp.kind === kind).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];
    return latest ? [latest] : [];
  });
  const tierStep = passport ? nextTierStep(locale, passport) : null;
  const manyPassports = eligible.length > 1;
  useEffect(() => { try { localStorage.setItem(CHIPS_KEY, manyPassports ? "1" : "0"); } catch { /* 기기별 편의값이다. */ } }, [manyPassports]);
  const filled = book.page?.filled ?? null;
  const total = book.page?.slots.length ?? 9;
  const filledArt = filledSlotArt(book.page);
  return <section className={styles.card} aria-label={labels.title}>
    <header><FanHeading>{labels.title}</FanHeading><FanSectionLink href={href}>{labels.detail}</FanSectionLink></header>
    {!selected || !passport ? <div className={styles.empty}><p>{labels.noCreators}</p><FanAction href={`/celebrities?locale=${locale}`}>{labels.findCreator}</FanAction></div> : <>
      {eligible.length > 1 ? <div className={styles.selector}><FanTabs variant="chip" label={labels.creators} current={selected.celebrity.slug} items={eligible.map((creator) => ({ key: creator.celebrity.slug, label: creator.celebrity.name, onSelect: () => onSelect(creator.celebrity.slug) }))} /></div> : null}
      <div className={styles.body}>
        <Link href={href as Route} className={styles.book} data-my-passport-book={passport.id} aria-label={`${selected.celebrity.name} · ${labels.detail}`}>
          <PassportIdentityArtwork celebrity={selected.celebrity} locale={locale} level={passport.tier} stamps={[]} slotArt={filledArt} totalCount={filled ?? fallbackStamps.length} priority />
        </Link>
        <div className={styles.facts}>
          <h3>{myHomeText(locale, "passportRecord", [selected.celebrity.name])}</h3>
          <p className={styles.tier}>
            <Image unoptimized src={`/images/passport/tiers/ink-v1/${stage?.current.key ?? `${passport.tier.toLowerCase()}-1`}.webp`} width={32} height={32} alt="" aria-hidden="true" />
            <strong>{tierName}</strong>
          </p>
          <div className={styles.progress}>
            {book.status === "ready" && filled !== null ? <FanCellGauge icon={GAUGE_ICON.ink} text={myHomeText(locale, "stampProgress", [filled, total])} label={myHomeText(locale, "stampProgressFull", [filled, total])} cells={total} filled={filled} /> : book.status === "loading" ? <FanSkeleton width="100%" height={52} /> : null}
          </div>
          {tierStep ? <div className={styles.progress}><FanCellGauge icon={tierStep.icon} text={tierStep.text} label={tierStep.text} cells={tierStep.cells} filled={tierStep.filled} /></div> : null}
        </div>
      </div>
      {book.status === "ready" && book.page ? <ul className={styles.slots}>{book.page.slots.map((slot) => <SlotItem key={slot.slotNo} slot={slot} locale={locale} />)}</ul>
        : book.status === "loading" ? <div className={styles.slots} aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span className={styles.slot} key={index}><FanSkeleton shape="circle" width={48} height={48} /><FanSkeleton width={40} height={12} /></span>)}</div>
        : fallbackStamps.length > 0 ? <ul className={styles.slots}>{fallbackStamps.map((stamp) => <li className={styles.slot} data-state="filled" key={stamp.id}><span className={styles.slotArt}><img src={communityStampThumb(stamp.kind)} alt="" width={56} height={56} /></span><span className={styles.slotName}>{communityStampLabel(stamp.kind, locale)}</span></li>)}</ul>
        : null}
      {book.status === "error" || (book.status === "off" && stampsError) ? <div className={styles.state} role="alert"><p>{labels.loadError}</p><FanAction onClick={() => { book.retry(); retryStamps(); }}>{labels.retry}</FanAction></div> : null}
    </>}
  </section>;
}

/** 패스포트를 읽는 동안의 카드. 실제 카드와 같은 외곽·순서이고 제목만 글자로 둔다. */
/** 패스포트가 둘 이상인 회원은 칩 줄이 생긴다. 지난번 값으로 자리를 잡아 카드가 내려앉지 않게 한다. 기기별 편의값이다. */
const CHIPS_KEY = "kyaa:my:passport-chips";
export function MyPassportCardSkeleton({ title }: { title: string }) {
  const [chips, setChips] = useState(false);
  useLayoutEffect(() => { try { setChips(localStorage.getItem(CHIPS_KEY) === "1"); } catch { /* 자리만 잡는 값이라 없어도 된다. */ } }, []);
  return <section className={styles.card} aria-label={title}>
    <header><FanHeading>{title}</FanHeading></header>
    {chips ? <div className={styles.selector} style={{ visibility: "hidden" }} aria-hidden="true" data-passport-chip-space><FanTabs variant="chip" label="" current="" items={[{ key: "space", label: "\u00a0" }]} /></div> : null}
    <div className={styles.body} aria-hidden="true">
      <span className={styles.bookSkeleton}><Image src="/images/passport/passport-open-book.svg" alt="" width={1536} height={1024} unoptimized sizes="(max-width:767px) 100vw, 380px" priority /></span>
      <div className={styles.facts}><FanSkeleton width="60%" height={24} /><FanSkeleton width="40%" height={32} /><FanSkeleton width="100%" height={40} /><FanSkeleton width="100%" height={40} /></div>
    </div>
    <div className={styles.slots} aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span className={styles.slot} key={index}><FanSkeleton shape="circle" width={48} height={48} /><FanSkeleton width={40} height={12} /></span>)}</div>
  </section>;
}

/** 비로그인 패스포트 카드. 로그인 화면과 같은 외곽: 여권 그림과 로그인 버튼, 공개 미션북 9칸. 내 값은 내지 않는다. */
const GUEST_PASSPORT_IMAGE = "/images/passport/passport-cover-closed.webp";

export function MyGuestPassportCard({ locale, labels, compact = false }: { locale: AppLocale; labels: Pick<MyPassportLabels, "title" | "detail">; compact?: boolean }) {
  return <section className={`${styles.card} ${styles.guest} ${compact ? styles.compact : ""}`} aria-label={labels.title}>
    <header><FanHeading>{labels.title}</FanHeading><FanSectionLink href={`/passports?locale=${locale}`}>{labels.detail}</FanSectionLink></header>
    <FanLoginScene className={styles.guestScene} cover={{ src: GUEST_PASSPORT_IMAGE, width: 800, height: 1067 }} items={[]} action={<GuestLoginAction locale={locale} returnTo={`/my?locale=${locale}`} variant="primary" fullWidth />} />
    <div className={styles.guestBook}><DukjilProvider locale={locale}><GuestMissionBook locale={locale} wide headingLevel={3} /></DukjilProvider></div>
  </section>;
}
