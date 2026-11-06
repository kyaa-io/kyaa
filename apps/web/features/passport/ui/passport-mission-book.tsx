"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Heart } from "lucide-react";
import paper from "@/components/fan-ui/passport-paper.module.css";
import { FanAction } from "@/components/fan-ui/fan-action";
import { dukjilText, type DukjilCopyKey } from "@/features/dukjil/ui/dukjil-copy";
import { useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { EarnBadge } from "@/features/dukjil/ui/earn-badge";
import { StampPress } from "@/features/dukjil/ui/stamp-press";
import { GroupRequestError, useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";
import { buildGuideModel } from "@/features/dukjil-guide/domain/guide-model";
import { passportClaimResultSchema, passportRoadmapSchema, type PassportRoadmapPage, type PassportRoadmapSlot } from "../domain/dukjil-types";
import { passportBookText } from "./passport-book-copy";
import styles from "./passport-mission-book.module.css";

/** Policy slot action (mission_book.pages[0].slots[].action) → label key and the existing ink-v1 art file (no art is invented for kinds without one). */
export const SLOT: Record<string, { label: DukjilCopyKey; task: DukjilCopyKey; art: string }> = {
  quiz: { label: "dukjilReview", task: "missionTaskQuiz", art: "welcome" },
  checkin: { label: "dukjilTileAttendance", task: "missionTaskCheckin", art: "daily-checkin" },
  post: { label: "dukjilTilePost", task: "missionTaskPost", art: "post" },
  comment: { label: "dukjilTileComment", task: "missionTaskComment", art: "first-comment" },
  share: { label: "dukjilTileShare", task: "missionTaskShare", art: "share" },
  invite: { label: "dukjilTileInvite", task: "missionTaskInvite", art: "invite" },
  subscription: { label: "missionSlotSubscription", task: "missionTaskSubscription", art: "subscription" },
  steady_checkin: { label: "missionSlotSteady", task: "missionTaskSteadyPlain", art: "steady-checkin" },
  proof: { label: "dukjilTileProof", task: "missionTaskProof", art: "proof" },
};

const withLocale = (path: string, locale: AppLocale) => `${path}?locale=${locale}` as Route;
const parseRoadmap = (value: unknown) => passportRoadmapSchema.parse(value);

function Slot({ slot, locale, stampSrc }: { slot: PassportRoadmapSlot; locale: AppLocale; stampSrc?: string }) {
  const dukjil = useDukjil();
  const meta = slot.kind ? SLOT[slot.kind] : undefined;
  const number = String(slot.slotNo);
  const label = meta ? dukjilText(locale, meta.label) : number;
  const filled = slot.state === "filled";
  const model = dukjil?.catalog && slot.kind === "steady_checkin" ? buildGuideModel(dukjil.catalog) : null;
  const days = model?.slots.find(item => item.action === "steady_checkin")?.days ?? null;
  const task = !meta ? null : days ? dukjilText(locale, "missionTaskSteady", [days]) : dukjilText(locale, meta.task);
  const rule = slot.kind ? dukjil?.catalog?.rules[slot.kind] as { points?: unknown } | undefined : undefined;
  const src = meta ? `/images/stamps/ink-v1/${meta.art}.webp` : filled ? stampSrc : undefined;
  // A slot that fills while the page is open gets the stamp press once; a slot already filled on arrival stays still.
  const before = useRef(filled);
  const [pressing, setPressing] = useState(false);
  useEffect(() => { if (filled && !before.current) setPressing(true); before.current = filled; }, [filled]);
  // Read-only checkbox semantics: the screen reader says filled or empty in the reader's own language, and nothing here can be pressed.
  return <li className={styles.slot} data-state={slot.state} data-kind={slot.kind}>
    {meta ? <span className={styles.number} aria-hidden="true">{number.padStart(2, "0")}</span> : null}
    <span className={styles.art} role="checkbox" aria-checked={filled} aria-disabled="true" aria-label={label}>
      {src ? <img src={src} alt="" width={64} height={64} loading="lazy" /> : !filled ? <span className={styles.emptyNumber} aria-hidden="true">{number}</span> : null}
      {filled ? <span className={styles.check}><Check aria-hidden="true" size={12} strokeWidth={3} /></span> : null}
      {pressing && <StampPress state="press" size={64} className={styles.pressed} onDone={() => setPressing(false)} />}
    </span>
    {meta ? <span className={styles.slotLabel} aria-hidden="true" data-wrap-anywhere>{label}</span> : null}
    {task && <span className={styles.slotTask} data-slot-task>{task}</span>}
    {meta && typeof rule?.points === "number" && rule.points > 0 && <EarnBadge variant="inline" locale={locale} points={rule.points} />}
  </li>;
}

/** ‹ 1/3 › with 44px buttons. Nothing renders for a single page. */
function Pager({ index, total, locale, onChange }: { index: number; total: number; locale: AppLocale; onChange: (next: number) => void }) {
  if (total < 2) return null;
  return <nav className={styles.pager} aria-label={dukjilText(locale, "missionPage", [index + 1])}>
    <FanAction className={styles.pagerButton} variant="neutral" ariaLabel={passportBookText(locale, "pagePrev")} leadingIcon={<ChevronLeft />} disabled={index === 0} onClick={() => onChange(index - 1)} />
    <span className={styles.pagerValue} data-testid="passport-page-indicator">{index + 1}/{total}</span>
    <FanAction className={styles.pagerButton} variant="neutral" ariaLabel={passportBookText(locale, "pageNext")} leadingIcon={<ChevronRight />} disabled={index === total - 1} onClick={() => onChange(index + 1)} />
  </nav>;
}

/** The page to open on: one ready to claim, then the first still filling, then the last. */
const openingPage = (pages: readonly PassportRoadmapPage[]) => {
  const ready = pages.findIndex(page => page.claimable && !page.claimed);
  if (ready >= 0) return ready;
  const filling = pages.findIndex(page => page.filled < page.slots.length);
  return filling >= 0 ? filling : Math.max(0, pages.length - 1);
};

function Page({ page, locale, busy, failed, onClaim, proofHref, pager, stampSrc }: { page: PassportRoadmapPage; locale: AppLocale; busy: boolean; failed: boolean; onClaim: () => void; proofHref: string; pager: ReactNode; stampSrc?: (stampId: string) => string | undefined }) {
  const locked = page.locked && !page.claimed;
  return <section className={styles.page} aria-labelledby={`mission-page-${page.pageNo}`} data-claimed={page.claimed} data-locked={locked}>
    <header className={styles.pageHead}>
      <h3 id={`mission-page-${page.pageNo}`}>{dukjilText(locale, "missionPage", [page.pageNo])}</h3>
      <span id={`mission-page-${page.pageNo}-count`} className={styles.count}>{page.filled}/{page.slots.length}</span>
      {pager}
    </header>
    <ol className={styles.slots}>{page.slots.map(slot => <Slot key={slot.slotNo} slot={slot} locale={locale} stampSrc={slot.stampId ? stampSrc?.(slot.stampId) : undefined} />)}</ol>
    {page.claimed ? <p className={styles.claimed}><Heart aria-hidden="true" size={18} />{dukjilText(locale, "missionClaimed")}</p>
      : locked ? <FanAction className={styles.lockedAction} variant="neutral" href={proofHref}>{dukjilText(locale, "missionLocked")}</FanAction>
      : <FanAction className={styles.claim} variant="primary" disabled={!page.claimable || busy} ariaDescribedBy={page.claimable ? undefined : `mission-page-${page.pageNo}-hint`} onClick={onClaim} leadingIcon={<Heart size={18} />}>{dukjilText(locale, "missionClaim")}</FanAction>}
    {!page.claimed && !locked && !page.claimable ? <p id={`mission-page-${page.pageNo}-hint`} className={styles.hint}>{dukjilText(locale, "missionClaimHint", [page.slots.length])}</p> : null}
    {failed ? <p className={styles.error} role="alert">{dukjilText(locale, "missionClaimFailed")}</p> : null}
  </section>;
}

/** Mission book of one passport: 9 stamp slots per page, one heart per completed page, page 2+ locked until the 찐팬 title. Rendered only while the dukjil policy is active. */
export function PassportMissionBook({ passportId, creatorSlug, locale, stampSrc }: { passportId: string; creatorSlug: string; locale: AppLocale; stampSrc?: (stampId: string) => string | undefined }) {
  const dukjil = useDukjil();
  const on = dukjil?.status === "on";
  const roadmap = useGroupResource(on ? `/api/me/passports/${encodeURIComponent(passportId)}/roadmap` : null, parseRoadmap);
  const { request } = useGroupRequest();
  const [busy, setBusy] = useState<number | null>(null);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
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
  const pages = roadmap.data?.pages ?? [];
  const index = Math.min(picked ?? openingPage(pages), Math.max(0, pages.length - 1));
  const page = pages[index];
  return <section id="mission-book" className={`${paper.palette} ${styles.book}`} aria-labelledby="mission-book-title" aria-busy={roadmap.loading}>
    <div className={styles.head}>
      <h2 id="mission-book-title">{dukjilText(locale, "missionBookTitle")}</h2>
      {roadmap.data ? <span className={styles.hearts}><Heart aria-hidden="true" size={18} />{dukjilText(locale, "missionHearts", [roadmap.data.hearts])}</span> : null}
    </div>
    {roadmap.loading ? <div className={styles.skeleton} aria-hidden="true"><i /><i /></div>
      : roadmap.error || !roadmap.data ? <div className={styles.errorBox} role="alert"><p>{dukjilText(locale, "missionLoadError")}</p><FanAction variant="neutral" onClick={retry}>{dukjilText(locale, "missionRetry")}</FanAction></div>
      : page ? <div className={styles.pages}><Page key={page.pageNo} page={page} locale={locale} busy={busy === page.pageNo} failed={failedPage === page.pageNo} onClaim={() => void claim(page.pageNo)} proofHref={proofHref} stampSrc={stampSrc} pager={<Pager index={index} total={pages.length} locale={locale} onChange={setPicked} />} /></div> : null}
  </section>;
}

const STACK = 9;
/** While the dukjil policy is off the book only stacks earned stamps, nine a page, and offers no claim. */
export function StackedStampPages({ stamps, locale }: { stamps: readonly { id: string; src: string }[]; locale: AppLocale }) {
  const total = Math.max(1, Math.ceil(stamps.length / STACK));
  const [picked, setPicked] = useState<number | null>(null);
  const index = Math.min(picked ?? (stamps.length && stamps.length % STACK === 0 ? total - 1 : Math.floor(stamps.length / STACK)), total - 1);
  const onPage = stamps.slice(index * STACK, (index + 1) * STACK);
  return <section id="mission-book" className={`${paper.palette} ${styles.book}`}>
    <div className={styles.pages}><section className={styles.page}>
      <header className={styles.pageHead}>
        <h3>{dukjilText(locale, "missionPage", [index + 1])}</h3>
        <span className={styles.count}>{onPage.length}/{STACK}</span>
        <Pager index={index} total={total} locale={locale} onChange={setPicked} />
      </header>
      <ol className={styles.slots}>{Array.from({ length: STACK }, (_, slot) => <Slot key={slot} locale={locale} stampSrc={onPage[slot]?.src} slot={{ slotNo: slot + 1, kind: null, state: onPage[slot] ? "filled" : "empty", stampId: onPage[slot]?.id ?? null, clearedAt: null }} />)}</ol>
    </section></div>
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
  return <section id="mission-book" className={`${paper.palette} ${styles.book} ${wide ? styles.guestWide : ""}`} aria-labelledby="mission-book-title">
    <div className={styles.head}><Heading id="mission-book-title">{dukjilText(locale, "missionBookTitle")}</Heading></div>
    <div className={styles.pages}><section className={styles.page} data-guest="true" aria-label={dukjilText(locale, "missionPage", [1])}>
      <ol className={styles.slots}>{model.slots.map(slot => <Slot key={slot.slot} locale={locale} slot={{ slotNo: slot.slot, kind: slot.action, state: "empty", stampId: null, clearedAt: null }} />)}</ol>
    </section></div>
  </section>;
}
