"use client";

import { ArrowRight, Lock } from "lucide-react";
import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanLockedValue } from "@/components/fan-ui/fan-locked-value";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { communityStampLabel, communityStampThumb, type CommunityStamp } from "@/features/community-stamps/domain/community-stamps";
import { dukjilText, type DukjilCopyKey } from "@/features/dukjil/ui/dukjil-copy";
import { DukjilProvider, useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { useGroupResource } from "@/features/groups/ui/use-group-resource";
import { passportRoadmapSchema, type PassportRoadmapSlot } from "@/features/passport/domain/dukjil-types";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import { PassportIdentityArtwork } from "@/features/passport/ui/passport-identity-artwork";
import { GuestMissionBook } from "@/features/passport/ui/passport-mission-book";
import { fanStageLabel } from "@/features/rewards/domain/fan-stage";
import type { AppLocale } from "@/i18n/locales";
import type { MySummary } from "../domain/my-summary";
import { fanTierProgress } from "../domain/my-progress";
import { myHomeText } from "./my-home-copy";
import styles from "./my-passport-card.module.css";

type Creator = MySummary["creators"][number];

/** 미션북 칸의 이름과 그림. 미션북(passport-mission-book.tsx)의 칸 표와 같은 값이다. 그림이 없는 종류는 칸 번호로 둔다. */
const SLOT: Record<string, { label: DukjilCopyKey; art: string }> = {
  quiz: { label: "dukjilReview", art: "welcome" },
  checkin: { label: "dukjilTileAttendance", art: "daily-checkin" },
  post: { label: "dukjilTilePost", art: "post" },
  comment: { label: "dukjilTileComment", art: "first-comment" },
  share: { label: "dukjilTileShare", art: "share" },
  invite: { label: "dukjilTileInvite", art: "invite" },
  subscription: { label: "missionSlotSubscription", art: "subscription" },
  steady_checkin: { label: "missionSlotSteady", art: "steady-checkin" },
  proof: { label: "dukjilTileProof", art: "proof" },
};

const parseRoadmap = (value: unknown) => passportRoadmapSchema.parse(value);

/** 한 최애의 미션북 1쪽. 정책이 켜져 있을 때만 읽는다. */
export function usePassportBook(passportId: string | null | undefined) {
  const dukjil = useDukjil();
  const on = dukjil?.status === "on";
  const roadmap = useGroupResource(on && passportId ? `/api/me/passports/${encodeURIComponent(passportId)}/roadmap` : null, parseRoadmap);
  const page = roadmap.data?.pages[0];
  return { status: !dukjil || dukjil.status === "off" ? "off" as const : roadmap.error && !roadmap.data ? "error" as const : page ? "ready" as const : "loading" as const, page, retry: roadmap.retry };
}

/** 다음 등급까지: 세부 단계가 있으면 단계, 없으면 큰 등급 기준. */
function nextTierStep(locale: AppLocale, passport: NonNullable<Creator["passport"]>) {
  const stage = passport.stageProgress;
  if (stage) return { percent: stage.progressPercent, text: stage.next ? myHomeText(locale, "nextTier", [fanStageLabel(locale, stage.next), stage.remaining.toLocaleString(locale)]) : myHomeText(locale, "topTier") };
  const step = fanTierProgress(passport);
  return { percent: step.percent, text: step.nextTier ? myHomeText(locale, "nextTier", [levelLabel(locale, step.nextTier), step.remaining.toLocaleString(locale)]) : myHomeText(locale, "topTier") };
}

/** 이름 옆 태그와 카드가 같은 등급 이름을 쓴다. */
export function passportTierName(locale: AppLocale, passport: NonNullable<Creator["passport"]>) {
  return passport.stageProgress ? fanStageLabel(locale, passport.stageProgress.current) : levelLabel(locale, passport.tier);
}

function Bar({ value, label }: { value: number; label: string }) {
  return <div className={styles.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><span style={{ inlineSize: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

function SlotItem({ slot, locale }: { slot: PassportRoadmapSlot; locale: AppLocale }) {
  const meta = slot.kind ? SLOT[slot.kind] : undefined;
  const name = meta ? dukjilText(locale, meta.label) : String(slot.slotNo);
  const earned = slot.state === "filled";
  return <li className={styles.slot} data-state={slot.state} aria-label={myHomeText(locale, earned ? "slotEarned" : "slotLocked", [name])}>
    <span className={styles.slotArt} aria-hidden="true">
      {meta ? <img src={`/images/stamps/ink-v1/${meta.art}.webp`} alt="" width={56} height={56} loading="lazy" /> : null}
      {earned ? null : <Lock className={styles.lock} />}
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

/** MY에서 가장 큰 덩어리. 여권, 등급, 도장 진행과 등급 진행, 그 아래 받은 도장(색)과 못 받은 도장(회색 잠금)을 한 카드에 둔다. */
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
  const filled = book.page?.filled ?? null;
  const total = book.page?.slots.length ?? 9;
  return <section className={styles.card} aria-label={labels.title}>
    <header><h2>{labels.title}</h2><FanAction variant="text" trailingIcon={<ArrowRight />} href={href}>{labels.detail}</FanAction></header>
    {!selected || !passport ? <div className={styles.empty}><p>{labels.noCreators}</p><FanAction href={`/celebrities?locale=${locale}`}>{labels.findCreator}</FanAction></div> : <>
      {eligible.length > 1 ? <div className={styles.selector}><FanTabs variant="chip" label={labels.creators} current={selected.celebrity.slug} items={eligible.map((creator) => ({ key: creator.celebrity.slug, label: creator.celebrity.name, onSelect: () => onSelect(creator.celebrity.slug) }))} /></div> : null}
      <div className={styles.body}>
        <Link href={href as Route} className={styles.book} data-my-passport-book={passport.id}>
          <PassportIdentityArtwork celebrity={selected.celebrity} locale={locale} level={passport.tier} stamps={[]} totalCount={filled ?? fallbackStamps.length} priority />
        </Link>
        <div className={styles.facts}>
          <h3>{myHomeText(locale, "passportRecord", [selected.celebrity.name])}</h3>
          <p className={styles.tier}>
            <Image unoptimized src={`/images/passport/tiers/ink-v1/${stage?.current.key ?? `${passport.tier.toLowerCase()}-1`}.webp`} width={32} height={32} alt="" aria-hidden="true" />
            <strong>{tierName}</strong>
          </p>
          <div className={styles.progress}>
            {book.status === "ready" && filled !== null ? <><span>{myHomeText(locale, "stampProgress", [filled, total])}</span><Bar value={(filled / total) * 100} label={myHomeText(locale, "stampProgress", [filled, total])} /></> : book.status === "loading" ? <FanSkeleton width="60%" height={20} /> : null}
          </div>
          {tierStep ? <div className={styles.progress}>
            <span>{tierStep.text}</span>
            <Bar value={tierStep.percent} label={tierStep.text} />
          </div> : null}
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
export function MyPassportCardSkeleton({ title }: { title: string }) {
  return <section className={styles.card} aria-label={title}>
    <header><h2>{title}</h2></header>
    <div className={styles.body} aria-hidden="true">
      <FanSkeleton shape="block" className={styles.bookSkeleton} />
      <div className={styles.facts}><FanSkeleton width="60%" height={24} /><FanSkeleton width="40%" height={32} /><FanSkeleton width="100%" height={40} /><FanSkeleton width="100%" height={40} /></div>
    </div>
    <div className={styles.slots} aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span className={styles.slot} key={index}><FanSkeleton shape="circle" width={48} height={48} /><FanSkeleton width={40} height={12} /></span>)}</div>
  </section>;
}

/** 비로그인 패스포트 카드. 로그인 화면과 같은 외곽: 여권 표지, 잠긴 진행, 공개 미션북 9칸. 내 값은 잠근 칸으로 둔다. */
export function MyGuestPassportCard({ locale, labels, compact = false }: { locale: AppLocale; labels: Pick<MyPassportLabels, "title" | "detail">; compact?: boolean }) {
  return <section className={`${styles.card} ${styles.guest} ${compact ? styles.compact : ""}`} aria-label={labels.title}>
    <header><h2>{labels.title}</h2><FanAction variant="text" trailingIcon={<ArrowRight />} href={`/passports?locale=${locale}`}>{labels.detail}</FanAction></header>
    <div className={styles.body}>
      <div className={styles.book}><Image src="/images/guest-home/passport-open-blank-9-transparent.png" alt="" width={1536} height={1024} sizes="(max-width:767px) 280px, 360px" priority /></div>
      <div className={styles.facts}>
        <div className={styles.progress}><span>{myHomeText(locale, "tierLabel")}</span><FanLockedValue locale={locale} /></div>
        <div className={styles.progress}><span>{myHomeText(locale, "stampsLabel")}</span><FanLockedValue locale={locale} /></div>
      </div>
    </div>
    <div className={styles.guestBook}><DukjilProvider locale={locale}><GuestMissionBook locale={locale} wide headingLevel={3} /></DukjilProvider></div>
  </section>;
}
