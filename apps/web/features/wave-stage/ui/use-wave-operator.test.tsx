import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWaveOperator } from './use-wave-operator';
const id = '11111111-1111-4111-8111-111111111111';
const command = { commandId: '22222222-2222-4222-8222-222222222222', requestId: '33333333-3333-4333-8333-333333333333', operation: 'bingo-stamp' as const, participantId: id };
const person = { id, name: '참가자', createdAt: '2026-10-22T00:00:00Z', quizCorrectAt: null, bingoCompletedAt: null, stamps: [] };
const onsite = { draw: null, entryCount: 1, results: [] };
afterEach(() => vi.restoreAllMocks());
it('executes the existing authorized stamp API and only confirms its matching response', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') return Response.json({ id, bingoCompletedAt: '2026-10-22T00:00:00Z' });
    return Response.json(String(url).includes('participants') ? { participants: [{ ...person, email: 'PRIVATE EMAIL', token: 'PRIVATE TOKEN' }], nextCursor: null } : onsite);
  });
  const { result, unmount } = renderHook(() => useWaveOperator({ enabled: true, role: 'admin', getAccessToken: async () => 'PRIVATE TOKEN', drawLive: vi.fn(), readLive: async () => null }));
  await waitFor(() => expect(result.current.operator.ready).toBe(true));
  expect(JSON.stringify(result.current.operator)).not.toContain('PRIVATE');
  let status: unknown;
  await act(async () => { status = await result.current.execute(command); });
  expect(status).toEqual({ status: 'confirmed' });
  const writes = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(writes[0]![0]).toBe(`/api/admin/kyaa-wave-participants/${id}/bingo-stamp`);
  expect(writes[0]![1]?.headers).toMatchObject({ authorization: 'Bearer PRIVATE TOKEN' });
  unmount();
});
it('reconciliation only reads and absence stays uncertain; viewer never writes', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => Response.json(String(url).includes('participants') ? { participants: [person], nextCursor: null } : onsite));
  const props = { enabled: true, role: 'admin', getAccessToken: async () => 'token', drawLive: vi.fn(), readLive: async () => null };
  const { result, rerender, unmount } = renderHook(({ role }) => useWaveOperator({ ...props, role }), { initialProps: { role: 'admin' } });
  await waitFor(() => expect(result.current.operator.ready).toBe(true));
  let outcome: unknown;
  await act(async () => { outcome = await result.current.execute(command, true); });
  expect(outcome).toEqual({ status: 'uncertain' });
  rerender({ role: 'viewer' });
  await act(async () => { outcome = await result.current.execute(command); });
  expect(outcome).toEqual({ status: 'rejected' });
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  unmount();
});
it('disconnect while authentication is pending never starts a late mutation', async () => {
  let resolveToken: (token: string) => void;
  let stalled = false;
  const getAccessToken = () => stalled ? new Promise<string>(resolve => { resolveToken = resolve; }) : Promise.resolve('token');
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => Response.json(String(url).includes('participants') ? { participants: [person], nextCursor: null } : onsite));
  const { result, rerender, unmount } = renderHook(({ enabled }) => useWaveOperator({ enabled, role: 'admin', getAccessToken, drawLive: vi.fn(), readLive: async () => null }), { initialProps: { enabled: true } });
  await waitFor(() => expect(result.current.operator.ready).toBe(true));
  stalled = true;
  let pending: ReturnType<typeof result.current.execute>;
  await act(async () => { pending = result.current.execute(command); await Promise.resolve(); });
  rerender({ enabled: false });
  await act(async () => { resolveToken!('late-token'); await pending; });
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  unmount();
});
it('explicit retry after an uncommitted failure reuses the same API request ID', async () => {
  let writes = 0;
  const draw = { id: '44444444-4444-4444-8444-444444444444', executedAt: '2026-10-22T00:00:00Z', revealedThrough: 0 };
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') {
      writes++;
      if (writes === 1) throw Error('not dispatched');
      return Response.json({ ...onsite, draw });
    }
    return Response.json(String(url).includes('participants') ? { participants: [person], nextCursor: null } : onsite);
  });
  const { result, unmount } = renderHook(() => useWaveOperator({ enabled: true, role: 'admin', getAccessToken: async () => 'token', drawLive: vi.fn(), readLive: async () => null }));
  await waitFor(() => expect(result.current.operator.ready).toBe(true));
  const execute = { commandId: command.commandId, requestId: command.requestId, operation: 'onsite-execute' as const };
  let outcome: unknown;
  await act(async () => { outcome = await result.current.execute(execute); });
  expect(outcome).toEqual({ status: 'uncertain' });
  expect(writes).toBe(1);
  await act(async () => { outcome = await result.current.execute(execute, false, true); });
  expect(outcome).toEqual({ status: 'confirmed' });
  const bodies = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)));
  expect(bodies).toEqual([{ requestId: command.requestId }, { requestId: command.requestId }]);
  unmount();
});
it('explicit retry after a committed lost response confirms by read without drawing twice', async () => {
  let committed = false;
  const draw = { id: '44444444-4444-4444-8444-444444444444', executedAt: '2026-10-22T00:00:00Z', revealedThrough: 0 };
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (init?.method === 'POST') { committed = true; throw Error('response lost'); }
    return Response.json(String(url).includes('participants') ? { participants: [person], nextCursor: null } : { ...onsite, draw: committed ? draw : null });
  });
  const { result, unmount } = renderHook(() => useWaveOperator({ enabled: true, role: 'admin', getAccessToken: async () => 'token', drawLive: vi.fn(), readLive: async () => null }));
  await waitFor(() => expect(result.current.operator.ready).toBe(true));
  const execute = { commandId: command.commandId, requestId: command.requestId, operation: 'onsite-execute' as const };
  let outcome: unknown;
  await act(async () => { outcome = await result.current.execute(execute); });
  expect(outcome).toEqual({ status: 'uncertain' });
  await act(async () => { outcome = await result.current.execute(execute, false, true); });
  expect(outcome).toEqual({ status: 'confirmed' });
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  unmount();
});
