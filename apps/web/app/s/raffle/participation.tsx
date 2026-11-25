'use client';

import { sendGa4Event } from '@/features/analytics/client/ga4-client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { FanPrintStamp } from '@/components/fan-ui/fan-print';
import { Check, Share2, Ticket } from '@/components/fan-ui/fan-icons';
import { FanIcon } from '@/components/fan-ui/fan-icon';
import { FanDisplay } from '@/components/fan-ui/fan-display';
import type { AppLocale } from '@/i18n/locales';
import { signupRaffleText } from '@/i18n/catalogs/signup-raffle';
import { raffleInviteText, raffleLongformText, raffleOddsText, type SignupRaffleLongformKey } from '@/i18n/catalogs/signup-raffle-longform';
import { raffleInviteCode, raffleShareHref } from '@/features/benefit/domain/signup-event';
import { communityInviteSchema } from '@/features/community-stamps/domain/community-stamps';
import { communityStampAction } from '@/features/community-stamps/ui/use-community-stamps';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { FanAction, FanActionStatus } from '@/components/fan-ui/fan-action';
import { requiresGoogleBrowserHandoff } from '@/components/login-browser-policy';
import type { RaffleCapsuleResult } from '@/features/capsule-machine/raffle-result-capsule';
import { RaffleResultEntry } from './result-entry';
import { signupRaffleResultSchema } from '@/server/signup-event/result';
import styles from './raffle.module.css';

/** 개발 서버에서 로그인 없이 상태별 화면을 보기 위한 표시 전용 값(서버 규칙·API와 무관). */
export type RafflePreview = 'in' | 'entered' | 'passport' | 'done' | 'error' | 'won' | 'lost' | undefined;

type Ctx = {
  locale: AppLocale; closed: boolean; closesAt: number; now: number; ready: boolean; signedIn: boolean; pending: boolean; entered: boolean;
  passport: boolean; community: boolean; error: boolean;
  /** 서버가 센 내 당첨 기회 수와 내 링크로 가입·응모한 친구 수. 서버 값을 받기 전에는 없다(화면이 지어내지 않는다). */
  chances?: number; friends?: number;
  /** 응모한 모든 회원의 당첨 기회 합계(서버 값, 대략 확률의 분모). 못 읽으면 없다. */
  totalChances?: number;
  /** 추첨 방식대로 서버가 센 지금 내 당첨 확률(0~1). */
  winChance?: number;
  /** 내 친구 초대 코드(로그인했을 때만). 공유 주소에 붙는다. */
  inviteCode?: string; invited: boolean;
  /** 마감 뒤 내 결과(서버에 저장된 추첨이 있고 내가 응모했을 때만). 추첨 전·미응모·조회 실패는 없다. */
  result?: RaffleCapsuleResult;
  enter: () => void; login: () => void; t: (key: SignupRaffleLongformKey, count?: number) => string; s: (key: Parameters<typeof signupRaffleText>[1]) => string;
};
const RaffleContext = createContext<Ctx | null>(null);
function useRaffle() { const value = useContext(RaffleContext); if (!value) throw new Error('RaffleProvider missing'); return value; }

/** 친구가 준 초대 코드는 가입·로그인으로 화면이 바뀌어도 남아 있어야 해서 이 브라우저에 적어 둔다. 저장소를 못 쓰면 이번 화면에서만 쓴다. */
const inviteKey = 'kyaa:raffle:invite';
const storedInvite = () => { try { return raffleInviteCode(window.localStorage.getItem(inviteKey)); } catch { return undefined; } };
const storeInvite = (code?: string) => { try { if (code) window.localStorage.setItem(inviteKey, code); else window.localStorage.removeItem(inviteKey); } catch { /* 저장소 없음 */ } };
/** 비로그인으로 응모를 누르면 로그인·가입에서 돌아왔을 때 그대로 응모한다(① 응모 → ② 가입·로그인, 대표 2026-11-23). 한 번 읽으면 지운다. */
const enterKey = 'kyaa:raffle:enter';
const takeEnterIntent = () => { try { const wants = window.sessionStorage.getItem(enterKey) === '1'; window.sessionStorage.removeItem(enterKey); return wants; } catch { return false; } };
const keepEnterIntent = () => { try { window.sessionStorage.setItem(enterKey, '1'); } catch { /* 저장소 없음: 주소의 ?enter=1이 남는다 */ } };
/** 앱 안 브라우저(X 등)에서 Safari·Chrome으로 옮기면 sessionStorage는 따라가지 않는다. 그래서 응모 의도를 주소(?enter=1)에도 싣는다:
 * 로그인 뒤 돌아올 주소와 '링크 복사' 주소가 같은 값이다(감사 RAFFLE-FUNNEL-CHECK-1123 2번). 해시와 개발 미리보기 값은 뺀다. */
export const raffleEnterHref = (href: string) => { const url = new URL(href); url.searchParams.delete('preview'); url.searchParams.set('enter', '1'); url.hash = ''; return url.href; };
const markEnterInAddress = () => { try { window.history.replaceState(window.history.state, '', raffleEnterHref(window.location.href)); } catch { /* sessionStorage 쪽이 남는다 */ } };
/** 주소의 ?enter=1을 읽으면 바로 지운다(한 번만, 새로고침·뒤로 가기로 다시 응모하지 않게). */
const takeEnterFromAddress = () => {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('enter')) return false;
    const wants = url.searchParams.get('enter') === '1';
    url.searchParams.delete('enter');
    window.history.replaceState(window.history.state, '', url.href);
    return wants;
  } catch { return false; }
};
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

type EntryResult = { newEntry?: boolean; entered?: boolean; passportReceived?: boolean; communityJoined?: boolean; chances?: number; friends?: number; totalChances?: number; winChance?: number; invite?: 'registered' | 'refused' | 'pending' };

export function RaffleProvider({ locale, closed, closesAt, now, preview, invite, children }: { locale: AppLocale; closed: boolean; closesAt: number; now: number; preview?: RafflePreview; /** 주소의 ?invite= 로 받은 친구의 초대 코드 */ invite?: string; children: ReactNode }) {
  const auth = useByUsAuth(), { getAccessToken } = auth;
  const [pending, setPending] = useState(false);
  const [entered, setEntered] = useState(false), [passport, setPassport] = useState(false), [community, setCommunity] = useState(false), [error, setError] = useState(false);
  const [chances, setChances] = useState<number>(), [friends, setFriends] = useState<number>(), [totalChances, setTotalChances] = useState<number>(), [winChance, setWinChance] = useState<number>(), [inviteCode, setInviteCode] = useState<string>();
  const [result, setResult] = useState<RaffleCapsuleResult>();
  const received = useRef<string | undefined>(undefined);
  const p = preview;
  const apply = useCallback((result: EntryResult) => {
    setEntered(!!result.entered); setPassport(!!result.passportReceived); setCommunity(!!result.communityJoined);
    setChances(result.entered ? count(result.chances) : undefined); setFriends(count(result.friends)); setTotalChances(result.entered ? count(result.totalChances) : undefined); setWinChance(result.entered && typeof result.winChance === 'number' && result.winChance >= 0 && result.winChance <= 1 ? result.winChance : undefined);
    // 등록됐거나 등록할 수 없는 코드는 다시 보내지 않는다. 잠시 뒤 다시(pending)만 남겨 둔다.
    if (result.invite && result.invite !== 'pending') { received.current = undefined; storeInvite(); }
  }, []);
  const request = useCallback(async (method: 'GET' | 'POST') => {
    const token = await getAccessToken(); if (!token) throw new Error('auth');
    const code = method === 'POST' ? received.current : undefined;
    const response = await fetch('/api/signup-event/entry', { method, headers: { authorization: `Bearer ${token}`, ...(code ? { 'content-type': 'application/json' } : {}) }, ...(code ? { body: JSON.stringify({ invite: code }) } : {}) });
    if (!response.ok) throw new Error('entry');
    const result = await response.json() as EntryResult;
    if (method === 'POST' && result.newEntry === true) {
      sendGa4Event('raffle_enter', { campaign: 'raffle-1125', method: result.invite === 'registered' ? 'invite' : 'direct' });
    }
    return result;
  }, [getAccessToken]);
  useEffect(() => {
    const code = raffleInviteCode(invite) ?? storedInvite();
    received.current = code;
    if (code) storeInvite(code);
  }, [invite]);
  // 로그인한 회원: 내 응모 상태와 당첨 기회 수를 서버에서 읽는다. 받은 초대 코드가 남아 있고 이미 응모했다면 그 코드를 한 번 더 등록해 본다.
  useEffect(() => {
    if (p || closed || !auth.ready || !auth.authenticated) return;
    let live = true;
    void (async () => {
      // 둘 다 읽어서 지운다(같은 탭의 sessionStorage, 다른 브라우저로 넘어온 주소의 ?enter=1)
      const fromSession = takeEnterIntent(), fromAddress = takeEnterFromAddress();
      const wants = fromSession || fromAddress;
      try {
        let result = await request('GET');
        if (!result.entered && wants) { if (live) setPending(true); result = { ...await request('POST'), entered: true }; }
        else if (result.entered && received.current) result = await request('POST');
        if (live) apply(result);
      } catch {
        // 응모하러 돌아왔는데 실패하면 조용히 두지 않고 오류 줄(다시 시도)을 보인다. 그 밖에는 응모 전 화면 그대로. 응모 버튼은 여러 번 눌러도 한 번만 기록된다
        if (live && wants) setError(true);
      }
      if (live) setPending(false);
      try { const mine = await communityStampAction(getAccessToken, 'invite-code', {}, value => communityInviteSchema.parse(value)); if (live) setInviteCode(raffleInviteCode(mine.code)); } catch { /* 초대 버튼을 누르면 코드를 다시 요청한다. */ }
    })();
    return () => { live = false; };
  }, [p, closed, auth.ready, auth.authenticated, request, apply, getAccessToken]);
  // 마감 뒤: 서버에 저장된 추첨이 있을 때만 내 결과가 온다(여기서 뽑지 않는다). 못 읽으면 결과 확인 버튼을 내지 않는다.
  useEffect(() => {
    if (p || !closed || !auth.ready || !auth.authenticated) return;
    let live = true;
    void (async () => {
      try {
        const token = await getAccessToken(); if (!token) return;
        const response = await fetch('/api/signup-event/result', { headers: { authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const mine = signupRaffleResultSchema.parse(await response.json());
        if (live && (mine.state === 'won' || mine.state === 'lost')) setResult(mine);
      } catch { /* 결과 확인 버튼 없이 마감 줄만 */ }
    })();
    return () => { live = false; };
  }, [p, closed, auth.ready, auth.authenticated, getAccessToken]);
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
    if (!auth.authenticated) { keepEnterIntent(); markEnterInAddress(); auth.login(); return; }
    setPending(true); setError(false);
    try { apply({ ...await request('POST'), entered: true }); }
    catch { setError(true); }
    finally { setPending(false); }
  }
  // 개발 미리보기 won·lost: 로그인·API 없이 결과 팝업만 본다(US$100 당첨 / 미당첨). 운영 빌드에는 preview 값이 오지 않는다.
  const shown = p === 'won' ? { state: 'won' as const, usd: 100 } : p === 'lost' ? { state: 'lost' as const } : result;
  const value: Ctx = { locale, closed, closesAt, now, ready: auth.ready || !!p, pending, ...view, invited: !!raffleInviteCode(invite), chances, friends, totalChances, winChance, inviteCode, result: shown, enter, login: auth.login, t: (key, count) => raffleLongformText(locale, key, count), s: (key) => signupRaffleText(locale, key) };
  return <RaffleContext.Provider value={value}>{children}</RaffleContext.Provider>;
}

const passportHref = (locale: AppLocale) => `/passports?locale=${locale}`;
const communityHref = (locale: AppLocale) => `/pages/groups?locale=${locale}`;
/** 응모 버튼: 페이지에서 유일한 분홍 면(primary 1개). 히어로와 모바일 하단 고정 줄이 같은 버튼을 쓴다. 요청 중에는 공통 loading.
 * 응모 뒤에는 누를 수 없는 버튼(비활성 .4, 흰 글자 1.99:1)이 아니라 공통 `FanActionStatus`: 흰 면·잉크 글자·완료 체크(`--color-success`)를 같은 자리·같은 크기로. */
function RaffleEnterAction({ size }: { size?: 'lg' }) {
  const r = useRaffle();
  if (r.entered) return <FanActionStatus size={size} leadingIcon={<FanIcon icon={Check} className={styles.doneCheck} />}>{r.t('entered')}</FanActionStatus>;
  return <FanAction type="button" variant="primary" size={size} fullWidth loading={r.pending} disabled={!r.ready} onClick={r.enter}>{r.t('enterCta')}</FanAction>;
}

/** 마감까지 남은 시간을 `D-17`과 `21:04:09`로 나눈다. 하루가 안 남으면 `D-DAY`. */
export function raffleCountdown(left: number) {
  const seconds = Math.max(0, Math.floor(left / 1000)), days = Math.floor(seconds / 86400), two = (value: number) => String(value).padStart(2, '0');
  return { day: days > 0 ? `D-${days}` : 'D-DAY', clock: `${two(Math.floor(seconds % 86400 / 3600))}:${two(Math.floor(seconds % 3600 / 60))}:${two(seconds % 60)}`, urgent: days < 1 };
}

/** 살아 있는 신호: 마감까지 남은 시간이 1초마다 바뀐다(고정폭 숫자라 자리가 흔들리지 않는다). 서버가 그린 값에서 시작해 브라우저 시계로 이어 간다. */
export function RaffleCountdown({ hero = false }: { hero?: boolean }) {
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
  // hero: 키 비주얼 안의 큰 남은 시간(대표 2026-11-13 "타임어택"). 같은 시계라 하단 고정 줄과 1초도 어긋나지 않는다.
  const role = hero ? 'figure' : 'strong';
  return <p className={styles.countdown} role="timer" aria-live="off" aria-label={r.t('closesAt')} data-urgent={left.urgent} data-size={hero ? 'hero' : undefined} data-raffle-countdown>
    <FanDisplay role={role} optical={hero} aria-hidden="true">{left.day}</FanDisplay><FanDisplay role={role} aria-hidden="true" suppressHydrationWarning>{left.clock}</FanDisplay>
  </p>;
}

/** 소품에 찍는 인쇄 문구(언어와 상관없이 같은 글자). */
const stampPrint = 'ENTERED';

/** 참여 방법 칸: 응모 버튼(응모 뒤에는 완료 표시 + 도장) · 친구에게 공유 · 마감과 남은 시간 · 한 줄(1인 1응모 / 내 응모 1회 / 오류와 다시 시도). */
export function RaffleEnterBlock() {
  const r = useRaffle();
  if (r.closed) return r.result ? <RaffleResultEntry locale={r.locale} result={r.result} /> : <FanDisplay role="strong" as="p" className={styles.enterEnded} data-state="closed">{r.t('ended')}</FanDisplay>;
  return <div className={styles.enter} data-raffle-hero-action>
    {/* 페이지 첫 행동(대표 2026-11-23 X 홍보): 큰 응모 버튼(56) 바로 아래 두 걸음 ① 응모 누르기 ② 가입·로그인. 끝낸 걸음은 체크 */}
    <div className={styles.enterActions}>
      <div className={styles.enterCta}><RaffleEnterAction size="lg" /></div>
      {r.ready && !r.signedIn && r.invited && <FanDisplay role="body">{raffleInviteText[r.locale].welcome}</FanDisplay>}
      <RaffleInAppGuide />
      <ol className={styles.steps}>
        <RaffleStep order={1} done={r.entered} label={r.t('stepEnter')} />
        <RaffleStep order={2} done={r.signedIn} label={r.t(r.signedIn ? 'stepLoggedIn' : 'stepLogin')} />
      </ol>
      {/* 응모 바로 옆(모바일은 바로 아래)의 보조 행동. 응모 뒤에는 이 칸에서 누를 수 있는 유일한 버튼이라 다음 행동이 된다 */}
      <RaffleShare />
    </div>
    <div className={styles.enterFacts}>
      <p className={styles.enterDeadline}><FanDisplay role="strong">{r.t('closesAt')}</FanDisplay><FanDisplay role="caption" className={styles.muted}>{r.t('kst')}</FanDisplay></p>
      <RaffleCountdown />
    </div>
    {r.error ? <p className={styles.enterError} role="alert"><FanDisplay role="caption">{r.s('error')}</FanDisplay><FanAction type="button" variant="text" size="sm" onClick={r.enter}>{r.t('retry')}</FanAction></p> : null}
    {/* 응모 뒤의 주인공은 내 당첨 기회 수(서버가 센 값만: 기본 1 + Fan Passport·커뮤니티 + 댓글·출석 + 친구 초대). 도장은 이 칸 안 왼쪽에 40으로 한 번 찍힌다.
     * 값을 받기 전(또는 개발 미리보기)에는 숫자를 지어내지 않고 응모 1회만 말한다 */}
    {r.entered
      ? <div className={styles.enterResult} data-state="entered" role="status">
          <FanPrintStamp label={stampPrint} className={styles.enterStamp} />
          {r.chances
            ? <p className={styles.enterChances} data-raffle-chances><FanDisplay role="caption" className={styles.muted}>{r.t('myChancesLabel')}</FanDisplay><FanDisplay role="figure-sm">{r.t('chancesCount', r.chances)}</FanDisplay></p>
            : <p className={styles.enterStatus} data-state="entered"><FanIcon icon={Ticket} size={16} /><FanDisplay role="caption">{r.t('myEntry')}</FanDisplay></p>}
        </div>
      : <p className={styles.enterStatus}><FanDisplay role="caption">{r.t('flowOnce')}</FanDisplay></p>}
  </div>;
}

/** 앱 안 브라우저(X·Instagram·Facebook·TikTok·카카오톡 등, 로그인 화면과 같은 판별)에서는 Google 로그인이 막히고 X는 Safari로 넘기기도 무시한다.
 * 비로그인에게 응모 버튼 바로 아래에 필수 안내 한 줄 + 링크 복사(?enter=1이 붙어 브라우저에서 로그인하면 바로 응모된다). */
function RaffleInAppGuide() {
  const r = useRaffle();
  const [inApp, setInApp] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
    setInApp(requiresGoogleBrowserHandoff(navigator.userAgent, standalone));
  }, []);
  if (!inApp || !r.ready || r.signedIn || r.entered) return null;
  const href = () => raffleEnterHref(window.location.href);
  return <div className={styles.inApp} data-raffle-inapp>
    <FanDisplay role="body" as="p">{r.t('inAppGuide')}</FanDisplay>
    <FanAction type="button" variant="secondary" size="sm" onClick={async () => {
      try { await navigator.clipboard.writeText(href()); setCopy('copied'); } catch { setCopy('failed'); }
    }}>{copy === 'copied' ? r.t('copied') : r.t('copyLink')}</FanAction>
    {copy === 'failed' ? <input className={styles.inAppLink} aria-label={r.t('copyLink')} readOnly value={href()} onFocus={event => event.currentTarget.select()} /> : null}
  </div>;
}

const RaffleStep = ({ order, done, label }: { order: number; done: boolean; label: string }) => <li data-row="raffle-step" data-done={done || undefined}>
  <FanDisplay role="strong" className={styles.stepMark} aria-hidden="true">{done ? <FanIcon icon={Check} size={16} /> : order}</FanDisplay><FanDisplay role="strong">{label}</FanDisplay>
</li>;

const DoneMark = ({ label }: { label: string }) => <FanDisplay role="caption" as="p" className={styles.doneMark}><FanIcon icon={Check} size={16} className={styles.doneCheck} />{label}</FanDisplay>;

/** 당첨 확률 올리기: 행마다 그 행동으로 가는 버튼 하나. 친구 초대 행은 내 초대 링크를 공유한다. */
export function RaffleBoostAction({ kind }: { kind: 'comment' | 'attend' | 'invite' }) {
  const r = useRaffle();
  const share = useRaffleShare();
  if (r.closed) return null;
  // 내 초대 링크는 로그인해야 생긴다: 비로그인은 로그인으로 보낸다(코드 없는 주소를 '초대 링크'라고 공유하지 않는다)
  if (kind === 'invite') return <FanAction type="button" variant="neutral" size="sm" disabled={!r.ready} onClick={() => share.share()}>{share.failed ? r.t('retry') : share.copied ? raffleInviteText[r.locale].copied : r.t('inviteCta')}</FanAction>;
  return kind === 'attend'
    ? <FanAction href={communityHref(r.locale)} variant="neutral" size="sm">{r.t('checkIn')}</FanAction>
    : <FanAction href={`/?locale=${r.locale}`} variant="neutral" size="sm">{r.t('findPosts')}</FanAction>;
}

/** 당첨 확률 식(대표 2026-11-13 "투명하게"): 식은 늘 보이고, 응모한 회원에게는 서버가 추첨 방식대로 센 지금 확률과 내 기회·전체 기회를 붙인다. 값이 없으면 숫자를 지어내지 않는다. */
export function RaffleOdds() {
  const r = useRaffle();
  return <div className={styles.odds} data-raffle-odds>
    <FanDisplay role="caption" as="p">{r.t('oddsRule')}</FanDisplay>
    {r.entered && r.chances && r.totalChances && r.winChance !== undefined ? <FanDisplay role="caption" as="p" className={styles.oddsMine} data-raffle-odds-mine>{raffleOddsText(r.locale, r.winChance, r.chances, r.totalChances)}</FanDisplay> : null}
  </div>;
}

/** 친구 초대 행의 사실 줄 끝: 내 링크로 가입·응모한 친구 수(서버 값, 한 명 이상일 때만). */
export function RaffleInvitedFriends() {
  const r = useRaffle();
  return r.signedIn && r.friends !== undefined ? <FanDisplay role="caption" data-raffle-friends>{raffleInviteText[r.locale].stats.replace('{n}', String(r.friends)).replace('{c}', String(r.friends * 3))}</FanDisplay> : null;
}

/** Fan Passport · 커뮤니티 행동 버튼. 끝냈으면 '완료' 표시. short: 행 이름이 바로 옆에 있는 당첨 확률 올리기 행에서는 '받기'/'가입'만(390에서 이름·+1·버튼이 한 줄). */
export function RaffleMoreAction({ kind, short = false }: { kind: 'passport' | 'community'; short?: boolean }) {
  const r = useRaffle();
  if (kind === 'passport' ? r.passport : r.community) return <DoneMark label={r.t('done')} />;
  return kind === 'passport'
    ? <FanAction href={passportHref(r.locale)} variant="neutral" size="sm">{short ? r.t('getShort') : r.s('passport')}</FanAction>
    : <FanAction href={communityHref(r.locale)} variant="neutral" size="sm">{short ? r.t('joinShort') : r.s('community')}</FanAction>;
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

/** 개인 초대 링크만 전달한다. 공유 시트가 없는 브라우저는 주소를 복사한다. */
function useRaffleShare() {
  const r = useRaffle();
  const { getAccessToken } = useByUsAuth();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  async function share(copyOnly = false) {
    if (!r.signedIn) { r.login(); return; }
    setCopied(false);
    setFailed(false);
    try {
      const code = r.inviteCode ?? raffleInviteCode((await communityStampAction(getAccessToken, 'invite-code', {}, value => communityInviteSchema.parse(value))).code);
      if (!code) throw new Error('invite code unavailable');
      const url = `${location.origin}${raffleShareHref(code)}`;
      if (!copyOnly && navigator.share) { await navigator.share({ title: r.s('title'), text: raffleInviteText[r.locale].message, url }); return; }
      await navigator.clipboard.writeText(url); setCopied(true);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setFailed(true);
    }
  }
  return { share, copied, failed };
}

export function RaffleShare() {
  const r = useRaffle();
  const { share, copied, failed } = useRaffleShare();
  const text = raffleInviteText[r.locale];
  const disabled = !r.ready;
  return <>
    <FanDisplay role="strong">{text.title}</FanDisplay>
    <FanDisplay role="caption">{text.rule}</FanDisplay>
    <FanAction type="button" variant="secondary" disabled={disabled} onClick={() => share(true)}>{text.copy}</FanAction>
    <FanAction type="button" variant="neutral" disabled={disabled} leadingIcon={<FanIcon icon={Share2} />} onClick={() => share()}>{text.share}</FanAction>
    {failed && <span role="alert">{r.s('error')}</span>}
    {copied && <span role="status">{text.copied}</span>}
  </>;
}
