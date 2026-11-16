'use client';
import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { z } from 'zod';
import type { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { reactionResultSchema } from '@/features/reaction/domain/reaction';
import { externalBrowserUrl } from '@/components/login-browser-policy';
import { fanLoginHref } from '@/components/login-href';
import { recordClientProductEvent, pageViewIdempotencyKey } from '@/features/analytics/client/product-event-client';
import { isXBrowser, missionAttribution } from './mission-context';

const countSchema = z.object({ likeCount: z.number().int().nonnegative() });
const statusSchema = z.object({ reaction: reactionResultSchema.nullable() });
const profileSchema = z.object({ profile: z.object({ nickname: z.string().nullable() }) });

/** 좋아요 한 번 = 참여 한 건인 이벤트 화면의 상태와 동작. 화면 모양은 쓰는 쪽(/s/x, /follow)이 정한다. */
export function useLikeMission({ locale, auth, slug, path, attributionKey, scrollOnComplete = true }: { locale: 'ko' | 'en'; auth: ReturnType<typeof useByUsAuth>; slug: string; path: string; attributionKey: string; scrollOnComplete?: boolean }) {
 const userId = auth.user?.id;
 const { getAccessToken, ready, authenticated } = auth;
 const [locationContext, setLocationContext] = useState({ search:'', hash:'' });
 useEffect(() => { setLocationContext({ search:window.location.search, hash:window.location.hash }); }, []);
 const languageHref = (value: 'ko' | 'en') => { const query = new URLSearchParams(locationContext.search); query.set('locale', value); return `?${query}${locationContext.hash}`; };
 const [inX, setInX] = useState(false), [browserNotice, setBrowserNotice] = useState(false);
 useEffect(() => { setInX(isXBrowser(navigator.userAgent)); }, []);
 const [count, setCount] = useState<number>();
 const [completed, setCompleted] = useState(false), [loaded, setLoaded] = useState(false), [celebrate, setCelebrate] = useState(false);
 const [error, setError] = useState<'load' | 'save'>(), [pending, setPending] = useState(false), [retry, setRetry] = useState(0);
 useEffect(() => {
  const controller = new AbortController();
  setLoaded(false); setError(undefined);
  void (async () => {
   try {
    const response = await fetch(`/api/celebrities/${slug}/fans?locale=${locale}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('count');
    const value = countSchema.parse(await response.json());
    let done = false;
    if (ready && authenticated) {
     const token = await getAccessToken(); if (!token) throw new Error('session');
     const response = await fetch(`/api/celebrities/${slug}/reactions`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal });
     if (!response.ok) throw new Error('status');
     done = statusSchema.parse(await response.json()).reaction !== null;
    }
    if (!controller.signal.aborted) { setCount(value.likeCount); setCompleted(done); setLoaded(true); }
   } catch { if (!controller.signal.aborted) setError('load'); }
  })();
  return () => controller.abort();
 }, [authenticated, getAccessToken, locale, ready, retry, slug]);
 const recordAttribution = useCallback(async () => {
  const properties = missionAttribution(window.location.search);
  if (!properties || !authenticated || !userId) return;
  const token = await getAccessToken(); if (!token) return;
  const idempotencyKey = await pageViewIdempotencyKey('creator_page_view', `${attributionKey}-${properties.kol}`, userId);
  await recordClientProductEvent({ eventName:'creator_page_view', source:'x_mission.identified', idempotencyKey, celebrityId:null, liveEventId:null, missionId:null, benefitId:null, properties }, token);
 }, [attributionKey, authenticated, userId, getAccessToken]);
 useEffect(() => { if (ready && authenticated) void recordAttribution().catch(() => {}); }, [ready, authenticated, recordAttribution]);
 async function like() {
  if (!loaded || pending || completed || !authenticated) return;
  setPending(true); setError(undefined);
  try {
   const token = await getAccessToken(); if (!token) throw new Error('session');
   const response = await fetch(`/api/celebrities/${slug}/reactions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
   if (!response.ok) throw new Error('like');
   reactionResultSchema.parse(await response.json());
   void recordAttribution().catch(() => {});
   setCompleted(true); setCelebrate(true);
   setRetry(value => value + 1);
  } catch { setError('save'); }
  finally { setPending(false); }
 }
 const returnTo = typeof window === 'undefined' ? `${path}?locale=${locale}` : `${path}${window.location.search}${window.location.hash}`;
 // 운영 로그인(Privy)은 /login 한 곳에서 시작한다. 로그인 뒤 이 화면으로 돌아오고, 유입 시각(x_started)을 붙인다
 function beginLogin(event: MouseEvent<HTMLAnchorElement>) {
  const target = new URL(returnTo, window.location.origin); target.searchParams.set('x_started', new Date().toISOString());
  event.currentTarget.href = fanLoginHref(locale, target.pathname + target.search + target.hash);
 }
 function openBrowser() {
  setBrowserNotice(true);
  // iOS X has no reliable universal external-browser handoff; keep the app-menu instruction visible.
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
  const target = externalBrowserUrl(navigator.userAgent, window.location.href);
  if (target) window.location.assign(target);
 }
 const loginHref = fanLoginHref(locale, returnTo);
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
 const [stampedAt, setStampedAt] = useState<string>();
 useEffect(() => {
  if (!completed || !userId) return;
  // 서버가 완료 시각을 주지 않으므로, 이 기기에서 처음 완료한 날을 기억한다. 없으면 오늘 날짜
  const key = `${slug}:stamped:${userId}`;
  let saved: string | null = null;
  try { saved = localStorage.getItem(key); if (!saved) { saved = new Date().toISOString(); localStorage.setItem(key, saved); } } catch { saved = new Date().toISOString(); }
  setStampedAt(saved);
 }, [completed, userId, slug]);
 const stampDate = new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(stampedAt ? new Date(stampedAt) : new Date());
 // 방금 완료한 때만: 도장 카드가 있는 맨 위로 올린다(도장이 버튼 자리에 찍히는 화면은 끈다)
 useEffect(() => { if (scrollOnComplete && celebrate && completed) window.scrollTo?.({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [scrollOnComplete, celebrate, completed]);
 return {
  ready, authenticated, loaded, completed, celebrate, pending, error, count, nickname, stampDate, inX, browserNotice, loginHref,
  like, beginLogin, openBrowser, languageHref, retryLoad: () => setRetry(value => value + 1),
 };
}
