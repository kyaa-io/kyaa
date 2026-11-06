// 합성 화면: 운영 관리의 행사·선물·신고·공지·설정 탭과 관리자 승인 불가 표시를 390·1440, ko·en으로 촬영한다. 운영 증거 아님.
// 사용: node manage-run.mjs OUT_DIR
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
  server: { host: '127.0.0.1', port: 4193, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const pageId = 'e9910000-0000-4000-8000-000000000001', eventId = 'e9910000-0000-4000-8000-000000000002';
const base = { id: eventId, title: '[합성] 11월 정기 러닝', description: '반포 한강공원에서 출발해 5km를 함께 달립니다.', imageUrl: null, startsAt: '2026-11-21T01:00:00Z', endsAt: '2026-11-21T03:00:00Z', opensAt: '2026-11-07T00:00:00Z', closesAt: '2026-11-20T15:00:00Z', location: '반포 한강공원 달빛광장', capacity: 30, requiresApproval: true, state: 'published', revision: 2, official: false, entryStatus: 'none', ticketAvailable: false, linkedMissionId: null, approvalStatus: 'pending', approvalReason: null };
const longTitle = '[합성] 제목이 아주 길어서 두 줄 이상으로 넘어가는 겨울맞이 필름 카메라 야간 출사와 현상 체험 행사';
const events = [base, { ...base, id: 'e9910000-0000-4000-8000-000000000003', title: longTitle, approvalStatus: 'rejected', approvalReason: '장소가 불분명합니다. 정확한 집결지를 적어 다시 저장해 주세요.' }, { ...base, id: 'e9910000-0000-4000-8000-000000000004', title: '[합성] 승인된 행사', approvalStatus: 'approved' }, { ...base, id: 'e9910000-0000-4000-8000-000000000005', title: '[합성] 임시 저장 행사', state: 'draft' }];
const post = n => ({ id: `e9910000-0000-4000-8000-00000000010${n}`, pageId, title: `[합성] 운영진 공지 ${n}`, body: '본문입니다. 곧 지웁니다.', visibility: 'public', anonymous: false, profileId: null, nickname: '운영', avatarUrl: null, createdAt: '2026-11-05T00:00:00Z' });
const gift = { id: 'e9910000-0000-4000-8000-000000000201', pageId, pageName: '[합성] 한강 러닝 모임', name: '[합성] 러닝 양말', imageAssetId: 'e9910000-0000-4000-8000-000000000202', imageUrl: '/images/avatars/star-pink.png', quantity: 10, providerName: '[합성] 제공사', fulfillmentMethod: 'on_site_pickup', fulfillmentDescription: '현장 수령', conditions: '', status: 'submitted', revision: 1, reason: null, reservedQuantity: 0, availableQuantity: 10, createdAt: '2026-11-02T09:00:00Z', updatedAt: '2026-11-02T09:00:00Z', reviewedAt: null };
const queue = [{ id: eventId, pageId, pageName: '[합성] 한강 러닝 모임', title: base.title, description: base.description, startsAt: base.startsAt, endsAt: base.endsAt, opensAt: base.opensAt, closesAt: base.closesAt, location: base.location, capacity: 30, requiresApproval: false, linkedMissionTitle: null, revision: 2, submittedAt: '2026-11-06T00:00:00Z', creatorName: null, creatorRole: 'manager', imageUrl: null }];
const scenes = {
  'events-list': { q: 'view=manage&section=events' },
  'events-form': { q: 'view=manage&section=events', act: async p => { await p.getByRole('button', { name: /행사 만들기|Create event/ }).click(); } },
  'events-form-open': { q: 'view=manage&section=events', act: async p => { await p.getByRole('button', { name: /행사 만들기|Create event/ }).click(); await p.locator('[name=title]').fill(longTitle); await p.locator('[name=startsAt]').fill('2027-01-10T10:00'); await p.locator('[name=description]').fill('집결은 반포 한강공원 달빛광장입니다.\n우천 시 실내 프로그램으로 바꿉니다.\n준비물은 운동화와 물입니다.'); await p.evaluate(() => { for (const node of document.querySelectorAll('form details')) node.open = true; }); } },
  'gifts': { q: 'view=manage&section=gifts' }, 'gifts-new': { q: 'view=manage&section=gifts', act: async p => { await p.getByRole('button', { name: /새 선물 신청|New/ }).click(); } },
  'reports-empty': { q: 'view=manage&section=reports' }, 'notices': { q: 'view=manage&section=notices' },
  'notices-form': { q: 'view=manage&section=notices', act: async p => { await p.getByRole('button', { name: /공지 쓰기|Write/ }).click(); } },
  'settings': { q: 'view=manage&section=settings' }, 'event-lifecycle': { q: 'view=event' },
  'event-edit': { q: 'view=event', act: async p => { await p.getByRole('button', { name: /운영 관리|Manage/ }).first().click(); await p.locator('[name=capacity]').fill('50'); } },
  'admin-blocked': { q: 'view=admin', role: 'manager' },
};
const browser = await chromium.launch({ headless: true });
for (const locale of ['ko', 'en']) for (const w of [390, 1440]) for (const [name, scene] of Object.entries(scenes)) {
  if (locale === 'en' && !['events-form-open', 'gifts', 'settings', 'admin-blocked'].includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/api/**', route => { const u = new URL(route.request().url()), m = u.pathname, J = json => route.fulfill({ json });
    if (m.endsWith('/event-approvals')) return J({ items: queue, nextCursor: null });
    if (m.endsWith('/gift-applications')) return J({ items: [gift], nextCursor: null });
    if (m.endsWith('/missions')) return J({ missions: [], canManage: true, nextCursor: null });
    if (m.endsWith('/events')) return J({ events, canManage: true, nextCursor: null });
    if (m.endsWith('/events/' + eventId)) return J({ event: { ...base, approvalStatus: 'approved' }, participation: { status: 'none', ticketId: null, participantName: null, checkedInAt: null }, canApply: false, canReview: false, canManage: true, review: null });
    if (m.endsWith('/reports')) return J({ items: [], nextCursor: null });
    if (m.endsWith('/posts')) return J({ items: [post(1), post(2)], nextCursor: null });
    if (m === `/api/groups/${pageId}`) return J({ page: { id: pageId, kind: 'hobby', celebrityId: null, slug: null, name: '[합성] 한강 러닝 모임', description: '', imageUrl: null, question: null, anonymous: false, memberCount: 3 }, membership: { role: scene.role ?? 'owner', joinedAt: '2026-11-01T00:00:00Z' }, bookmarked: false });
    if (/\/api\/admin\/(me|session)|admin\/role/.test(m)) return J({ role: 'admin', appUserId: pageId, allowlistId: pageId });
    return route.fulfill({ status: 404, json: { error: { code: 'X' } } }); });
  await page.goto(`http://127.0.0.1:4193/?${scene.q}&locale=${locale}`); await page.waitForTimeout(1000);
  try { if (scene.act) await scene.act(page); } catch (error) { errs.push(String(error).slice(0, 160)); }
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  await page.screenshot({ path: path.join(out, `${name}-${locale}-${w}.png`), fullPage: true });
  console.log(locale, w, name, JSON.stringify(info), errs.join('|').slice(0, 200));
  await ctx.close();
}
await browser.close(); await server.close();
