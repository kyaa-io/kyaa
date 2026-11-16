import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FollowMission } from './follow-mission';
import { followEvent, followEventSlug, followPostIntent } from './follow-event';
import { gleamLoaderSrc } from './gleam-widget';
const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: 'one' }, getAccessToken: vi.fn(async () => 'token') }));
vi.mock('@/features/auth/client/cognito-auth', () => ({ useByUsAuth: () => auth }));
const result = { reactionId:'00000000-0000-4000-8000-000000000001', status:'completed', mintStatus:'queued', blockchainJobId:null, created:true, passportExists:false };
let completed = false, likes = 0;
beforeEach(() => {
 completed = false; likes = 0; auth.authenticated = true;
 vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
  if (url === '/api/me/profile') return Response.json({ profile: { nickname: 'Mina' } });
  if (url.includes('/fans')) return Response.json({ likeCount: likes + (completed ? 1 : 0) });
  if (init?.method === 'POST') { completed = true; return Response.json(result); }
  return Response.json({ reaction: completed ? result : null });
 }));
});
afterEach(() => vi.unstubAllGlobals());
it('records the opening event like on its own event page and stamps the like card', async () => {
 const { container } = render(<FollowMission locale="ko" event={followEvent} />);
 expect(screen.getByRole('heading', { name: 'X 오픈 이벤트' })).toBeTruthy();
 expect(screen.getByText('X에서 팔로우·리포스트')).toBeTruthy();
 const button = screen.getByRole('button', { name: '좋아요' });
 await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
 await screen.findByRole('heading', { name: '참여 완료' });
 expect(screen.getByText('03 · 도장 쾅!')).toBeTruthy();
 expect(screen.getByRole('img', { name: '좋아요 완료' })).toBeTruthy();
 const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url)).filter(url => url.startsWith('/api/celebrities/'));
 expect(urls.every(url => url.startsWith(`/api/celebrities/${followEventSlug}/`))).toBe(true);
 expect(container.querySelector('[data-mission="like"]')!.hasAttribute('data-done')).toBe(true);
 expect(screen.getByText('Mina')).toBeTruthy();
 // 날짜 옆에 시:분(24시간)이 붙는다
 expect(container.querySelector('[data-block="follow-stamp"] time')!.textContent).toMatch(/\d{4}년 \d{1,2}월 \d{1,2}일 \d{2}:\d{2}$/);
 // 좋아요 뒤 버튼은 캡처를 올릴 X 글쓰기로 바뀐다
 expect(screen.queryByRole('button', { name: '좋아요' })).toBeNull();
 expect(screen.getByRole('link', { name: 'X에 올리기' }).getAttribute('href')).toBe(followPostIntent('ko'));
});
it('embeds the published Gleam competition with the official loader, outside the UTM decorator', () => {
 const { container } = render(<FollowMission locale="ko" event={followEvent} />);
 const box = container.querySelector('[data-block="gleam-widget"]')!;
 const anchor = box.querySelector('a')!;
 expect(anchor.className).toContain('e-widget');
 expect(anchor.className).toContain('no-button');
 expect(anchor.getAttribute('href')).toBe('https://gleam.io/yAet3/kyaa-x-opening-event');
 expect(anchor.dataset.outboundTracking).toBe('off');
 expect(box.querySelector('script')!.getAttribute('src')).toBe(gleamLoaderSrc);
});
it('does not tick the like card before the like and never ticks the X card itself', async () => {
 const { container } = render(<FollowMission locale="ko" event={followEvent} />);
 await waitFor(() => expect(screen.getByRole('button', { name: '좋아요' })).not.toBeDisabled());
 expect(container.querySelector('[data-mission="like"]')!.hasAttribute('data-done')).toBe(false);
 expect(container.querySelector('[data-mission="x"] svg')).toBeNull();
});
it('sends guests to /login and back to /follow', async () => {
 window.history.replaceState({}, '', '/follow?utm_source=x');
 auth.authenticated = false; render(<FollowMission locale="ko" event={followEvent} />);
 const link = await screen.findByRole('link', { name: '로그인' });
 const url = new URL(link.getAttribute('href')!, 'https://kyaa.io');
 expect(url.pathname).toBe('/login');
 expect(url.searchParams.get('returnTo')).toBe('/follow?utm_source=x&locale=ko');
});
it('hides a zero like count, shows a real one before the like, then swaps it for the stamp line', async () => {
 const first = render(<FollowMission locale="en" event={followEvent} />);
 await waitFor(() => expect(screen.getByRole('button', { name: 'Like' })).not.toBeDisabled());
 expect(screen.queryByText(/Likes ·/)).toBeNull();
 first.unmount(); likes = 2;
 render(<FollowMission locale="en" event={followEvent} />);
 expect(await screen.findByText('Likes · 2')).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Like' }));
 await screen.findByRole('heading', { name: 'You’re in' });
 expect(screen.queryByText(/Likes ·/)).toBeNull();
 expect(screen.getByRole('img', { name: 'Like done' })).toBeTruthy();
});
it('writes the X post with the event handle and the production event link', () => {
 const url = new URL(followPostIntent('en'));
 expect(url.origin + url.pathname).toBe('https://x.com/intent/post');
 expect(url.searchParams.get('text')).toBe('I joined the KYAA × X Opening Event @kyaa_app');
 expect(url.searchParams.get('url')).toBe('https://kyaa.io/follow');
});
