'use client';
import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { z } from 'zod';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { reactionResultSchema } from '@/features/reaction/domain/reaction';
import { FanAction } from '@/components/fan-ui/fan-action';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { FanText } from '@/components/fan-ui/fan-text';
import { FanDisplay } from '@/components/fan-ui/fan-display';
import { FanContentContainer } from '@/components/fan-shell/fan-content-container';
import { Heart, Check } from '@/components/fan-ui/fan-icons';
import { externalBrowserUrl } from '@/components/login-browser-policy';
import { recordClientProductEvent, pageViewIdempotencyKey } from '@/features/analytics/client/product-event-client';
import { isXBrowser, missionAttribution } from './mission-context';
import styles from './x-mission.module.css';
/** 단계 아이콘: 기존 3D 애셋(확성기 = 이벤트, 문 = 로그인, 분홍 하트 = 좋아요) */
const stepArt = ['/images/my/shortcuts/reports.webp', '/images/my/shortcuts/logout.webp', '/images/dukjil-duo/glyph-heart-160.webp'] as const;
export const missionSlug = 'x-mission-1113';
const countSchema = z.object({ likeCount: z.number().int().nonnegative() });
const statusSchema = z.object({ reaction: reactionResultSchema.nullable() });
const profileSchema = z.object({ profile: z.object({ nickname: z.string().nullable() }) });
/** 서버가 완료 시각을 주지 않으므로, 이 기기에서 처음 완료한 날을 기억한다. 없으면 오늘 날짜 */
const stampDateKey = (userId: string) => `${missionSlug}:stamped:${userId}`;
const stampArt = '/images/stamps/ink-v1/first-like.webp';
const copy = {
 ko: { title: '좋아요 미션', subtitle: 'Like Mission', how: '참여 방법', once: '1인 1회', stamped: '도장 쾅! 좋아요 미션 완료', event: 'KYAA × X 좋아요 미션', steps: ['이벤트 페이지 접속', 'Google로 로그인', '좋아요 누르기'], login: 'Google로 로그인', like: '좋아요', done: '미션 완료', count: '좋아요', error: '이벤트를 불러오지 못했어요. 다시 시도해 주세요.', retry: '다시 시도', saveError: '좋아요를 저장하지 못했어요. 다시 시도해 주세요.' },
 en: { title: 'Like Mission', subtitle: '좋아요 미션', how: 'How to join', once: 'Once per account', stamped: 'Stamped! Mission complete', event: 'KYAA × X Like Mission', steps: ['Visit this event page', 'Sign in with Google', 'Like this page'], login: 'Continue with Google', like: 'Like', done: 'Mission complete', count: 'Likes', error: 'Couldn’t load the event. Please try again.', retry: 'Try again', saveError: 'Couldn’t save your like. Please try again.' },
};
export function XMission({ locale }: { locale: 'ko' | 'en' }) {
 const auth = useByUsAuth();
 return <MissionForOwner key={`${auth.ready}:${auth.authenticated}:${auth.user?.id ?? 'guest'}`} locale={locale} auth={auth} />;
}
function MissionForOwner({ locale, auth }: { locale: 'ko' | 'en'; auth: ReturnType<typeof useByUsAuth> }) {
 const t = copy[locale];
 const [locationContext, setLocationContext] = useState({ search:'', hash:'' });
 useEffect(() => { setLocationContext({ search:window.location.search, hash:window.location.hash }); }, []);
 const languageHref = (value: 'ko' | 'en') => { const query = new URLSearchParams(locationContext.search); query.set('locale', value); return `?${query}${locationContext.hash}`; };
 const [inX, setInX] = useState(false), [browserNotice, setBrowserNotice] = useState(false);
 useEffect(() => { setInX(isXBrowser(navigator.userAgent)); }, []);
 const [count, setCount] = useState<number>();
 const [completed, setCompleted] = useState(false), [loaded, setLoaded] = useState(false), [celebrate, setCelebrate] = useState(false);
 const [error, setError] = useState<'load' | 'save'>(), [pending, setPending] = useState(false), [retry, setRetry] = useState(0);
 const { getAccessToken, ready, authenticated } = auth;
 useEffect(() => {
  const controller = new AbortController();
  setLoaded(false); setError(undefined);
  void (async () => {
   try {
    const response = await fetch(`/api/celebrities/${missionSlug}/fans?locale=${locale}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('count');
    const value = countSchema.parse(await response.json());
    let done = false;
    if (ready && authenticated) {
     const token = await getAccessToken(); if (!token) throw new Error('session');
     const response = await fetch(`/api/celebrities/${missionSlug}/reactions`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal });
     if (!response.ok) throw new Error('status');
     done = statusSchema.parse(await response.json()).reaction !== null;
    }
    if (!controller.signal.aborted) { setCount(value.likeCount); setCompleted(done); setLoaded(true); }
   } catch { if (!controller.signal.aborted) setError('load'); }
  })();
  return () => controller.abort();
 }, [authenticated, getAccessToken, locale, ready, retry]);
 const recordAttribution = useCallback(async () => {
  const properties = missionAttribution(window.location.search);
  if (!properties || !authenticated || !auth.user?.id) return;
  const token = await getAccessToken(); if (!token) return;
  const idempotencyKey = await pageViewIdempotencyKey('creator_page_view', `x-mission-${properties.kol}`, auth.user.id);
  await recordClientProductEvent({ eventName:'creator_page_view', source:'x_mission.identified', idempotencyKey, celebrityId:null, liveEventId:null, missionId:null, benefitId:null, properties }, token);
 }, [authenticated, auth.user?.id, getAccessToken]);
 useEffect(() => { if (ready && authenticated) void recordAttribution().catch(() => {}); }, [ready, authenticated, recordAttribution]);
 async function like() {
  if (!loaded || pending || completed || !authenticated) return;
  setPending(true); setError(undefined);
  try {
   const token = await getAccessToken(); if (!token) throw new Error('session');
   const response = await fetch(`/api/celebrities/${missionSlug}/reactions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
   if (!response.ok) throw new Error('like');
   reactionResultSchema.parse(await response.json());
   void recordAttribution().catch(() => {});
   setCompleted(true); setCelebrate(true);
   setRetry(value => value + 1);
  } catch { setError('save'); }
  finally { setPending(false); }
 }
 const primary = 'primary' as const;
 const returnTo = typeof window === 'undefined' ? `/s/x?locale=${locale}` : `/s/x${window.location.search}${window.location.hash}`;
 function beginLogin(event: MouseEvent<HTMLAnchorElement>) {
  const target = new URL(returnTo, window.location.origin); target.searchParams.set('x_started', new Date().toISOString());
  event.currentTarget.href = `/api/auth/cognito/start?${new URLSearchParams({ provider:'google', returnTo:target.pathname + target.search + target.hash, locale })}`;
 }
 function openBrowser() {
  setBrowserNotice(true);
  // iOS X has no reliable universal external-browser handoff; keep the app-menu instruction visible.
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
  const target = externalBrowserUrl(navigator.userAgent, window.location.href);
  if (target) window.location.assign(target);
 }
 const loginHref = `/api/auth/cognito/start?${new URLSearchParams({ provider: 'google', returnTo, locale })}`;
 const doneSteps = completed ? 3 : authenticated ? 2 : 1;
 const [nickname, setNickname] = useState<string | null>(null);
 useEffect(() => {
  if (!ready || !authenticated) return;
  const controller = new AbortController();
  void (async () => {
   const token = await getAccessToken(); if (!token) return;
   const response = await fetch('/api/me/profile', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal });
   const parsed = response.ok ? profileSchema.safeParse(await response.json()) : null;
   if (parsed?.success && !controller.signal.aborted) setNickname(parsed.data.profile.nickname);
  })().catch(() => {});
  return () => controller.abort();
 }, [ready, authenticated, getAccessToken]);
 const userId = auth.user?.id;
 const [stampedAt, setStampedAt] = useState<string>();
 useEffect(() => {
  if (!completed || !userId) return;
  let saved: string | null = null;
  try { saved = localStorage.getItem(stampDateKey(userId)); if (!saved) { saved = new Date().toISOString(); localStorage.setItem(stampDateKey(userId), saved); } } catch { saved = new Date().toISOString(); }
  setStampedAt(saved);
 }, [completed, userId]);
 const stampDate = new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(stampedAt ? new Date(stampedAt) : new Date());
 // 방금 완료한 때만: 도장 카드가 있는 맨 위로 올린다
 useEffect(() => { if (celebrate && completed) window.scrollTo?.({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [celebrate, completed]);
 return <FanContentContainer as="main" id="x-mission-main" className={styles.column} lang={locale}>
  <div className={styles.hero}>
   {completed ? <section className={styles.proof} data-block="x-mission-stamp" data-celebrate={celebrate ? '' : undefined} aria-labelledby="x-mission-stamped">
    <img className={styles.wordmark} src="/images/guest-home/kyaa-wordmark.svg" alt="kyaa" width={1164} height={563} />
    <FanDisplay role="caption">{t.event}</FanDisplay>
    <img className={styles.stamp} src={stampArt} alt="" width={512} height={512} decoding="async" />
    <FanHeading as="h2" id="x-mission-stamped"><FanDisplay role="title">{t.stamped}</FanDisplay></FanHeading>
    <p className={styles.proofFacts}>{nickname ? <FanDisplay role="strong" dir="auto">{nickname}</FanDisplay> : null}<FanDisplay role="strong">{stampDate}</FanDisplay></p>
   </section> : <div className={styles.keyVisual}><img src="/images/x-mission/key-visual.webp" alt="" width={1536} height={1024} fetchPriority="high" decoding="async" /></div>}
   <div className={styles.panel}>
    <div className={styles.topRow}>
     <header className={styles.title}>
      <FanDisplay role="caption" className={styles.muted}>KYAA × X</FanDisplay>
      <FanHeading as="h1"><FanDisplay role="title" optical>{t.title}</FanDisplay></FanHeading>
      <FanDisplay role="lead" as="p" className={styles.muted} lang={locale === 'ko' ? 'en' : 'ko'}>{t.subtitle}</FanDisplay>
     </header>
     <nav className={styles.languages} aria-label="Language"><a href={languageHref('en')} lang="en" aria-current={locale === 'en' ? 'page' : undefined}>EN</a><a href={languageHref('ko')} lang="ko" aria-current={locale === 'ko' ? 'page' : undefined}>한국어</a></nav>
    </div>
    {inX && <div className={styles.browser}><FanAction onClick={openBrowser} fullWidth>{locale === 'ko' ? '브라우저로 열기' : 'Open in browser'}</FanAction>{browserNotice && <FanText as="p" role="body">{locale === 'ko' ? 'X 메뉴에서 ‘브라우저에서 열기’를 선택해 주세요.' : 'Choose “Open in browser” from the X menu.'}</FanText>}</div>}
    <section className={styles.mission} data-block="x-mission" aria-labelledby="x-mission-how">
     <div className={styles.sectionHead}>
      <div className={styles.headTitle}><FanHeading as="h2" id="x-mission-how"><FanDisplay role="heading">{t.how}</FanDisplay></FanHeading><FanDisplay role="caption" className={styles.muted}>{t.once}</FanDisplay></div>
      <FanDisplay role="strong" as="p" className={styles.progressText}><span className={styles.accent}>{doneSteps}</span> / 3</FanDisplay>
     </div>
     <div className={styles.progress} aria-hidden="true">{[0, 1, 2].map(index => <span key={index} data-done={index < doneSteps ? '' : undefined} />)}</div>
     <ol className={styles.steps}>{t.steps.map((step, index) => { const done = index < doneSteps; return <li data-row="mission-step" key={step} data-done={done ? '' : undefined} aria-current={!completed && index === doneSteps ? 'step' : undefined}>
      <img className={styles.stepArt} src={stepArt[index]} alt="" width={48} height={48} loading="lazy" decoding="async" />
      <span className={styles.stepText}><FanDisplay role="caption" className={styles.stepNo}>0{index + 1}</FanDisplay><FanDisplay role="strong">{step}</FanDisplay></span>
      {done ? <Check className={styles.check} size={20} strokeWidth={1.5} aria-hidden="true" /> : <span className={styles.todo} aria-hidden="true" />}
     </li>; })}</ol>
     {error && <FanText as="p" role="body" aria-live="assertive">{error === 'load' ? t.error : t.saveError}</FanText>}
     <div className={styles.cta}>{error === 'load' ? <FanAction onClick={() => setRetry(value => value + 1)} fullWidth>{t.retry}</FanAction> : !authenticated ? <FanAction href={loginHref} onClick={beginLogin} variant={primary} fullWidth>{t.login}</FanAction> : <FanAction onClick={like} variant={primary} fullWidth disabled={!ready || !loaded || completed || pending} loading={pending} leadingIcon={<Heart className={celebrate ? styles.pop : undefined} size={20} strokeWidth={1.5} fill={completed ? 'currentColor' : 'none'} />}>{completed ? t.done : t.like}</FanAction>}</div>
     <div className={styles.result} role="status" aria-live="polite" data-celebrate={celebrate ? '' : undefined}>
      {count !== undefined && <FanDisplay role="caption" as="p" className={styles.count}><Heart size={16} strokeWidth={1.5} aria-hidden="true" />{t.count} · {new Intl.NumberFormat(locale).format(count)}</FanDisplay>}
     </div>
    </section>
   </div>
  </div>
 </FanContentContainer>;
}
