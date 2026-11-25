"use client";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import paper from "@/components/fan-ui/passport-paper.module.css";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSheetTrigger } from "@/components/fan-ui/fan-sheet-trigger";
import { fanLoginHref } from "@/components/login-href";
import { Dialog } from "@/components/ui/overlay/accessible-overlay";
import { dukjilText, type DukjilCopyKey } from "@/features/dukjil/ui/dukjil-copy";
import { useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { EarnBadge, EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import { StampPress } from "@/features/dukjil/ui/stamp-press";
import { useGroupResource } from "@/features/groups/ui/use-group-resource";
import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";
import { buildGuideModel } from "@/features/dukjil-guide/domain/guide-model";
import { passportRoadmapSchema, type PassportRoadmapPage, type PassportRoadmapSlot } from "../domain/dukjil-types";
import { SNS_POST_PROOF, proofMissionListSchema, type ProofMissionList } from "../domain/proof-types";
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
  proof: { label: "missionSlotProof", task: "missionTaskProof", ...MISSION_STAMP.proof, art: "membership" },
};

const withLocale = (path: string, locale: AppLocale) => `${path}?locale=${locale}` as Route;
const parseRoadmap = (value: unknown) => passportRoadmapSchema.parse(value);
const parseProofMissions = (value: unknown) => proofMissionListSchema.parse(value);

/** 07·09 칸은 그 크리에이터에게 받을 인증 항목이 있을 때만 제출 화면으로 보낸다. 목록을 아직 못 읽었으면 링크를 둔다. */
export function proofSlotOpen(kind: string | null | undefined, missions: ProofMissionList | undefined): boolean {
  if (!missions || (kind !== "subscription" && kind !== "proof")) return true;
  return missions.items.some(item => (item.proofType === SNS_POST_PROOF) === (kind === "subscription"));
}
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
    // 07: SNS 게시 캡처 인증, 09: 증빙(멤버십·영수증 등). 둘 다 같은 증빙 화면에서 제출하고 운영자가 심사한다(BUGS-261110 B1·B6).
    case "subscription": return `/c/${creator}/proofs?type=sns_post&locale=${locale}`;
    case "proof": return `/c/${creator}/proofs?locale=${locale}`;
    default: return null;
  }
}

const slotDate = (value: string, locale: AppLocale) => new Intl.DateTimeFormat(locale, { calendar: "gregory", timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(value));

/** `sheet`가 있으면 칸을 누를 때 설명 창(좁은 화면 바닥 시트, 1024+ 가운데 모달)이 열리고, 그 안 버튼이 미션 화면으로 간다. 없으면(비로그인) 칸 전체가 `href` 링크다. */
function Slot({ slot, locale, stampSrc, href, sheet = false }: { slot: PassportRoadmapSlot; locale: AppLocale; stampSrc?: string; href?: string | null; sheet?: boolean }) {
  const dukjil = useDukjil();
  const meta = slot.kind ? SLOT[slot.kind] : undefined;
  const number = String(slot.slotNo);
  const label = meta ? dukjilText(locale, meta.label) : number;
  const filled = slot.state === "filled";
  const model = dukjil?.catalog && slot.kind === "steady_checkin" ? buildGuideModel(dukjil.catalog) : null;
  const days = model?.slots.find(item => item.action === "steady_checkin")?.days ?? null;
  const task = !meta ? null : slot.kind === "quiz" ? passportBookText(locale, "entryReviewHelp") : days ? dukjilText(locale, "missionTaskSteady", [days]) : dukjilText(locale, meta.task);
  const rule = slot.kind ? dukjil?.catalog?.rules[slot.kind] as { points?: unknown } | undefined : undefined;
  const points = typeof rule?.points === "number" && rule.points > 0 ? rule.points : null;
  // 받지 않은 칸은 받은 칸과 같은 그림을 흐린 회색으로 놓는다(ghost-v1). 그림이 없는 옛 칸은 회색 틀만 놓는다.
  const src = filled ? meta ? `/images/stamps/ink-v1/${meta.art}.webp` : stampSrc : `/images/stamps/ghost-v1/${meta ? meta.art : "frame"}.webp`;
  // A slot that fills while the page is open gets the stamp press once; a slot already filled on arrival stays still.
  const before = useRef(filled);
  const [pressing, setPressing] = useState(false);
  useEffect(() => { if (filled && !before.current) setPressing(true); before.current = filled; }, [filled]);
  const labelNode = meta ? <span className={styles.slotLabel} aria-hidden={href || sheet ? undefined : "true"} data-wrap-anywhere>{label}</span> : null;
  // Read-only checkbox semantics: the screen reader says filled or empty in the reader's own language. The link or button beside it stretches over the whole card.
  return <li className={styles.slot} data-state={slot.state} data-kind={slot.kind} data-frame={meta?.frame ?? "round"} style={{ "--stamp-tilt": `${(slot.slotNo % 5 - 2) * 3}deg` } as CSSProperties}>
    {meta ? <span className={styles.number} aria-hidden="true">{number.padStart(2, "0")}</span> : null}
    <span className={styles.art} role="checkbox" aria-checked={filled} aria-disabled="true" aria-label={label}>
      {src ? <img src={src} alt="" width={88} height={88} loading="lazy" /> : null}
      {!filled && !meta ? <span className={styles.emptyNumber} aria-hidden="true">{number}</span> : null}
      {filled ? <span className={styles.check}><Check aria-hidden="true" size={12} strokeWidth={3} /></span> : null}
      {pressing && <StampPress state="press" size={64} className={styles.pressed} onDone={() => setPressing(false)} />}
    </span>
    {sheet && meta ? <FanSheetTrigger className={styles.slotLink} trigger={labelNode} title={label} closeLabel={passportBookText(locale, "helpClose")} actionHref={href} actionLabel={passportBookText(locale, "missionGo")} wrapAction={points !== null ? action => <EarnBadgeCorner locale={locale} points={points}>{action}</EarnBadgeCorner> : undefined}>
      <div className={styles.sheetBody}>
        <img className={styles.sheetArt} src={`/images/stamps/ink-v1/${meta.art}.webp`} alt="" width={120} height={120} />
        <p className={styles.sheetTask}>{task}</p>
      </div>
    </FanSheetTrigger>
      : href ? <Link className={styles.slotLink} href={href as Route}>{labelNode}</Link> : labelNode}
    {filled && slot.clearedAt ? <time className={styles.slotDate} dateTime={slot.clearedAt}>{slotDate(slot.clearedAt, locale)}</time> : null}
    {meta && points !== null && <EarnBadge variant="inline" locale={locale} points={points} className={styles.points} />}
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

/** The page to open on, here and wherever a passport's stamp count shows: the first still filling, then the last. */
export const openingPage = (pages: readonly PassportRoadmapPage[]) => {
  const filling = pages.findIndex(page => page.filled < page.slots.length);
  return filling >= 0 ? filling : Math.max(0, pages.length - 1);
};

function Page({ page, locale, proofHref, pager, stampSrc, hrefFor }: { page: PassportRoadmapPage; locale: AppLocale; proofHref: string; pager: ReactNode; stampSrc?: (stampId: string) => string | undefined; hrefFor: (kind: string | null | undefined) => string | null }) {
  const locked = page.locked && !page.claimed;
  return <section className={styles.page} aria-labelledby={`mission-page-${page.pageNo}`} data-claimed={page.claimed} data-locked={locked}>
    <header className={styles.pageHead}>
      <h3 id={`mission-page-${page.pageNo}`}>{dukjilText(locale, "missionPage", [page.pageNo])}</h3>
      <span id={`mission-page-${page.pageNo}-count`} className={styles.count}>{page.filled}/{page.slots.length}</span>
      {pager}
    </header>
    <ol className={styles.slots}>{page.slots.map(slot => <Slot key={slot.slotNo} slot={slot} locale={locale} stampSrc={slot.stampId ? stampSrc?.(slot.stampId) : undefined} href={locked || slot.state === "filled" ? null : hrefFor(slot.kind)} sheet />)}</ol>
    {locked ? <FanAction className={styles.lockedAction} variant="neutral" href={proofHref}>{dukjilText(locale, "missionLocked")}</FanAction> : null}
  </section>;
}

/** Mission book of one passport (K8: every page is drawn in one grid cell, the others hidden and inert, so the book is the tallest page's height
 * from the first paint whichever page it opens on and whichever way it turns): 9 stamp slots per page, page 2+ locked until the 찐팬 title. Rendered only while the dukjil policy is active. */
export function PassportMissionBook({ passportId, creatorSlug, locale, stampSrc }: { passportId: string; creatorSlug: string; locale: AppLocale; stampSrc?: (stampId: string) => string | undefined }) {
  const dukjil = useDukjil();
  const on = dukjil?.status === "on";
  const roadmap = useGroupResource(on ? `/api/me/passports/${encodeURIComponent(passportId)}/roadmap` : null, parseRoadmap);
  const proofMissions = useGroupResource(on ? `/api/me/proofs/missions?creator=${encodeURIComponent(creatorSlug)}` : null, parseProofMissions, { nameLocale: false });
  const [picked, setPicked] = useState<number | null>(null);
  const { retry } = roadmap;
  const bookRef = useRef<HTMLElement>(null), jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !roadmap.data || window.location.hash !== "#mission-book") return;
    const root = bookRef.current;
    if (!root) return;
    jumped.current = true;
    const target: HTMLElement | null = root.querySelector<HTMLElement>("#mission-book-title");
    target?.scrollIntoView?.({ block: "center" });
    target?.focus({ preventScroll: true });
  }, [roadmap.data]);
  if (!on) return null;
  const proofHref = withLocale(`/c/${encodeURIComponent(creatorSlug)}/certifications`, locale);
  const pages = roadmap.data?.pages ?? [];
  const index = Math.min(picked ?? openingPage(pages), Math.max(0, pages.length - 1));
  const page = pages[index];
  const hrefFor = (kind: string | null | undefined) => proofSlotOpen(kind, proofMissions.data) ? missionHref(kind, creatorSlug, passportId, locale) : null;
  return <section ref={bookRef} id="mission-book" className={`${paper.palette} ${styles.book}`} aria-labelledby="mission-book-title" aria-busy={roadmap.loading}>
    <div className={styles.head}>
      <h2 id="mission-book-title" tabIndex={-1}>{dukjilText(locale, "missionBookTitle")}</h2>
    </div>
    {roadmap.loading ? <div className={styles.skeleton} aria-hidden="true"><i /><i /></div>
      : roadmap.error || !roadmap.data ? <div className={styles.errorBox} role="alert"><p>{dukjilText(locale, "missionLoadError")}</p><FanAction variant="neutral" onClick={retry}>{dukjilText(locale, "missionRetry")}</FanAction></div>
      : page ? <div className={styles.pages} data-stacked="">{pages.map((each, i) => <div key={each.pageNo} className={styles.bookPage} data-current={i === index || undefined} inert={i !== index} aria-hidden={i !== index || undefined}>
        <Page page={each} locale={locale} proofHref={proofHref} stampSrc={stampSrc} hrefFor={hrefFor} pager={<Pager index={i} total={pages.length} locale={locale} onChange={setPicked} />} />
      </div>)}<MissionOnboarding page={page} locale={locale} hrefFor={hrefFor} /></div> : null}
  </section>;
}

/** K8 (stacked stamps): turning 1/2 → 2/2 must not make the book jump. The page area keeps the tallest page height seen at this width
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
/** `guide`: the 덕질미션북 guide shows the same page on its paper without the title, three slots a row, and links no slot (members read it too). */
export function GuestMissionBook({ locale, wide = false, guide = false, headingLevel = 2 }: { locale: AppLocale; wide?: boolean; guide?: boolean; headingLevel?: 2 | 3 }) {
  const dukjil = useDukjil();
  const model = dukjil?.status === "on" && dukjil.catalog ? buildGuideModel(dukjil.catalog) : null;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  if (!dukjil) return null;
  if (dukjil.status === "loading") return <section className={styles.book} aria-hidden="true"><div className={styles.skeleton}><i /></div></section>;
  if (!model || model.slots.length === 0) return null;
  let slotHref: string | null = null;
  if (!guide) slotHref = fanLoginHref(locale, `/passports?locale=${locale}`);
  return <section id="mission-book" className={[paper.palette, styles.book, wide ? styles.guestWide : "", guide ? styles.guideBook : ""].join(" ")} aria-labelledby="mission-book-title">
    <div className={styles.head}><Heading id="mission-book-title">{dukjilText(locale, "missionBookTitle")}</Heading></div>
    <div className={styles.pages}><section className={styles.page} data-guest="true" aria-label={dukjilText(locale, "missionPage", [1])}>
      <ol className={styles.slots}>{model.slots.map(slot => <Slot key={slot.slot} locale={locale} href={slotHref} slot={{ slotNo: slot.slot, kind: slot.action, state: "empty", stampId: null, clearedAt: null }} />)}</ol>
    </section></div>
  </section>;
}
