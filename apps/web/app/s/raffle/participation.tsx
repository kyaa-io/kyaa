'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FanPrintStamp } from '@/components/fan-ui/fan-print';
import { Check, Share2, Ticket } from '@/components/fan-ui/fan-icons';
import { FanIcon } from '@/components/fan-ui/fan-icon';
import { FanDisplay } from '@/components/fan-ui/fan-display';
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
  locale: AppLocale; closed: boolean; closesAt: number; now: number; ready: boolean; signedIn: boolean; pending: boolean; entered: boolean;
  passport: boolean; community: boolean; error: boolean;
  enter: () => void; t: (key: SignupRaffleLongformKey, count?: number) => string; s: (key: Parameters<typeof signupRaffleText>[1]) => string;
};
const RaffleContext = createContext<Ctx | null>(null);
function useRaffle() { const value = useContext(RaffleContext); if (!value) throw new Error('RaffleProvider missing'); return value; }

export function RaffleProvider({ locale, closed, closesAt, now, preview, children }: { locale: AppLocale; closed: boolean; closesAt: number; now: number; preview?: RafflePreview; children: ReactNode }) {
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
    // 개발 서버의 ?preview=in: 로그인·API 없이 응모 순간(요청 중 → 완료 → 도장)만 보여 준다. 운영 빌드에는 preview 값이 오지 않는다.
    if (p === 'in') { setPending(true); window.setTimeout(() => { setPending(false); setEntered(true); }, 400); return; }
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
  const value: Ctx = { locale, closed, closesAt, now, ready: auth.ready || !!p, pending, ...view, enter, t: (key, count) => raffleLongformText(locale, key, count), s: (key) => signupRaffleText(locale, key) };
  return <RaffleContext.Provider value={value}>{children}</RaffleContext.Provider>;
}

const passportHref = (locale: AppLocale) => `/passports?locale=${locale}`;
const communityHref = (locale: AppLocale) => `/pages/groups?locale=${locale}`;
/** 응모 버튼: 페이지에서 유일한 분홍 면(primary 1개). 히어로와 모바일 하단 고정 줄이 같은 버튼을 쓴다. 요청 중에는 공통 loading.
 * 응모 뒤에는 누를 수 없는 버튼(비활성 .4, 흰 글자 1.99:1)이 아니라 공통 `FanActionStatus`: 흰 면·잉크 글자·완료 체크(`--color-success`)를 같은 자리·같은 크기로. */
function RaffleEnterAction() {
  const r = useRaffle();
  if (r.entered) return <FanActionStatus leadingIcon={<FanIcon icon={Check} className={styles.doneCheck} />}>{r.t('entered')}</FanActionStatus>;
  return <FanAction type="button" variant="primary" fullWidth loading={r.pending} disabled={!r.ready} onClick={r.enter}>{r.t('enterCta')}</FanAction>;
}

/** 마감까지 남은 시간을 `D-17`과 `21:04:09`로 나눈다. 하루가 안 남으면 `D-DAY`. */
export function raffleCountdown(left: number) {
  const seconds = Math.max(0, Math.floor(left / 1000)), days = Math.floor(seconds / 86400), two = (value: number) => String(value).padStart(2, '0');
  return { day: days > 0 ? `D-${days}` : 'D-DAY', clock: `${two(Math.floor(seconds % 86400 / 3600))}:${two(Math.floor(seconds % 3600 / 60))}:${two(seconds % 60)}`, urgent: days < 1 };
}

/** 살아 있는 신호: 마감까지 남은 시간이 1초마다 바뀐다(고정폭 숫자라 자리가 흔들리지 않는다). 서버가 그린 값에서 시작해 브라우저 시계로 이어 간다. */
export function RaffleCountdown() {
  const r = useRaffle();
  const [now, setNow] = useState(r.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (r.closed || now > r.closesAt) return null;
  const left = raffleCountdown(r.closesAt - now);
  // 보조 기술에는 1초마다 읽히지 않게 마감 문구만 준다.
  return <p className={styles.countdown} role="timer" aria-live="off" aria-label={r.t('closesAt')} data-urgent={left.urgent} data-raffle-countdown>
    <FanDisplay role="strong" aria-hidden="true">{left.day}</FanDisplay><FanDisplay role="strong" aria-hidden="true" suppressHydrationWarning>{left.clock}</FanDisplay>
  </p>;
}

/** 소품에 찍는 인쇄 문구(언어와 상관없이 같은 글자). */
const stampPrint = 'ENTERED';

/** 참여 방법 칸: 응모 버튼(응모 뒤에는 완료 표시 + 도장) · 친구에게 공유 · 마감과 남은 시간 · 한 줄(1인 1응모 / 내 응모 1회 / 오류와 다시 시도). */
export function RaffleEnterBlock() {
  const r = useRaffle();
  if (r.closed) return <FanDisplay role="strong" as="p" className={styles.enterEnded} data-state="closed">{r.t('ended')}</FanDisplay>;
  return <div className={styles.enter} data-raffle-hero-action>
    <div className={styles.enterActions}>
      <div className={styles.enterCta}>
        <RaffleEnterAction />
        {r.entered ? <FanPrintStamp label={stampPrint} className={styles.enterStamp} /> : null}
      </div>
      {/* 응모 바로 옆(모바일은 바로 아래)의 보조 행동. 응모 뒤에는 이 칸에서 누를 수 있는 유일한 버튼이라 다음 행동이 된다 */}
      <RaffleShare />
    </div>
    <div className={styles.enterFacts}>
      <p className={styles.enterDeadline}><FanDisplay role="strong">{r.t('closesAt')}</FanDisplay><FanDisplay role="caption" className={styles.muted}>{r.t('kst')}</FanDisplay></p>
      <RaffleCountdown />
    </div>
    {r.error ? <p className={styles.enterError} role="alert"><FanDisplay role="caption">{r.s('error')}</FanDisplay><FanAction type="button" variant="text" size="sm" onClick={r.enter}>{r.t('retry')}</FanAction></p> : null}
    {/* 댓글·출석으로 늘어난 기회는 이 줄에 섞지 않는다(서버 값이 아직 화면에 없음). */}
    {r.entered
      ? <p className={styles.enterStatus} data-state="entered" role="status"><FanIcon icon={Ticket} size={16} /><FanDisplay role="caption">{r.t('myEntry')}</FanDisplay></p>
      : <p className={styles.enterStatus}><FanDisplay role="caption">{r.t('flowOnce')}</FanDisplay></p>}
  </div>;
}

const DoneMark = ({ label }: { label: string }) => <FanDisplay role="caption" as="p" className={styles.doneMark}><FanIcon icon={Check} size={16} className={styles.doneCheck} />{label}</FanDisplay>;

/** 당첨 기회 올리기: 행마다 그 행동으로 가는 버튼 하나. */
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

/** 하단 고정 줄(모든 폭): 남은 시간 + 응모 전에는 응모(primary), 응모 뒤에는 출석(neutral). 마감 후에는 숨긴다. */
export function RaffleStickyCta() {
  const r = useRaffle();
  // 참여 방법 칸의 같은 응모 버튼이 화면에 보이는 동안에는 숨겨 분홍 버튼이 두 개 겹쳐 보이지 않게 한다.
  const [inlineInView, setInlineInView] = useState(true);
  useEffect(() => {
    const target = document.querySelector('[data-raffle-hero-action]');
    if (!target || typeof IntersectionObserver === 'undefined') { setInlineInView(false); return; }
    const observer = new IntersectionObserver(([entry]) => setInlineInView(Boolean(entry?.isIntersecting)));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  if (r.closed) return null;
  const hidden = inlineInView;
  return <div className={styles.sticky} data-hidden={hidden} aria-hidden={hidden || undefined} inert={hidden || undefined}>
    <div className={styles.stickyRow}>
      <RaffleCountdown />
      <div className={styles.stickyCta}>{r.entered
        ? <FanAction href={communityHref(r.locale)} variant="neutral" fullWidth>{r.t('checkIn')}</FanAction>
        : <RaffleEnterAction />}</div>
    </div>
  </div>;
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
  // 공통 보조 버튼 그대로(높이 44/48, 아이콘은 leadingIcon 자리라 간격 8). v4.3의 글자형 작은 버튼은 사용자 "너무 작은 거 아니야?"(2026-11-13)로 되돌렸다.
  return <FanAction type="button" variant="secondary" fullWidth leadingIcon={<FanIcon icon={Share2} />} onClick={share}>{copied ? r.t('copied') : r.t('share')}</FanAction>;
}
