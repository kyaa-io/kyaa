'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Check, Share2 } from '@/components/fan-ui/fan-icons';
import { FanIcon } from '@/components/fan-ui/fan-icon';
import { FanDisplay } from '@/components/fan-ui/fan-display';
import { FanPrintTicket } from '@/components/fan-ui/fan-print';
import type { AppLocale } from '@/i18n/locales';
import { signupRaffleText } from '@/i18n/catalogs/signup-raffle';
import { raffleLongformText, type SignupRaffleLongformKey } from '@/i18n/catalogs/signup-raffle-longform';
import { signupEvent } from '@/features/benefit/domain/signup-event';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { FanAction } from '@/components/fan-ui/fan-action';
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

const emphasis = 'primary' as const;
const passportHref = (locale: AppLocale) => `/passports?locale=${locale}`;
const communityHref = (locale: AppLocale) => `/pages/groups?locale=${locale}`;
/** 응모권에 찍는 인쇄 문구(언어와 상관없이 같은 글자). */
const ticketPrint = { title: 'KYAA RAFFLE', deadlineLabel: 'CLOSES', deadline: '2026.11.30 23:59 KST', serial: 'No. SAMPLE' } as const;

/** 히어로 응모권. 응모하면 그 자리에서 도장이 찍힌다. */
export function RaffleTicket({ className }: { className?: string }) {
  const r = useRaffle();
  return <FanPrintTicket className={className} title={ticketPrint.title} amount="US$400" prize={r.t('giftCard')} winners={r.t('totalWinners')} deadlineLabel={ticketPrint.deadlineLabel} deadline={ticketPrint.deadline} serial={ticketPrint.serial} stub={r.t('flowOnce')} stamp={r.entered ? r.t('entered') : undefined} />;
}

/** 히어로 응모 버튼: 페이지에서 유일한 분홍 면. */
export function RaffleHeroAction() {
  const r = useRaffle();
  if (r.closed) return <FanDisplay role="strong" as="p" className={styles.heroEnded}>{r.t('ended')}</FanDisplay>;
  return <>
    <FanAction type="button" variant={emphasis} className={r.entered ? `${styles.heroButton} ${styles.heroDone}` : styles.heroButton} disabled={!r.ready || r.pending || r.entered} onClick={r.enter}>
      {r.entered ? <><FanIcon icon={Check} />{r.t('entered')}</> : r.t('enterCta')}
    </FanAction>
    {r.error ? <p className={styles.heroError} role="alert"><FanDisplay role="caption">{r.s('error')}</FanDisplay> <FanAction type="button" variant="text" className={styles.retry} onClick={r.enter}>{r.t('retry')}</FanAction></p> : null}
  </>;
}

const DoneMark = ({ label }: { label: string }) => <FanDisplay role="strong" as="p" className={styles.doneMark}><FanIcon icon={Check} size={16} />{label}</FanDisplay>;

/** 확률 올리기: 출석·댓글로 가는 두 버튼. */
export function RaffleBoostActions() {
  const r = useRaffle();
  if (r.closed) return null;
  return <>
    <FanAction href={communityHref(r.locale)} variant="neutral">{r.t('checkIn')}</FanAction>
    <FanAction href={`/?locale=${r.locale}`} variant="neutral">{r.t('findPosts')}</FanAction>
  </>;
}

/** 더 즐기기(선택): Fan Passport · 커뮤니티. 끝냈으면 '완료' 표시. */
export function RaffleMoreAction({ kind }: { kind: 'passport' | 'community' }) {
  const r = useRaffle();
  if (kind === 'passport' ? r.passport : r.community) return <DoneMark label={r.t('done')} />;
  return kind === 'passport'
    ? <FanAction href={passportHref(r.locale)} variant="neutral" size="sm">{r.s('passport')}</FanAction>
    : <FanAction href={communityHref(r.locale)} variant="neutral" size="sm">{r.s('community')}</FanAction>;
}

/** 모바일 하단 고정 버튼: 응모 전에는 응모, 응모 뒤에는 출석. 마감 후에는 숨긴다. */
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
    ? <FanAction href={communityHref(r.locale)} variant={emphasis} fullWidth>{r.t('checkIn')}</FanAction>
    : <FanAction type="button" variant={emphasis} fullWidth disabled={!r.ready || r.pending} onClick={r.enter}>{r.t('enterCta')}</FanAction>}</div>;
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
  return <FanAction type="button" variant="neutral" onClick={share}><FanIcon icon={Share2} />{copied ? r.t('copied') : r.t('share')}</FanAction>;
}
