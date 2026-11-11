import { afterEach, expect, it, vi } from 'vitest';
import { AuthError } from '@/features/auth/domain/auth-errors';
const { authorize, createLink } = vi.hoisted(() => ({ authorize: vi.fn(), createLink: vi.fn() }));
vi.mock('@/server/fanpage/dependencies', () => ({ createFanpageDependencies: () => ({ authorize }) }));
vi.mock('@/server/signup-event/sharing', () => ({ createLocalShareLink: createLink }));
import { POST } from './route';
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it('rejects production without accessing authentication or storage', async () => {
 vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL', '1');
 expect((await POST(new Request('http://localhost/api/signup-event/share', { method: 'POST' }))).status).toBe(404);
 expect(authorize).not.toHaveBeenCalled(); expect(createLink).not.toHaveBeenCalled();
});
it('requires authentication before issuing a local share link', async () => {
 vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL', '1');
 authorize.mockRejectedValue(new AuthError('AUTHENTICATION_REQUIRED', 401, 'required'));
 expect((await POST(new Request('http://localhost/api/signup-event/share', { method: 'POST' }))).status).toBe(401);
 expect(createLink).not.toHaveBeenCalled();
});
it('issues the link for the verified actor rather than a client supplied owner', async () => {
 vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL', '1'); authorize.mockResolvedValue({ appUserId: 'verified-owner' }); createLink.mockResolvedValue('local-token');
 const response = await POST(new Request('http://localhost/api/signup-event/share', { method: 'POST', headers: { authorization: 'Bearer local' }, body: JSON.stringify({owner: 'other'}) }));
 expect(response.status).toBe(200); expect(authorize).toHaveBeenCalledWith('Bearer local'); expect(createLink).toHaveBeenCalledWith('verified-owner');
 expect(await response.json()).toEqual({href: '/signup-event/r?token=local-token'});
});
