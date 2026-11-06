// 합성 화면: 관리자 대기 목록과 운영자·참가자 행사 화면을 390·1440에서 촬영한다. 운영 증거 아님.
// 사용: node run.mjs OUT_DIR
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createServer } = await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
import { chromium } from '@playwright/test';
const here = import.meta.dirname, web = path.resolve(here, '../..'), root = path.resolve(web, '../..');
const out = process.argv[2]; await mkdir(out, { recursive: true });
const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), cacheDir: path.join(out, 'vite'), esbuild: { jsx: 'automatic' }, resolve: { alias: [
  { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, '../kyaa-wave-participation-local/privy.ts') },
  { find: /.*byus-session-provider$/, replacement: path.join(here, '../kyaa-wave-participation-local/session.ts') },
  { find: /.*use-admin-session$/, replacement: path.join(here, '../groups-local/admin.ts') },
  { find: '@', replacement: web }, { find: 'server-only', replacement: path.join(here, '../lounge-local/server-only.ts') },
  { find: 'next/navigation', replacement: path.join(here, '../artist-mark-local/navigation.ts') },
  { find: 'next/link', replacement: path.join(here, '../mission-local/next-link.tsx') }, { find: 'next/image', replacement: path.join(here, '../mission-local/next-image.tsx') }] },
  server: { host: '127.0.0.1', port: 4192, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const pageId = 'e9910000-0000-4000-8000-000000000001', eventId = 'e9910000-0000-4000-8000-000000000002';
const base = { id: eventId, title: '[합성] 11월 정기 러닝', description: '반포 한강공원에서 출발해 5km를 함께 달립니다.', imageUrl: null, startsAt: '2026-11-21T01:00:00Z', endsAt: '2026-11-21T03:00:00Z', opensAt: '2026-11-07T00:00:00Z', closesAt: '2026-11-20T15:00:00Z', location: '반포 한강공원 달빛광장', capacity: 30, requiresApproval: false, state: 'published', revision: 2, official: false, entryStatus: 'none', ticketAvailable: false, linkedMissionId: null, cancellationReason: null };
const longReason = '장소가 불분명합니다. 정확한 집결지와 우천 시 진행 여부를 적어 다시 저장해 주세요. '.repeat(3).trim();
const detail = (patch, extra = {}) => ({ event: { ...base, ...patch }, participation: { status: 'none', ticketId: null, participantName: null, checkedInAt: null }, canApply: false, canReview: false, canManage: false, review: null, ...extra });
const queue = [
  { id: eventId, pageId, pageName: '[합성] 한강 러닝 모임', title: '[합성] 11월 정기 러닝', description: base.description, startsAt: base.startsAt, endsAt: base.endsAt, opensAt: base.opensAt, closesAt: base.closesAt, location: base.location, capacity: 30, requiresApproval: false, linkedMissionTitle: null, revision: 2, submittedAt: '2026-11-06T00:00:00Z', creatorName: null, creatorRole: 'manager', imageUrl: '/images/avatars/star-pink.webp' },
  { id: 'e9910000-0000-4000-8000-000000000003', pageId, pageName: '[합성] 아주 긴 이름을 가진 필름 카메라 사진 산책 동호회 서울 지부', title: '[합성] 제목이 아주 길어서 두 줄 이상으로 넘어가는 겨울맞이 필름 카메라 야간 출사와 현상 체험 행사', description: '', startsAt: base.startsAt, endsAt: base.endsAt, opensAt: base.opensAt, closesAt: base.closesAt, location: '서울특별시 종로구 세종대로 사거리 인근 지하 전시장 2층 다목적실', capacity: null, requiresApproval: true, linkedMissionTitle: '[합성] 출사 사진 올리기', revision: 5, submittedAt: '2026-11-06T01:00:00Z', creatorName: '합성 소유자', creatorRole: 'owner', imageUrl: null }];
const scenes = {
  'admin-queue': { url: 'view=admin', api: () => ({ items: queue, nextCursor: null }) },
  'admin-queue-en': { url: 'view=admin', locale: 'en', api: () => ({ items: queue, nextCursor: null }) },
  'notifications': { url: 'view=notifications', api: () => ({ notifications: [{ id: 'e9910000-0000-4000-8000-000000000009', kind: 'group_event_reviewed', title: '행사 승인 검토가 끝났어요', detail: '결과를 확인해 주세요.', createdAt: '2026-11-06T01:00:00Z', readAt: null, deepLink: `/pages/groups/${pageId}/events/${eventId}` }], unreadCount: 1, nextCursor: null }) },
  'notifications-en': { url: 'view=notifications', locale: 'en', api: () => ({ notifications: [{ id: 'e9910000-0000-4000-8000-000000000009', kind: 'group_event_reviewed', title: 'Event review finished', detail: 'View the result.', createdAt: '2026-11-06T01:00:00Z', readAt: null, deepLink: `/pages/groups/${pageId}/events/${eventId}` }], unreadCount: 1, nextCursor: null }) },
  'owner-saved': { url: 'view=manage', manage: true, api: () => ({}) },
  'admin-empty': { url: 'view=admin', api: () => ({ items: [], nextCursor: null }) },
  'admin-error': { url: 'view=admin', fail: 503 },
  'operator-pending': { url: 'view=event', api: () => detail({ approvalStatus: 'pending', approvalReason: null }, { canManage: true }) },
  'operator-rejected': { url: 'view=event', api: () => detail({ approvalStatus: 'rejected', approvalReason: longReason }, { canManage: true }) },
  'member-hidden': { url: 'view=event', fail: 404, code: 'GROUP_ACTIVITY_NOT_FOUND' },
  'member-requeued': { url: 'view=event', api: () => detail({ approvalStatus: 'pending', approvalReason: null, entryStatus: 'confirmed', ticketAvailable: false }, { participation: { status: 'confirmed', ticketId: null, participantName: '합성 회원', checkedInAt: null } }) },
  'member-approved': { url: 'view=event', api: () => detail({ approvalStatus: 'approved', approvalReason: null }, { canApply: true }) },
};
const store = [];
const browser = await chromium.launch({ headless: true });
for (const w of [390, 1440]) for (const [name, scene] of Object.entries(scenes)) {
  const page = await (await browser.newContext({ viewport: { width: w, height: 900 } })).newPage(); const errs = [], asked = new Set();
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', route => { const u = new URL(route.request().url()); asked.add(u.pathname);
    if (scene.manage && u.pathname.endsWith('/missions')) return route.fulfill({ json: { missions: [], canManage: true, nextCursor: null } });
    if (scene.manage && u.pathname.endsWith('/events')) { if (route.request().method() === 'POST') { const b = route.request().postDataJSON(); const event = { ...base, title: b.title, state: b.state, approvalStatus: 'pending', approvalReason: null }; store.unshift(event); return route.fulfill({ json: { event } }); } return route.fulfill({ json: { events: store, canManage: true, nextCursor: null } }); }
    if (/\/api\/admin\/(me|session)|admin\/role/.test(u.pathname)) return route.fulfill({ json: { role: 'admin', appUserId: pageId, allowlistId: pageId } });
    if (!u.pathname.includes('event-approvals') && !u.pathname.endsWith('/events/' + eventId) && u.pathname !== '/api/notifications') return route.fulfill({ status: 404, json: { error: { code: 'GROUP_ACTIVITY_NOT_FOUND' } } });
    if (scene.fail) return route.fulfill({ status: scene.fail, json: { error: { code: scene.code ?? 'GROUP_ACTIVITY_UNAVAILABLE' } } });
    return route.fulfill({ json: scene.api() }); });
  await page.goto(`http://127.0.0.1:4192/?${scene.url}&locale=${scene.locale ?? 'ko'}&lang=${scene.locale ?? 'ko'}`); await page.waitForTimeout(1600);
  if (scene.manage) { store.length = 0; store.push({ ...base, id: 'e9910000-0000-4000-8000-000000000005', title: '[합성] 반려된 겨울 출사', approvalStatus: 'rejected', approvalReason: '[합성] 장소가 불분명합니다. 정확한 집결지를 적어 다시 저장해 주세요.' });
    for (const [n, v] of [['title', '[합성] 11월 정기 러닝'], ['location', '반포 한강공원'], ['startsAt', '2027-01-10T10:00'], ['endsAt', '2027-01-10T12:00'], ['opensAt', '2027-01-01T10:00'], ['closesAt', '2027-01-09T10:00']]) await page.fill(`[name="${n}"]`, v);
    await page.selectOption('[name="state"]', 'published'); await page.click('button[type=submit]'); await page.getByText('저장했어요.').waitFor(); await page.waitForTimeout(500); }
  const info = await page.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 170), overflow: document.documentElement.scrollWidth - innerWidth, approval: [...document.querySelectorAll('[data-event-approval]')].map(n => n.textContent), buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean).slice(0, 8) }));
  console.log(w, name, JSON.stringify(info), [...asked].join(','), errs.join('|').slice(0, 150));
  await page.screenshot({ path: path.join(out, `${name}-${w}.png`), fullPage: true });
  await page.context().close();
}
await browser.close(); await server.close(); process.exit(0);
