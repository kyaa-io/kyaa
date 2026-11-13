'use client';
import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { z } from 'zod';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { reactionResultSchema } from '@/features/reaction/domain/reaction';
import { FanAction } from '@/components/fan-ui/fan-action';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { FanText } from '@/components/fan-ui/fan-text';
import { FanSurface } from '@/components/fan-ui/fan-surface';
import { Heart, Check } from '@/components/fan-ui/fan-icons';
import { externalBrowserUrl } from '@/components/login-browser-policy';
import { recordClientProductEvent, pageViewIdempotencyKey } from '@/features/analytics/client/product-event-client';
import { isXBrowser, missionAttribution } from './mission-context';
import styles from './x-mission.module.css';
export const missionSlug = 'x-mission-1113';
const countSchema = z.object({ likeCount: z.number().int().nonnegative() });
const statusSchema = z.object({ reaction: reactionResultSchema.nullable() });
const copy = {
 ko: { title: 'KYAA X 이벤트', steps: ['이벤트 페이지 접속', 'Google로 로그인', '좋아요 누르기'], login: 'Google로 로그인', like: '좋아요', done: '미션 완료', count: '좋아요', error: '이벤트를 불러오지 못했어요. 다시 시도해 주세요.', retry: '다시 시도', saveError: '좋아요를 저장하지 못했어요. 다시 시도해 주세요.' },
 en: { title: 'KYAA X Event', steps: ['Visit this event page', 'Sign in with Google', 'Like this page'], login: 'Continue with Google', like: 'Like', done: 'Mission complete', count: 'Likes', error: 'Couldn’t load the event. Please try again.', retry: 'Try again', saveError: 'Couldn’t save your like. Please try again.' },
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
 const [completed, setCompleted] = useState(false), [loaded, setLoaded] = useState(false);
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
   setCompleted(true);
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
 return <main className={styles.event} lang={locale}>
  <nav className={styles.languages} aria-label="Language"><a href={languageHref('en')} lang="en" aria-current={locale === 'en' ? 'page' : undefined}>EN</a><a href={languageHref('ko')} lang="ko" aria-current={locale === 'ko' ? 'page' : undefined}>한국어</a></nav>
  {inX && <FanAction onClick={openBrowser}>{locale === 'ko' ? '브라우저로 열기' : 'Open in browser'}</FanAction>}
  {browserNotice && <FanText as="p" role="body">{locale === 'ko' ? 'X 메뉴에서 ‘브라우저에서 열기’를 선택해 주세요.' : 'Choose “Open in browser” from the X menu.'}</FanText>}
  <FanSurface className={styles.sheet} data-block="x-mission">
   <FanText role="label">KYAA × X</FanText>
   <FanHeading as="h1" variant="editorial">{t.title}</FanHeading>
   <div className={styles.heart} aria-hidden="true"><Heart size={64} strokeWidth={1.5} /></div>
   <ol className={styles.steps}>{t.steps.map((step, index) => <li data-row="mission-step" key={step} aria-current={!completed && index === (authenticated ? 2 : 1) ? 'step' : undefined}><FanText role="meta">0{index + 1}</FanText><FanText role="body">{step}</FanText>{(index === 0 || index === 1 && authenticated || completed) && <Check size={20} strokeWidth={1.5} aria-hidden="true" />}</li>)}</ol>
   <div className={styles.result} role="status" aria-live="polite">{completed && <FanHeading>{t.done}</FanHeading>}{count !== undefined && <FanText role="meta">{t.count} · {new Intl.NumberFormat(locale).format(count)}</FanText>}</div>
   {error && <FanText as="p" role="body" aria-live="assertive">{error === 'load' ? t.error : t.saveError}</FanText>}
   {error === 'load' ? <FanAction onClick={() => setRetry(value => value + 1)}>{t.retry}</FanAction> : !authenticated ? <FanAction href={loginHref} onClick={beginLogin} variant={primary} fullWidth>{t.login}</FanAction> : <FanAction onClick={like} variant={primary} fullWidth disabled={!ready || !loaded || completed || pending} loading={pending} leadingIcon={<Heart size={20} strokeWidth={1.5} />}>{completed ? t.done : t.like}</FanAction>}
  </FanSurface>
 </main>;
}
