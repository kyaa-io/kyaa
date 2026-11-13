import { afterEach, expect, it, vi } from 'vitest';
import { AuthError } from '@/features/auth/domain/auth-errors';
import { signupRaffleResultSchema } from '@/server/signup-event/result';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), read: vi.fn(), rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/server/fanpage/dependencies', () => ({ createFanpageDependencies: () => ({ authorize: mocks.authorize }) }));
vi.mock('@/server/signup-event/database', async original => ({ ...await original<typeof import('@/server/signup-event/database')>(), createSignupRaffleDatabase: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/server/signup-event/local', async original => ({ ...await original<typeof import('@/server/signup-event/local')>(), readLocalSnapshot: mocks.read }));
import { GET } from './route';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const me = id(99);
const stored = (winners: string[]) => ({ data: { created: false, seedSha256: 'a'.repeat(64), drawnAt: '2026-12-01T01:00:00Z', winners: winners.map(userId => ({ userId, entries: 2 })) }, error: null });
const snapshot = (entered: boolean) => ({ users: [{ id: me, createdAt: '2026-11-11T00:00:00Z' }], entries: entered ? [{ userId: me, enteredAt: '2026-11-12T00:00:00Z' }] : [], actions: [] });
const call = async () => { const response = await GET(new Request('http://localhost', { headers: { authorization: 'Bearer t' } })); return { status: response.status, body: response.status === 200 ? signupRaffleResultSchema.parse(await response.json()) : null, cache: response.headers.get('cache-control') }; };
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it('is hidden when the raffle is off and needs a signed-in member', async () => {
  vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE', 'false');
  expect((await call()).status).toBe(404);
  vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE', 'true');
  mocks.authorize.mockRejectedValue(new AuthError('AUTHENTICATION_REQUIRED', 401, 'required'));
  expect((await call()).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('answers pending until a draw is stored, and never draws by itself', async () => {
  vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE', 'true');
  mocks.authorize.mockResolvedValue({ appUserId: me });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  expect(await call()).toEqual({ status: 200, body: { state: 'pending' }, cache: 'private, no-store' });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('read_signup_raffle_draw', expect.anything());
  expect(mocks.read).not.toHaveBeenCalled();
});

it('gives the prize of my place in the stored winners and nothing about other winners', async () => {
  vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE', 'true');
  mocks.authorize.mockResolvedValue({ appUserId: me });
  mocks.rpc.mockResolvedValue(stored([me, id(1), id(2)]));
  expect((await call()).body).toEqual({ state: 'won', usd: 100 });
  mocks.rpc.mockResolvedValue(stored([id(1), id(2), me]));
  expect((await call()).body).toEqual({ state: 'won', usd: 50 });
  mocks.rpc.mockResolvedValue(stored([...Array.from({ length: 16 }, (_, i) => id(i + 1)), me]));
  expect((await call()).body).toEqual({ state: 'won', usd: 10 });
  expect(mocks.read).not.toHaveBeenCalled();
});

it('tells an entrant who was not drawn apart from someone who never entered', async () => {
  vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE', 'true');
  mocks.authorize.mockResolvedValue({ appUserId: me });
  mocks.rpc.mockResolvedValue(stored([id(1)]));
  mocks.read.mockResolvedValue(snapshot(true));
  expect((await call()).body).toEqual({ state: 'lost' });
  expect(mocks.read).toHaveBeenCalledWith(me);
  mocks.read.mockResolvedValue(snapshot(false));
  expect((await call()).body).toEqual({ state: 'not-entered' });
});

it('fails closed when the stored draw cannot be read', async () => {
  vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE', 'true');
  mocks.authorize.mockResolvedValue({ appUserId: me });
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
  expect((await call()).status).toBe(503);
});
