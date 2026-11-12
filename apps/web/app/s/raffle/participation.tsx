'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Check, Share2 } from '@/components/fan-ui/fan-icons';
import { FanIcon } from '@/components/fan-ui/fan-icon';
import { FanHeading } from '@/components/fan-ui/fan-heading';
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
  passport: boolean; community: boolean; error: boolean; done: number;
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
  const done = (view.entered ? 1 : 0) + (view.passport ? 1 : 0) + (view.community ? 1 : 0);
  const value: Ctx = { locale, closed, ready: auth.ready || !!p, pending, ...view, done, enter, t: (key, count) => raffleLongformText(locale, key, count), s: (key) => signupRaffleText(locale, key) };
  return <RaffleContext.Provider value={value}>{children}</RaffleContext.Provider>;
}

const emphasis = 'primary' as const;
const passportHref = (locale: AppLocale) => `/passports?locale=${locale}`;
const communityHref = (locale: AppLocale) => `/pages/groups?locale=${locale}`;

/** 히어로 분홍 면 위 흰 알약 버튼. */
export function RaffleHeroAction() {
  const r = useRaffle();
  if (r.closed) return <p className={styles.heroEnded}>{r.t('ended')}</p>;
  return <>
    <FanAction type="button" variant={emphasis} className={styles.heroButton} disabled={!r.ready || r.pending || r.entered} onClick={r.enter}>
      {r.entered ? <><FanIcon icon={Check} />{r.t('entered')}</> : r.s('enter')}
    </FanAction>
    {r.error ? <p className={styles.heroError} role="alert">{r.s('error')} <FanAction type="button" variant="text" className={styles.retry} onClick={r.enter}>{r.t('retry')}</FanAction></p> : null}
  </>;
}

/** 내 참여 현황(로그인 회원). */
export function RaffleStatus() {
  const r = useRaffle();
  if (!r.signedIn) return null;
  const rows = [
    { key: 'enter', label: r.t('entered'), ok: r.entered, href: undefined as string | undefined, action: r.s('enter') },
    { key: 'passport', label: 'Fan Passport', ok: r.passport, href: passportHref(r.locale), action: r.s('passport') },
    { key: 'community', label: r.t('communityTitle'), ok: r.community, href: communityHref(r.locale), action: r.s('community') },
  ];
  const finished = r.done === 3;
  return <section className={styles.status} aria-labelledby="raffle-status-title" data-state={finished ? 'done' : 'progress'}>
    <div className={styles.cardTitle}><FanHeading as="h2" id="raffle-status-title">{r.t('myStatus')}</FanHeading></div>
    <p className={styles.statusCount} aria-live="polite"><span className={styles.statusBig}>{r.done}</span><span className={styles.statusOf}>/3</span><span className={styles.statusText}>{r.t('progress', r.done)}</span></p>
    <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={r.done}>{[0, 1, 2].map(i => <i key={i} data-on={i < r.done} />)}</div>
    {finished ? <>
      <p className={styles.celebrate}>{r.t('celebrate')}</p>
      <div className={styles.statusActions}>
        <FanAction href={communityHref(r.locale)} variant={emphasis}>{r.t('checkIn')}</FanAction>
        <FanAction href={`/?locale=${r.locale}`} variant="neutral">{r.t('findPosts')}</FanAction>
      </div>
    </> : <ul className={styles.checks}>{rows.map(row => <li key={row.key} data-row="raffle-check" data-ok={row.ok}>
      <span className={styles.checkDot} aria-hidden>{row.ok ? <FanIcon icon={Check} size={16} /> : null}</span>
      <span className={styles.checkLabel}>{row.label}</span>
      {row.ok || !row.href ? <span className={styles.checkState}>{row.ok ? r.t('done') : r.t('todo')}</span> : <FanAction href={row.href} variant="neutral" size="sm">{row.action}</FanAction>}
    </li>)}</ul>}
  </section>;
}

/** 각 단계 섹션의 알약 버튼. */
export function RaffleStepAction({ step }: { step: 1 | 2 | 3 }) {
  const r = useRaffle();
  if (r.closed) return null;
  if (step === 1) return <FanAction variant={emphasis} type="button" disabled={!r.ready || r.pending || r.entered} onClick={r.enter}>{r.entered ? r.t('entered') : r.s('enter')}</FanAction>;
  if (step === 2) return <FanAction href={passportHref(r.locale)} variant={r.passport ? 'neutral' : emphasis}>{r.s('passport')}</FanAction>;
  return <FanAction href={communityHref(r.locale)} variant={r.community ? 'neutral' : emphasis}>{r.s('community')}</FanAction>;
}

/** 모바일 하단 고정 버튼: 상태에 맞는 다음 행동 하나. 마감 후에는 숨긴다. */
export function RaffleStickyCta() {
  const r = useRaffle();
  if (r.closed) return null;
  const next = !r.entered ? { label: r.s('enter'), run: r.enter } : !r.passport ? { label: r.s('passport'), href: passportHref(r.locale) } : !r.community ? { label: r.s('community'), href: communityHref(r.locale) } : { label: r.t('checkIn'), href: communityHref(r.locale) };
  return <div className={styles.sticky}>{'href' in next
    ? <FanAction href={next.href} variant={emphasis} fullWidth>{next.label}</FanAction>
    : <FanAction type="button" variant={emphasis} fullWidth disabled={!r.ready || r.pending} onClick={next.run}>{next.label}</FanAction>}</div>;
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
