import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { XMission } from '../s/x/x-mission';
import { followEventSlug, followMission } from './follow-event';
const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: 'one' }, getAccessToken: vi.fn(async () => 'token') }));
vi.mock('@/features/auth/client/cognito-auth', () => ({ useByUsAuth: () => auth }));
const result = { reactionId:'00000000-0000-4000-8000-000000000001', status:'completed', mintStatus:'queued', blockchainJobId:null, created:true, passportExists:false };
let completed = false;
beforeEach(() => {
 completed = false; auth.authenticated = true;
 vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
  if (url === '/api/me/profile') return Response.json({ profile: { nickname: 'Mina' } });
  if (url.includes('/fans')) return Response.json({ likeCount: completed ? 1 : 0 });
  if (init?.method === 'POST') { completed = true; return Response.json(result); }
  return Response.json({ reaction: completed ? result : null });
 }));
});
afterEach(() => vi.unstubAllGlobals());
it('records the opening event like on its own event page, not the 11/13 mission page', async () => {
 render(<XMission locale="ko" mission={followMission} />);
 expect(screen.getByRole('heading', { name: 'X 오픈 이벤트' })).toBeTruthy();
 expect(screen.getByText('X에서 @kyaa_app 팔로우')).toBeTruthy();
 const button = screen.getByRole('button', { name: '좋아요' });
 await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
 await screen.findByRole('heading', { name: '도장 쾅! 이벤트 참여 완료' });
 const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url)).filter(url => url.startsWith('/api/celebrities/'));
 expect(urls.every(url => url.startsWith(`/api/celebrities/${followEventSlug}/`))).toBe(true);
 expect(screen.getByRole('button', { name: '참여 완료' })).toBeDisabled();
});
it('does not tick the X follow and repost steps before the like', async () => {
 render(<XMission locale="ko" mission={followMission} />);
 await waitFor(() => expect(screen.getByRole('button', { name: '좋아요' })).not.toBeDisabled());
 expect(screen.getByText('0', { exact: true })).toBeTruthy();
});
it('sends guests to /login and back to /follow', async () => {
 window.history.replaceState({}, '', '/follow?utm_source=x');
 auth.authenticated = false; render(<XMission locale="ko" mission={followMission} />);
 const link = await screen.findByRole('link', { name: '로그인' });
 const url = new URL(link.getAttribute('href')!, 'https://kyaa.io');
 expect(url.pathname).toBe('/login');
 expect(url.searchParams.get('returnTo')).toBe('/follow?utm_source=x&locale=ko');
});
it('hides a zero like count and draws the X follow and repost steps with their own art', async () => {
 const { container } = render(<XMission locale="ko" mission={followMission} />);
 await waitFor(() => expect(screen.getByRole('button', { name: '좋아요' })).not.toBeDisabled());
 expect(screen.getByRole('status').textContent).toBe('');
 const art = [...container.querySelectorAll('[data-row="mission-step"] img')].map(img => img.getAttribute('src'));
 expect(art).toEqual(['/images/my/shortcuts/reports.webp', '/images/my/shortcuts/friends.webp']);
});
