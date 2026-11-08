"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Heart } from "lucide-react";
import paper from "@/components/fan-ui/passport-paper.module.css";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanHelpTip } from "@/components/fan-ui/fan-help-tip";
import { fanLoginHref } from "@/components/login-href";
import { Dialog } from "@/components/ui/overlay/accessible-overlay";
import { dukjilText, type DukjilCopyKey } from "@/features/dukjil/ui/dukjil-copy";
import { useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { EarnBadge } from "@/features/dukjil/ui/earn-badge";
import { StampPress } from "@/features/dukjil/ui/stamp-press";
import { GroupRequestError, useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { useByUsSession } from "@/components/byus-session-provider";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";
import { buildGuideModel } from "@/features/dukjil-guide/domain/guide-model";
import { passportClaimResultSchema, passportRoadmapSchema, type PassportRoadmapPage, type PassportRoadmapSlot } from "../domain/dukjil-types";
import { passportBookText } from "./passport-book-copy";
import { MISSION_STAMP } from "./passport-book-source";
import styles from "./passport-mission-book.module.css";

/** Policy slot action (mission_book.pages[0].slots[].action) → label key and the existing ink-v1 art file (no art is invented for kinds without one). */
export const SLOT: Record<string, { label: DukjilCopyKey; task: DukjilCopyKey; art: string; frame: "round" | "square" }> = {
  quiz: { label: "dukjilReview", task: "missionTaskQuiz", ...MISSION_STAMP.quiz },
  checkin: { label: "dukjilTileAttendance", task: "missionTaskCheckin", ...MISSION_STAMP.checkin },
  post: { label: "dukjilTilePost", task: "missionTaskPost", ...MISSION_STAMP.post },
  comment: { label: "dukjilTileComment", task: "missionTaskComment", ...MISSION_STAMP.comment },
  share: { label: "dukjilTileShare", task: "missionTaskShare", ...MISSION_STAMP.share },
  invite: { label: "dukjilTileInvite", task: "missionTaskInvite", ...MISSION_STAMP.invite },
  subscription: { label: "missionSlotSubscription", task: "missionTaskSubscription", ...MISSION_STAMP.subscription },
  steady_checkin: { label: "missionSlotSteady", task: "missionTaskSteadyPlain", ...MISSION_STAMP.steady_checkin },
  proof: { label: "dukjilTileProof", task: "missionTaskProof", ...MISSION_STAMP.proof, art: "membership" },
};

const withLocale = (path: string, locale: AppLocale) => `${path}?locale=${locale}` as Route;
const parseRoadmap = (value: unknown) => passportRoadmapSchema.parse(value);
const ONBOARDING_KEY = "kyaa:passport:mission-onboarding:v1";
const ONBOARDING_ROWS = 3;

/** 그 미션을 바로 할 수 있는 곳. 값 없는 칸(옛 스탬프 쌓기)은 링크가 없다. */
export function missionHref(kind: string | null | undefined, slug: string, passportId: string, locale: AppLocale): string | null {
  const creator = encodeURIComponent(slug);
  switch (kind) {
    case "quiz": return `/c/${creator}/verify?locale=${locale}`;
    case "checkin":
    case "steady_checkin": return `/my/wallet?view=attendance&locale=${locale}`;
    case "post": return `/${creator}?tab=board&source=fans&compose=1&locale=${locale}`;
    case "comment": return `/${creator}?tab=board&source=fans&locale=${locale}`;
    case "share": return `/passports/${encodeURIComponent(passportId)}?locale=${locale}#community-stamps`;
    case "invite": return `/my/invitations?locale=${locale}`;
    case "subscription":
    case "proof": return `/c/${creator}/certifications?locale=${locale}`;
    default: return null;
  }
}

const slotDate = (value: string, locale: AppLocale) => new Intl.DateTimeFormat(locale, { calendar: "gregory", timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(value));

function Slot({ slot, locale, stampSrc, href }: { slot: PassportRoadmapSlot; locale: AppLocale; stampSrc?: string; href?: string | null }) {
  const dukjil = useDukjil();
  const meta = slot.kind ? SLOT[slot.kind] : undefined;
  const number = String(slot.slotNo);
  const label = meta ? dukjilText(locale, meta.label) : number;
  const filled = slot.state === "filled";
  const model = dukjil?.catalog && slot.kind === "steady_checkin" ? buildGuideModel(dukjil.catalog) : null;
  const days = model?.slots.find(item => item.action === "steady_checkin")?.days ?? null;
  const task = !meta ? null : slot.kind === "quiz" ? passportBookText(locale, "entryReviewTask") : days ? dukjilText(locale, "missionTaskSteady", [days]) : dukjilText(locale, meta.task);
  const rule = slot.kind ? dukjil?.catalog?.rules[slot.kind] as { points?: unknown } | undefined : undefined;
  // 받지 않은 칸은 틀 모양 점선만 그린다. 회색 스탬프를 늘어놓지 않는다.
  const src = !filled ? undefined : meta ? `/images/stamps/ink-v1/${meta.art}.webp` : stampSrc;
  // A slot that fills while the page is open gets the stamp press once; a slot already filled on arrival stays still.
  const before = useRef(filled);
  const [pressing, setPressing] = useState(false);
  useEffect(() => { if (filled && !before.current) setPressing(true); before.current = filled; }, [filled]);
  const text = <>
    {meta ? <span className={styles.slotLabel} aria-hidden={href ? undefined : "true"} data-wrap-anywhere>{label}</span> : null}
    {task && <span className={styles.slotTask} data-slot-task>{task}</span>}
  </>;
  // Read-only checkbox semantics: the screen reader says filled or empty in the reader's own language. The link beside it stretches over the whole card.
  return <li className={styles.slot} data-state={slot.state} data-kind={slot.kind} data-frame={meta?.frame ?? "round"} style={{ "--stamp-tilt": `${(slot.slotNo % 5 - 2) * 3}deg` } as CSSProperties}>
    {meta ? <span className={styles.number} aria-hidden="true">{number.padStart(2, "0")}</span> : null}
    {slot.kind === "quiz" ? <span className={styles.help}><FanHelpTip label={passportBookText(locale, "entryReviewHelpLabel")} title={label} closeLabel={passportBookText(locale, "helpClose")}>{passportBookText(locale, "entryReviewHelp")}</FanHelpTip></span> : null}
    <span className={styles.art} role="checkbox" aria-checked={filled} aria-disabled="true" aria-label={label}>
      {src ? <img src={src} alt="" width={88} height={88} loading="lazy" /> : !filled && !meta ? <span className={styles.emptyNumber} aria-hidden="true">{number}</span> : null}
      {filled ? <span className={styles.check}><Check aria-hidden="true" size={12} strokeWidth={3} /></span> : null}
      {pressing && <StampPress state="press" size={64} className={styles.pressed} onDone={() => setPressing(false)} />}
    </span>
    {href ? <Link className={styles.slotLink} href={href as Route}>{text}</Link> : text}
    {filled && slot.clearedAt ? <time className={styles.slotDate} dateTime={slot.clearedAt}>{slotDate(slot.clearedAt, locale)}</time> : null}
    {meta && typeof rule?.points === "number" && rule.points > 0 && <EarnBadge variant="inline" locale={locale} points={rule.points} />}
  </li>;
}

/** 처음 온 사람에게 한 번: 지금 할 수 있는 미션 세 개를 행으로 보여 주고, 누르면 그 자리로 간다. 기기별 편의값이라 저장에 실패해도 화면은 그대로다. */
function MissionOnboarding({ page, locale, hrefFor }: { page: PassportRoadmapPage; locale: AppLocale; hrefFor: (kind: string | null | undefined) => string | null }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const rows = page.slots.filter(slot => slot.state !== "filled" && slot.kind && SLOT[slot.kind] && hrefFor(slot.kind)).slice(0, ONBOARDING_ROWS);
  const available = rows.length > 0;
  useEffect(() => {
    if (!available) return;
    try { if (localStorage.getItem(ONBOARDING_KEY)) return; } catch { /* 저장소가 없으면 띄우지 않는다. */ return; }
    setOpen(true);
  }, [available]);
  const close = () => { setOpen(false); try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch { /* 다시 떠도 무방하다. */ } };
  if (!open) return null;
  return <Dialog open onClose={close} labelledBy={titleId} closeOnBackdrop backdropClassName={styles.onboardingBackdrop} contentClassName={styles.onboarding}>
    <FanHeading as="h2" id={titleId}>{passportBookText(locale, "missionOnboardTitle")}</FanHeading>
    <ul className={styles.onboardingRows}>{rows.map(slot => { const meta = SLOT[slot.kind!]!; return <li key={slot.slotNo}>
      <Link href={hrefFor(slot.kind) as Route} onClick={close}>
        <img src={`/images/stamps/ink-v1/${meta.art}.webp`} alt="" width={40} height={40} />
        <strong>{dukjilText(locale, meta.label)}</strong>
        <ChevronRight aria-hidden="true" size={18} />
      </Link>
    </li>; })}</ul>
    <FanAction variant="neutral" onClick={close}>{passportBookText(locale, "missionOnboardConfirm")}</FanAction>
  </Dialog>;
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

/** The page to open on, here and wherever a passport's stamp count shows: one ready to claim, then the first still filling, then the last. */
export const openingPage = (pages: readonly PassportRoadmapPage[]) => {
  const ready = pages.findIndex(page => page.claimable && !page.claimed);
  if (ready >= 0) return ready;
  const filling = pages.findIndex(page => page.filled < page.slots.length);
  return filling >= 0 ? filling : Math.max(0, pages.length - 1);
};

function Page({ page, locale, busy, failed, onClaim, proofHref, pager, stampSrc, hrefFor }: { page: PassportRoadmapPage; locale: AppLocale; busy: boolean; failed: boolean; onClaim: () => void; proofHref: string; pager: ReactNode; stampSrc?: (stampId: string) => string | undefined; hrefFor: (kind: string | null | undefined) => string | null }) {
  const locked = page.locked && !page.claimed;
  return <section className={styles.page} aria-labelledby={`mission-page-${page.pageNo}`} data-claimed={page.claimed} data-locked={locked}>
    <header className={styles.pageHead}>
      <h3 id={`mission-page-${page.pageNo}`}>{dukjilText(locale, "missionPage", [page.pageNo])}</h3>
      <span id={`mission-page-${page.pageNo}-count`} className={styles.count}>{page.filled}/{page.slots.length}</span>
      {pager}
    </header>
    <ol className={styles.slots}>{page.slots.map(slot => <Slot key={slot.slotNo} slot={slot} locale={locale} stampSrc={slot.stampId ? stampSrc?.(slot.stampId) : undefined} href={locked || slot.state === "filled" ? null : hrefFor(slot.kind)} />)}</ol>
    {page.claimed ? <p className={styles.claimed}><Heart aria-hidden="true" size={18} />{dukjilText(locale, "missionClaimed")}</p>
      : locked ? <FanAction className={styles.lockedAction} variant="neutral" href={proofHref}>{dukjilText(locale, "missionLocked")}</FanAction>
      : <FanAction className={styles.claim} variant="primary" disabled={!page.claimable || busy} ariaDescribedBy={page.claimable ? undefined : `mission-page-${page.pageNo}-hint`} onClick={onClaim} leadingIcon={<Heart size={18} />}>{dukjilText(locale, "missionClaim")}</FanAction>}
    {/* K8: every page keeps the hint line, hidden where it does not apply, so turning 1/2 → 2/2 (locked, claimed) never changes the page height. */}
    {!page.claimed && !locked && !page.claimable ? <p id={`mission-page-${page.pageNo}-hint`} className={styles.hint}>{dukjilText(locale, "missionClaimHint", [page.slots.length])}</p>
      : <p className={styles.hint} data-hint-placeholder="" aria-hidden="true">{dukjilText(locale, "missionClaimHint", [page.slots.length])}</p>}
    {failed ? <p className={styles.error} role="alert">{dukjilText(locale, "missionClaimFailed")}</p> : null}
  </section>;
}

/** Mission book of one passport: 9 stamp slots per page, one heart per completed page, page 2+ locked until the 찐팬 title. Rendered only while the dukjil policy is active. */
export function PassportMissionBook({ passportId, creatorSlug, locale, stampSrc }: { passportId: string; creatorSlug: string; locale: AppLocale; stampSrc?: (stampId: string) => string | undefined }) {
  const dukjil = useDukjil();
  const on = dukjil?.status === "on";
  const roadmap = useGroupResource(on ? `/api/me/passports/${encodeURIComponent(passportId)}/roadmap` : null, parseRoadmap);
  const { request } = useGroupRequest();
  const session = useByUsSession(), auth = useByUsAuth(), ownerId = session.ownerId ?? auth.user?.id;
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
      // A claimed page is a heart: the header ♥N and 덕질 read hearts from the summary, which re-reads on this signal (C1).
      notifyFanActivityUpdated(ownerId, ["summary", "passports"]);
    } catch (error) {
      if (error instanceof GroupRequestError && error.status === 409) keys.current.delete(pageNo);
      else setFailedPage(pageNo);
    } finally { setBusy(null); retry(); }
  }, [ownerId, passportId, request, retry]);
  const pagesRef = useSteadyPageHeight(`${roadmap.loading}:${picked ?? ""}:${roadmap.data?.pages.length ?? 0}`);
  if (!on) return null;
  const proofHref = withLocale(`/c/${encodeURIComponent(creatorSlug)}/certifications`, locale);
  const pages = roadmap.data?.pages ?? [];
  const index = Math.min(picked ?? openingPage(pages), Math.max(0, pages.length - 1));
  const page = pages[index];
  const hrefFor = (kind: string | null | undefined) => missionHref(kind, creatorSlug, passportId, locale);
  return <section id="mission-book" className={`${paper.palette} ${styles.book}`} aria-labelledby="mission-book-title" aria-busy={roadmap.loading}>
    <div className={styles.head}>
      <h2 id="mission-book-title">{dukjilText(locale, "missionBookTitle")}</h2>
      {roadmap.data ? <span className={styles.hearts}><Heart aria-hidden="true" size={18} />{dukjilText(locale, "missionHearts", [roadmap.data.hearts])}</span> : null}
    </div>
    {roadmap.loading ? <div className={styles.skeleton} aria-hidden="true"><i /><i /></div>
      : roadmap.error || !roadmap.data ? <div className={styles.errorBox} role="alert"><p>{dukjilText(locale, "missionLoadError")}</p><FanAction variant="neutral" onClick={retry}>{dukjilText(locale, "missionRetry")}</FanAction></div>
      : page ? <div ref={pagesRef} className={styles.pages}><Page key={page.pageNo} page={page} locale={locale} busy={busy === page.pageNo} failed={failedPage === page.pageNo} onClaim={() => void claim(page.pageNo)} proofHref={proofHref} stampSrc={stampSrc} hrefFor={hrefFor} pager={<Pager index={index} total={pages.length} locale={locale} onChange={setPicked} />} /><MissionOnboarding page={page} locale={locale} hrefFor={hrefFor} /></div> : null}
  </section>;
}

/** K8: turning 1/2 → 2/2 must not make the book jump. The page area keeps the tallest page height seen at this width
 * (the first page is measured on arrival), so a shorter page leaves its space instead of pulling the book up. A width change measures again. */
export function useSteadyPageHeight(page: unknown) {
  const ref = useRef<HTMLDivElement | null>(null), tallest = useRef({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      const width = box.clientWidth;
      if (width !== tallest.current.width) { tallest.current = { width, height: 0 }; box.style.minHeight = ""; }
      const content = box.firstElementChild instanceof HTMLElement ? box.firstElementChild.offsetHeight : box.offsetHeight;
      if (content > tallest.current.height) { tallest.current.height = content; box.style.minHeight = `${content}px`; }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => observer.disconnect();
  }, [page]);
  return ref;
}

const STACK = 9;
/** While the dukjil policy is off the book only stacks earned stamps, nine a page, and offers no claim. */
export function StackedStampPages({ stamps, locale }: { stamps: readonly { id: string; src: string }[]; locale: AppLocale }) {
  const total = Math.max(1, Math.ceil(stamps.length / STACK));
  const [picked, setPicked] = useState<number | null>(null);
  const index = Math.min(picked ?? (stamps.length && stamps.length % STACK === 0 ? total - 1 : Math.floor(stamps.length / STACK)), total - 1);
  const onPage = stamps.slice(index * STACK, (index + 1) * STACK);
  const pagesRef = useSteadyPageHeight(index);
  return <section id="mission-book" className={`${paper.palette} ${styles.book}`}>
    <div ref={pagesRef} className={styles.pages}><section className={styles.page}>
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
      <ol className={styles.slots}>{model.slots.map(slot => <Slot key={slot.slot} locale={locale} href={fanLoginHref(locale, `/passports?locale=${locale}`)} slot={{ slotNo: slot.slot, kind: slot.action, state: "empty", stampId: null, clearedAt: null }} />)}</ol>
    </section></div>
  </section>;
}
