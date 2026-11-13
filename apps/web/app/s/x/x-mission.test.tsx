import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { XMission } from './x-mission';
const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: 'one' }, getAccessToken: vi.fn(async () => 'token') }));
vi.mock('@/features/auth/client/cognito-auth', () => ({ useByUsAuth: () => auth }));
const result = { reactionId:'00000000-0000-4000-8000-000000000001', status:'completed', mintStatus:'queued', blockchainJobId:null, created:true, passportExists:false };
let completed = false;
beforeEach(() => {
 completed = false; auth.authenticated = true; auth.user.id = 'one';
 vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
  if (url.includes('/fans')) return Response.json({ likeCount: completed ? 8 : 7 });
  if (init?.method === 'POST') { completed = true; return Response.json(result); }
  return Response.json({ reaction: completed ? result : null });
 }));
});
afterEach(() => vi.unstubAllGlobals());
it('records a like, refreshes server count, and prevents repeat submission', async () => {
 render(<XMission locale="en" />);
 const button = screen.getByRole('button', {name:'Like'});
 await waitFor(() => expect(button).not.toBeDisabled()); fireEvent.click(button);
 await screen.findByRole('heading', {name:'Mission complete'});
 await screen.findByText('Likes · 8');
 expect(screen.getByRole('button', {name:'Mission complete'})).toBeDisabled();
 expect(vi.mocked(fetch).mock.calls.filter(([,init]) => init?.method === 'POST')).toHaveLength(1);
});
it('restores a previously completed mission', async () => {
 completed = true; render(<XMission locale="ko" />);
 await screen.findByRole('heading', {name:'미션 완료'});
 expect(screen.getByRole('button', {name:'미션 완료'})).toBeDisabled();
});
it('uses Google OAuth with the same localized returnTo for guests', async () => {
 window.history.replaceState({}, '', '/s/x?locale=en&utm_source=x');
 auth.authenticated = false; render(<XMission locale="en" />);
 const link = await screen.findByRole('link', {name:'Continue with Google'});
 const url = new URL(link.getAttribute('href')!, 'https://kyaa.io');
 expect(url.searchParams.get('provider')).toBe('google');
 expect(url.searchParams.get('returnTo')).toBe('/s/x?locale=en&utm_source=x');
});
it('does not invent completion or count when the event data is unavailable', async () => {
 vi.stubGlobal('fetch', vi.fn(async () => new Response(null, {status:404})));
 render(<XMission locale="en" />);
 await screen.findByText('Couldn’t load the event. Please try again.');
 expect(screen.queryByText(/Likes ·/)).toBeNull();
 expect(screen.queryByRole('heading', {name:'Mission complete'})).toBeNull();
 expect(screen.queryByRole('button', {name:'Like'})).toBeNull();
});

it('preserves KoL attribution, flow start and hash when switching language', async () => {
 window.history.replaceState({}, '', '/s/x?utm_source=x&utm_medium=kol&utm_campaign=kol-1113&utm_content=kol01&x_started=2026-11-13T07%3A00%3A00.000Z#steps');
 auth.authenticated=false; render(<XMission locale="en" />);
 const link=screen.getByRole('link',{name:'한국어'});
 await waitFor(()=>expect(link.getAttribute('href')).toContain('utm_content=kol01'));
 const url=new URL(link.getAttribute('href')!, 'https://kyaa.io/s/x');
 expect(url.searchParams.get('locale')).toBe('ko'); expect(url.searchParams.get('utm_source')).toBe('x');
 expect(url.searchParams.get('x_started')).toBe('2026-11-13T07:00:00.000Z'); expect(url.hash).toBe('#steps');
});
