'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Check, Share2, Ticket } from '@/components/fan-ui/fan-icons';
import { FanIcon } from '@/components/fan-ui/fan-icon';
import { FanDisplay } from '@/components/fan-ui/fan-display';
import { FanPrintTicket } from '@/components/fan-ui/fan-print';
import type { AppLocale } from '@/i18n/locales';
import { signupRaffleText } from '@/i18n/catalogs/signup-raffle';
import { raffleLongformText, type SignupRaffleLongformKey } from '@/i18n/catalogs/signup-raffle-longform';
import { signupEvent } from '@/features/benefit/domain/signup-event';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { FanAction, FanActionStatus } from '@/components/fan-ui/fan-action';
import styles from './raffle.module.css';

/** 개발 서버에서 로그인 없이 상태별 화면을 보기 위한 표시 전용 값(서버 규칙·API와 무관). */
export type RafflePreview = 'in' | 'entered' | 'passport' | 'done' | 'error' | undefined;

type Ctx = {
  locale: AppLocale; closed: boolean; ready: boolean; signedIn: boolean; pending: boolean; entered: boolean;
  passport: boolean; community: boolean; error: boolean;
  enter: () => void; t: (key: SignupRaffleLongformKey, count?: number) => string; s: (key: Parameters<typeof signupRaffleText>[1]) => string;
};
const RaffleContext = createContext<Ctx | null>(null);
function useRaffle() { const value = useContext(RaffleContext); if (!value) throw new Error('RaffleProvider missing'); return value; }

export function RaffleProvider({ locale, closed, preview, children }: { locale: AppLocale; closed: boolean; preview?: RafflePreview; children: ReactNode }) {
  const auth = useByUsAuth();
  const [pending, setPending] = useState(false);
  const [entered, setEntered] = useState(false), [passport, setPassport] = useState(false), [community, setCommunity] = useState(false), [error, setError] = useState(false);
  const p = preview;
  const view = {
    signedIn: auth.authenticated || !!p,
    entered: entered || p === 'entered' || p === 'passport' || p === 'done',
    passport: passport || p === 'passport' || p === 'done',
    community: community || p === 'done',
    error: error || p === 'error',
  };
  async function enter() {
    if (closed) return;
    if (!auth.authenticated) { auth.login(); return; }
    setPending(true); setError(false);
    try {
      const token = await auth.getAccessToken(); if (!token) throw new Error('auth');
      const response = await fetch('/api/signup-event/entry', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('entry');
      const result = await response.json();
      setEntered(true); setPassport(!!result.passportReceived); setCommunity(!!result.communityJoined);
    } catch { setError(true); }
    finally { setPending(false); }
  }
  const value: Ctx = { locale, closed, ready: auth.ready || !!p, pending, ...view, enter, t: (key, count) => raffleLongformText(locale, key, count), s: (key) => signupRaffleText(locale, key) };
  return <RaffleContext.Provider value={value}>{children}</RaffleContext.Provider>;
}

const passportHref = (locale: AppLocale) => `/passports?locale=${locale}`;
const communityHref = (locale: AppLocale) => `/pages/groups?locale=${locale}`;
/** 응모권에 찍는 인쇄 문구(언어와 상관없이 같은 글자). */
const ticketPrint = { title: 'KYAA RAFFLE', deadlineLabel: 'CLOSES', deadline: '2026.11.30 23:59 KST', serial: 'No. SAMPLE' } as const;

/** 히어로 응모권. 응모하면 그 자리에서 도장이 찍힌다. */
export function RaffleTicket({ className }: { className?: string }) {
  const r = useRaffle();
  return <FanPrintTicket className={className} title={ticketPrint.title} amount="US$400" prize={r.t('giftCard')} winners={r.t('totalWinners')} deadlineLabel={ticketPrint.deadlineLabel} deadline={ticketPrint.deadline} serial={ticketPrint.serial} stub={r.t('flowOnce')} stamp={r.entered ? r.t('entered') : undefined} />;
}

/** 응모 버튼: 페이지에서 유일한 분홍 면(primary 1개). 히어로와 모바일 하단 고정 줄이 같은 버튼을 쓴다. 요청 중에는 공통 loading.
 * 응모 뒤에는 누를 수 없는 버튼(비활성 .4, 흰 글자 1.99:1)이 아니라 공통 `FanActionStatus`: 흰 면·잉크 글자·완료 체크(`--color-success`)를 같은 자리·같은 크기로. */
function RaffleEnterAction() {
  const r = useRaffle();
  if (r.entered) return <FanActionStatus leadingIcon={<FanIcon icon={Check} className={styles.doneCheck} />}>{r.t('entered')}</FanActionStatus>;
  return <FanAction type="button" variant="primary" fullWidth loading={r.pending} disabled={!r.ready} onClick={r.enter}>{r.t('enterCta')}</FanAction>;
}

/** 히어로 행동 칸: 응모 버튼 + 그 아래 한 줄(응모 전 규칙, 응모 뒤 확정된 내 응모 수, 실패하면 오류와 다시 시도). */
export function RaffleHeroAction() {
  const r = useRaffle();
  if (r.closed) return <FanDisplay role="strong" as="p" className={styles.heroEnded}>{r.t('ended')}</FanDisplay>;
  return <>
    <RaffleEnterAction />
    {r.error ? <p className={styles.heroError} role="alert"><FanDisplay role="caption">{r.s('error')}</FanDisplay><FanAction type="button" variant="text" size="sm" onClick={r.enter}>{r.t('retry')}</FanAction></p> : null}
    {/* 댓글·출석으로 늘어난 기회는 이 줄에 섞지 않는다(서버 값이 아직 화면에 없음). */}
    {r.entered
      ? <p className={styles.heroStatus} data-state="entered" role="status"><FanIcon icon={Ticket} size={16} /><FanDisplay role="caption">{r.t('myEntry')}</FanDisplay></p>
      : <p className={styles.heroStatus}><FanDisplay role="caption">{r.t('flowOnce')}</FanDisplay></p>}
  </>;
}

const DoneMark = ({ label }: { label: string }) => <FanDisplay role="caption" as="p" className={styles.doneMark}><FanIcon icon={Check} size={16} className={styles.doneCheck} />{label}</FanDisplay>;

/** 확률 올리기: 행마다 그 행동으로 가는 버튼 하나. */
export function RaffleBoostAction({ kind }: { kind: 'comment' | 'attend' }) {
  const r = useRaffle();
  if (r.closed) return null;
  return kind === 'attend'
    ? <FanAction href={communityHref(r.locale)} variant="neutral" size="sm">{r.t('checkIn')}</FanAction>
    : <FanAction href={`/?locale=${r.locale}`} variant="neutral" size="sm">{r.t('findPosts')}</FanAction>;
}

/** 더 즐기기(선택): Fan Passport · 커뮤니티. 끝냈으면 '완료' 표시. */
export function RaffleMoreAction({ kind }: { kind: 'passport' | 'community' }) {
  const r = useRaffle();
  if (kind === 'passport' ? r.passport : r.community) return <DoneMark label={r.t('done')} />;
  return kind === 'passport'
    ? <FanAction href={passportHref(r.locale)} variant="neutral" size="sm">{r.s('passport')}</FanAction>
    : <FanAction href={communityHref(r.locale)} variant="neutral" size="sm">{r.s('community')}</FanAction>;
}

/** 모바일 하단 고정 버튼: 응모 전에는 응모(primary), 응모 뒤에는 출석(neutral). 마감 후에는 숨긴다. */
export function RaffleStickyCta() {
  const r = useRaffle();
  // 히어로의 같은 응모 버튼이 화면에 보이는 동안에는 숨겨 분홍 버튼이 두 개 겹쳐 보이지 않게 한다.
  const [heroInView, setHeroInView] = useState(true);
  useEffect(() => {
    const target = document.querySelector('[data-raffle-hero-action]');
    if (!target || typeof IntersectionObserver === 'undefined') { setHeroInView(false); return; }
    const observer = new IntersectionObserver(([entry]) => setHeroInView(entry.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  if (r.closed) return null;
  const hidden = heroInView;
  return <div className={styles.sticky} data-hidden={hidden} aria-hidden={hidden || undefined} inert={hidden || undefined}>{r.entered
    ? <FanAction href={communityHref(r.locale)} variant="neutral" fullWidth>{r.t('checkIn')}</FanAction>
    : <RaffleEnterAction />}</div>;
}

export function RaffleShare() {
  const r = useRaffle();
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${location.origin}${signupEvent.href}?utm_source=share&utm_medium=social&utm_campaign=${signupEvent.id}&utm_content=content.share`;
    try {
      if (navigator.share) { await navigator.share({ title: r.s('title'), url }); return; }
      await navigator.clipboard.writeText(url); setCopied(true);
    } catch { /* 공유 취소 */ }
  }
  // 아이콘은 FanAction 의 leadingIcon 자리(간격 8·세로 가운데는 공통 버튼 몫). 제목 줄 오른쪽 작은 행동이라 text 변형: 흰 바탕에서 1.36:1이던 선 테두리를 없애고 잉크 글자(17:1)로만 식별한다(v4.3).
  return <FanAction type="button" variant="text" size="sm" leadingIcon={<FanIcon icon={Share2} />} onClick={share}>{copied ? r.t('copied') : r.t('share')}</FanAction>;
}
