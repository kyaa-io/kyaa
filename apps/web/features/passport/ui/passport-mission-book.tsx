"use client";
import { useCallback, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { dukjilText, type DukjilCopyKey } from "@/features/dukjil/ui/dukjil-copy";
import { useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { GroupRequestError, useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";
import { passportClaimResultSchema, passportRoadmapSchema, type PassportRoadmapPage, type PassportRoadmapSlot } from "../domain/dukjil-types";
import styles from "./passport-mission-book.module.css";

/** Slot kind → label key and the existing ink-v1 art file (no art is invented for kinds without one). */
const SLOT: Record<string, { label: DukjilCopyKey; art: string }> = {
  quiz: { label: "dukjilReview", art: "welcome" },
  daily_checkin: { label: "dukjilTileAttendance", art: "daily-checkin" },
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
  return <li className={styles.slot} data-state={slot.state} data-kind={slot.kind}>
    <span className={styles.art} aria-hidden="true">{meta ? <img src={`/images/stamps/ink-v1/${meta.art}.webp`} alt="" width={56} height={56} loading="lazy" /> : null}</span>
    <span className={styles.slotLabel} data-wrap-anywhere>{label}</span>
  </li>;
}

function Page({ page, locale, busy, failed, onClaim, proofHref }: { page: PassportRoadmapPage; locale: AppLocale; busy: boolean; failed: boolean; onClaim: () => void; proofHref: string }) {
  const locked = page.locked && !page.claimed;
  return <section className={styles.page} aria-labelledby={`mission-page-${page.pageNo}`} data-claimed={page.claimed} data-locked={locked}>
    <header className={styles.pageHead}>
      <h3 id={`mission-page-${page.pageNo}`}>{dukjilText(locale, "missionPage", [page.pageNo])}</h3>
      <span className={styles.count}>{page.filled}/{page.slots.length}</span>
    </header>
    <ol className={styles.slots}>{page.slots.map(slot => <Slot key={slot.slotNo} slot={slot} locale={locale} />)}</ol>
    {page.claimed ? <p className={styles.claimed}><Heart aria-hidden="true" size={18} />{dukjilText(locale, "missionClaimed")}</p>
      : locked ? <FanAction className={styles.lockedAction} variant="neutral" href={proofHref}>{dukjilText(locale, "missionLocked")}</FanAction>
      : <FanAction className={styles.claim} variant="primary" disabled={!page.claimable || busy} onClick={onClaim} leadingIcon={<Heart size={18} />}>{dukjilText(locale, "missionClaim")}</FanAction>}
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
