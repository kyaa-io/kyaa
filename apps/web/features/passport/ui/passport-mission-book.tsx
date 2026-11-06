"use client";
import { useCallback, useRef, useState } from "react";
import { Check, Heart } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { dukjilText, type DukjilCopyKey } from "@/features/dukjil/ui/dukjil-copy";
import { useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { GroupRequestError, useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";
import { buildGuideModel } from "@/features/dukjil-guide/domain/guide-model";
import { passportClaimResultSchema, passportRoadmapSchema, type PassportRoadmapPage, type PassportRoadmapSlot } from "../domain/dukjil-types";
import styles from "./passport-mission-book.module.css";

/** Policy slot action (mission_book.pages[0].slots[].action) → label key and the existing ink-v1 art file (no art is invented for kinds without one). */
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

const withLocale = (path: string, locale: AppLocale) => `${path}?locale=${locale}` as Route;
const parseRoadmap = (value: unknown) => passportRoadmapSchema.parse(value);

function Slot({ slot, locale }: { slot: PassportRoadmapSlot; locale: AppLocale }) {
  const meta = slot.kind ? SLOT[slot.kind] : undefined;
  const label = meta ? dukjilText(locale, meta.label) : String(slot.slotNo);
  const filled = slot.state === "filled";
  // Read-only checkbox semantics: the screen reader says filled or empty in the reader's own language, and nothing here can be pressed.
  return <li className={styles.slot} data-state={slot.state} data-kind={slot.kind}>
    <span className={styles.art} role="checkbox" aria-checked={filled} aria-disabled="true" aria-label={label}>{meta ? <img src={`/images/stamps/ink-v1/${meta.art}.webp`} alt="" width={56} height={56} loading="lazy" /> : filled ? <Check aria-hidden="true" size={28} /> : null}</span>
    <span className={styles.slotLabel} aria-hidden="true" data-wrap-anywhere>{label}</span>
  </li>;
}

function Page({ page, locale, busy, failed, onClaim, proofHref }: { page: PassportRoadmapPage; locale: AppLocale; busy: boolean; failed: boolean; onClaim: () => void; proofHref: string }) {
  const locked = page.locked && !page.claimed;
  return <section className={styles.page} aria-labelledby={`mission-page-${page.pageNo}`} data-claimed={page.claimed} data-locked={locked}>
    <header className={styles.pageHead}>
      <h3 id={`mission-page-${page.pageNo}`}>{dukjilText(locale, "missionPage", [page.pageNo])}</h3>
      <span id={`mission-page-${page.pageNo}-count`} className={styles.count}>{page.filled}/{page.slots.length}</span>
    </header>
    <ol className={styles.slots}>{page.slots.map(slot => <Slot key={slot.slotNo} slot={slot} locale={locale} />)}</ol>
    {page.claimed ? <p className={styles.claimed}><Heart aria-hidden="true" size={18} />{dukjilText(locale, "missionClaimed")}</p>
      : locked ? <FanAction className={styles.lockedAction} variant="neutral" href={proofHref}>{dukjilText(locale, "missionLocked")}</FanAction>
      : <FanAction className={styles.claim} variant="primary" disabled={!page.claimable || busy} ariaDescribedBy={page.claimable ? undefined : `mission-page-${page.pageNo}-count`} onClick={onClaim} leadingIcon={<Heart size={18} />}>{dukjilText(locale, "missionClaim")}</FanAction>}
    {failed ? <p className={styles.error} role="alert">{dukjilText(locale, "missionClaimFailed")}</p> : null}
  </section>;
}

/** Mission book of one passport: 9 stamp slots per page, one heart per completed page, page 2+ locked until the 찐팬 title. Rendered only while the dukjil policy is active. */
export function PassportMissionBook({ passportId, creatorSlug, locale }: { passportId: string; creatorSlug: string; locale: AppLocale }) {
  const dukjil = useDukjil();
  const on = dukjil?.status === "on";
  const roadmap = useGroupResource(on ? `/api/me/passports/${encodeURIComponent(passportId)}/roadmap` : null, parseRoadmap);
  const { request } = useGroupRequest();
  const [busy, setBusy] = useState<number | null>(null);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const { retry } = roadmap;
  /** One request key per page until the claim is settled, so a retry after a failure replays the same claim. */
  const keys = useRef(new Map<number, string>());
  const claim = useCallback(async (pageNo: number) => {
    setBusy(pageNo); setFailedPage(null);
    const requestKey = keys.current.get(pageNo) ?? crypto.randomUUID();
    keys.current.set(pageNo, requestKey);
    try {
      const result = await request(`/api/me/passports/${encodeURIComponent(passportId)}/pages/${pageNo}/claim`, { method: "POST", body: JSON.stringify({ requestKey }) });
      passportClaimResultSchema.parse(result);
      keys.current.delete(pageNo);
    } catch (error) {
      if (error instanceof GroupRequestError && error.status === 409) keys.current.delete(pageNo);
      else setFailedPage(pageNo);
    } finally { setBusy(null); retry(); }
  }, [passportId, request, retry]);
  if (!on) return null;
  const proofHref = withLocale(`/c/${encodeURIComponent(creatorSlug)}/certifications`, locale);
  return <section id="mission-book" className={styles.book} aria-labelledby="mission-book-title" aria-busy={roadmap.loading}>
    <div className={styles.head}>
      <h2 id="mission-book-title">{dukjilText(locale, "missionBookTitle")}</h2>
      {roadmap.data ? <span className={styles.hearts}><Heart aria-hidden="true" size={18} />{dukjilText(locale, "missionHearts", [roadmap.data.hearts])}</span> : null}
    </div>
    {roadmap.loading ? <div className={styles.skeleton} aria-hidden="true"><i /><i /></div>
      : roadmap.error || !roadmap.data ? <div className={styles.errorBox} role="alert"><p>{dukjilText(locale, "missionLoadError")}</p><FanAction variant="neutral" onClick={retry}>{dukjilText(locale, "missionRetry")}</FanAction></div>
      : <div className={styles.pages}>{roadmap.data.pages.map(page => <Page key={page.pageNo} page={page} locale={locale} busy={busy === page.pageNo} failed={failedPage === page.pageNo} onClaim={() => void claim(page.pageNo)} proofHref={proofHref} />)}</div>}
  </section>;
}

/** 비로그인 미션북. 공개 카탈로그의 9칸 구성을 빈 칸으로 보여 준다. 채운 칸 수·하트 같은 내 값은 내지 않는다. 정책이 꺼져 있으면 그리지 않는다. */
export function GuestMissionBook({ locale, wide = false, headingLevel = 2 }: { locale: AppLocale; wide?: boolean; headingLevel?: 2 | 3 }) {
  const dukjil = useDukjil();
  const model = dukjil?.status === "on" && dukjil.catalog ? buildGuideModel(dukjil.catalog) : null;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  if (!dukjil) return null;
  if (dukjil.status === "loading") return <section className={styles.book} aria-hidden="true"><div className={styles.skeleton}><i /></div></section>;
  if (!model || model.slots.length === 0) return null;
  return <section id="mission-book" className={`${styles.book} ${wide ? styles.guestWide : ""}`} aria-labelledby="mission-book-title">
    <div className={styles.head}><Heading id="mission-book-title">{dukjilText(locale, "missionBookTitle")}</Heading></div>
    <div className={styles.pages}><section className={styles.page} data-guest="true" aria-label={dukjilText(locale, "missionPage", [1])}>
      <ol className={styles.slots}>{model.slots.map(slot => <Slot key={slot.slot} locale={locale} slot={{ slotNo: slot.slot, kind: slot.action, state: "empty", stampId: null, clearedAt: null }} />)}</ol>
    </section></div>
  </section>;
}
