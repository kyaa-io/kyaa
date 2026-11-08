import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WAVE_PRIZES } from '../../features/fanpage/domain/wave-draw';
import { useWaveStage } from '../../features/wave-stage/ui/use-wave-stage';
import { useWaveOperator } from '../../features/wave-stage/ui/use-wave-operator';
import { useStageHostSource } from '../../features/wave-stage/ui/use-stage-host-source';
import { stageHostProjectionSchema, toStageHostProjection } from '../../features/wave-stage/domain/stage-host-projection';
import { completedStage, metricsFixture, stageFixture } from './fixture';
// @ts-expect-error The native console shares JavaScript React modules, without declarations.
import { useStageSession } from '../../../stage-console/src/session.js';
// @ts-expect-error The native console shares JavaScript React modules, without declarations.
import { OperatorControls } from '../../../stage-console/src/operator-controls.jsx';

const requireNative = createRequire(import.meta.url);
const nativeRoot = path.resolve(process.cwd(), '../stage-console');
const { startServer } = requireNative(path.join(nativeRoot, 'host/server.mjs'));
const { initialState } = requireNative(path.join(nativeRoot, 'host/state.mjs'));
const { certificate } = requireNative(path.join(nativeRoot, 'host/certificate.mjs'));
const NativeSocket = requireNative('ws');
const uuid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

it('runs the real controller, source hooks and host sockets against a persistent synthetic RSVP API', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-operator-integration-'));
  fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html>');
  const manifest = { cues: [{ id: 'operations', type: 'hold', label: '진행', script: ['운영자 전용 대본'] }] };
  const state = initialState(manifest);
  const originalFetch = globalThis.fetch;
  const host = await startServer({ state, manifest, bundle: directory, frontend: directory, tls: certificate(path.join(directory, 'tls')), validateProjection: (value: unknown) => stageHostProjectionSchema.parse(value), sourceOrigin: () => 'https://kyaa.io', setup: () => ({}) });
  const base = `http://127.0.0.1:${host.localPort}`;
  const pair = async (token: string) => {
    const response = await originalFetch(`${base}/api/pair`, { method: 'POST', body: JSON.stringify({ token }) });
    return response.headers.get('set-cookie')!.split(';')[0]!;
  };
  const controllerCookie = await pair(host.pairToken), audienceCookie = await pair(host.audienceToken);
  const sourceCredential = crypto.randomUUID();
  const people = ['테스트가온', '테스트나래', '테스트다온'].map((name, index) => ({
    id: uuid(20 + index), name, createdAt: stageFixture.asOf, quizCorrectAt: null as string | null, bingoCompletedAt: null as string | null,
    stamps: [] as Array<{ key: string; status: string; stampId: string }>,
    preferences: WAVE_PRIZES.slice(index, index + 3).map(prize => prize.key), missionCount: index + 2,
  }));
  let currentStage = structuredClone(stageFixture);
  let onsiteDraw: { id: string; executedAt: string; revealedThrough: number } | null = null;
  const hiddenResults = WAVE_PRIZES.map((prize, index) => ({ prizeKey: prize.key, winners: [{ nickname: `현장당첨${index + 1}`, avatarUrl: '/images/avatars/star-cream.webp' }] }));
  const posts: Array<{ path: string; body: Record<string, unknown> }> = [];
  const idempotency = new Map<string, string>();
  let liveExecutions = 0, onsiteExecutions = 0, loseExecuteResponse = true;
  let tokenGate: (() => void) | null = null, gateNextToken = false;
  const liveToken = async () => sourceCredential;
  const getAccessToken = () => gateNextToken ? new Promise<string>(resolve => {
    gateNextToken = false; tokenGate = () => resolve(sourceCredential);
  }) : Promise.resolve(sourceCredential);
  const onsiteResponse = () => ({ draw: onsiteDraw ? { ...onsiteDraw } : null, entryCount: people.length, results: onsiteDraw ? hiddenResults : [] });
  const api = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === '/api/state') return originalFetch(base + url, { ...init, headers: { Cookie: controllerCookie } });
    if (url.startsWith(base)) return originalFetch(input, init);
    if (url === '/api/public/live-dashboard') return Response.json(metricsFixture);
    if ((init?.headers as Record<string, string> | undefined)?.authorization !== `Bearer ${sourceCredential}`) return Response.json({}, { status: 401 });
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
      posts.push({ path: url, body });
      const participant = people.find(person => url.includes(person.id));
      if (participant && (url.endsWith('/quiz-stamp') || url.endsWith('/bingo-stamp'))) {
        const field = url.endsWith('/quiz-stamp') ? 'quizCorrectAt' : 'bingoCompletedAt';
        participant[field] = stageFixture.asOf;
        participant.stamps.push({ key: field === 'quizCorrectAt' ? 'quiz-correct' : 'bingo', status: 'queued', stampId: uuid(200 + posts.length) });
        return Response.json({ id: participant.id, [field]: participant[field] });
      }
      const requestId = String(body.requestId ?? body.idempotencyKey);
      const saved = idempotency.get(requestId);
      if (saved && saved !== JSON.stringify({ path: url, body })) return Response.json({}, { status: 409 });
      if (url === '/api/admin/wave-stage/draw') {
        if (!saved) { liveExecutions++; currentStage = completedStage(); currentStage.creators = currentStage.creators.map(creator => ({ ...creator, entryClosesAt: stageFixture.asOf, revision: creator.revision + 1 })); }
        idempotency.set(requestId, JSON.stringify({ path: url, body }));
        return Response.json({ stage: currentStage });
      }
      if (url === '/api/admin/kyaa-wave/draw') {
        if (!saved) { onsiteExecutions++; onsiteDraw = { id: uuid(300), executedAt: stageFixture.asOf, revealedThrough: 0 }; }
        idempotency.set(requestId, JSON.stringify({ path: url, body }));
        if (loseExecuteResponse) { loseExecuteResponse = false; throw Error('Synthetic committed response loss'); }
        return Response.json(onsiteResponse());
      }
      if (url === '/api/admin/kyaa-wave/draw/reveal') {
        if (!onsiteDraw || body.drawId !== onsiteDraw.id || (!saved && body.prizeIndex !== onsiteDraw.revealedThrough + 1)) return Response.json({}, { status: 409 });
        if (!saved) onsiteDraw.revealedThrough = Number(body.prizeIndex);
        idempotency.set(requestId, JSON.stringify({ path: url, body }));
        return Response.json(onsiteResponse());
      }
      return Response.json({}, { status: 404 });
    }
    if (url === '/api/admin/wave-stage') return Response.json({ stage: currentStage });
    if (url === '/api/admin/kyaa-wave-participants') return Response.json({ participants: people, nextCursor: null });
    if (url === '/api/admin/kyaa-wave/draw') return Response.json(onsiteResponse());
    return Response.json({}, { status: 404 });
  });
  const sourceFrames: string[] = [], audienceFrames: string[] = [];
  const createdSockets: InstanceType<typeof NativeSocket>[] = [];
  class BrowserSocket extends NativeSocket {
    constructor(url: string) {
      super(url, { headers: url.includes('/source?') ? { Origin: 'https://kyaa.io' } : { Origin: base, Cookie: controllerCookie } });
      createdSockets.push(this);
      this.on('message', (raw: Buffer) => { if (url.includes('/source?')) sourceFrames.push(String(raw)); });
    }
  }
  vi.stubGlobal('WebSocket', BrowserSocket);
  vi.stubGlobal('location', new URL(base));
  let live!: { session: ReturnType<typeof useStageSession>; bridge: ReturnType<typeof useStageHostSource> };
  const endpoint = `ws://127.0.0.1:${host.localPort}/source?token=${host.sourceToken}`;
  function Controller() {
    const session = useStageSession();
    live = { ...live, session };
    return <OperatorControls session={session} />;
  }
  function Source() {
    const [paired, setPaired] = useState(false);
    const stage = useWaveStage('synthetic-operator-owner', liveToken, paired);
    const operations = useWaveOperator({ enabled: paired, role: 'admin', getAccessToken, drawLive: stage.draw, readLive: stage.refresh });
    const bridge = useStageHostSource({ endpoint, authorized: true, operator: operations.operator, onOperator: operations.execute,
      projection: toStageHostProjection({ presentation: null, tiktok: null, stage: stage.stage, onsite: operations.onsite, scope: 'all', presentationFailed: false, tiktokFailed: false }), onScope() {}, onRefresh() {} });
    const { cancelDraw } = stage;
    useEffect(() => { setPaired(bridge.connected); if (!bridge.connected) cancelDraw(); }, [bridge.connected, cancelDraw]);
    live = { ...live, bridge };
    return null;
  }
  let view: ReturnType<typeof render> | null = null;
  let audience: InstanceType<typeof NativeSocket> | null = null;
  const settled = () => waitFor(() => expect(state.operatorJournal.at(-1)?.status, JSON.stringify({ operation: state.operatorJournal.at(-1)?.command.operation, ready: state.operator?.ready, posts: posts.map(post => post.path), sourceCommands: sourceFrames.map(frame => JSON.parse(frame).type) })).toBe('confirmed'), { timeout: 4000 });
  try {
    sessionStorage.clear();
    audience = new NativeSocket(`${base.replace('http', 'ws')}/ws`, { headers: { Origin: base, Cookie: audienceCookie } });
    audience.on('message', (raw: Buffer) => audienceFrames.push(String(raw)));
    await new Promise<void>((resolve, reject) => { audience!.once('open', resolve); audience!.once('error', reject); });
    view = render(<><Controller /><Source /></>);
    await waitFor(() => expect(live.session.connection).toBe('connected'));
    act(() => live.bridge.connect());
    await waitFor(() => expect(state.operator?.ready).toBe(true));
    await waitFor(() => expect(screen.getByText(people[0]!.name)).toBeInTheDocument());
    const row = screen.getByText(people[0]!.name).closest('li')!;
    const quiz = within(row).getByRole('button', { name: '퀴즈 스탬프' });
    act(() => { fireEvent.click(quiz); fireEvent.click(quiz); });
    await settled();
    expect(posts.filter(post => post.path.endsWith('/quiz-stamp'))).toHaveLength(1);
    await waitFor(() => expect(within(row).getByRole('button', { name: '퀴즈 스탬프' })).toBeDisabled());
    fireEvent.click(within(row).getByRole('button', { name: '빙고 스탬프' }));
    await waitFor(() => expect(people[0]!.bingoCompletedAt).not.toBeNull()); await settled();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: people[1]!.name } });
    expect(screen.queryByText(people[0]!.name)).not.toBeInTheDocument();
    expect(screen.getByText(people[1]!.name)).toBeInTheDocument();

    gateNextToken = true;
    fireEvent.click(screen.getByRole('button', { name: '빙고 스탬프' }));
    await waitFor(() => expect(tokenGate !== null).toBe(true));
    const interrupted = structuredClone(state.operatorJournal.at(-1).command);
    act(() => live.bridge.disconnect());
    await waitFor(() => expect(state.operatorJournal.at(-1).status).toBe('uncertain'));
    await act(async () => { tokenGate!(); });
    expect(people[1]!.bingoCompletedAt).toBeNull();
    expect(posts.filter(post => post.path.includes(people[1]!.id))).toHaveLength(0);
    act(() => live.bridge.connect());
    await waitFor(() => expect(state.operator?.ready).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: '같은 요청 다시 확인·재시도' }));
    await settled();
    expect(state.operatorJournal.at(-1).command).toEqual(interrupted);
    const interruptedFrames = sourceFrames.map(frame => JSON.parse(frame)).filter(frame => frame.commandId === interrupted.commandId);
    expect(interruptedFrames.map(({ type, ...command }) => command)).toEqual([interrupted, interrupted]);
    expect(people[1]!.bingoCompletedAt).not.toBeNull();
    expect(posts.filter(post => post.path.includes(people[1]!.id))).toHaveLength(1);

    await waitFor(() => expect(screen.getByRole('button', { name: 'LIVE 페어 추첨' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'LIVE 페어 추첨' }));
    await settled();
    await waitFor(() => expect(state.projection.draw.results.flatMap((result: { winners: unknown[] }) => result.winners)).toHaveLength(30));
    expect(liveExecutions).toBe(1);
    const liveCommand = state.operatorJournal.find((item: { command: { operation: string } }) => item.command.operation === 'live-draw').command;
    expect(posts.find(post => post.path === '/api/admin/wave-stage/draw')?.body).toEqual({ idempotencyKey: liveCommand.requestId, expectedRevisions: { changha: 1, wena: 1 } });
    expect(currentStage.creators.every(creator => creator.entryClosesAt === stageFixture.asOf)).toBe(true);
    expect(currentStage.draw?.publishedAt).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '현장 경품 추첨' }));
    await waitFor(() => expect(state.operatorJournal.at(-1).status).toBe('uncertain'));
    const lost = structuredClone(state.operatorJournal.at(-1).command);
    expect(onsiteExecutions).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '같은 요청 다시 확인·재시도' }));
    await settled();
    expect(state.operatorJournal.at(-1).command).toEqual(lost);
    expect(posts.filter(post => post.path === '/api/admin/kyaa-wave/draw')).toHaveLength(1);
    expect(onsiteExecutions).toBe(1);
    await waitFor(() => expect(state.projection.onsite?.revealedThrough).toBe(0));
    expect(audienceFrames.some(frame => frame.includes('현장당첨'))).toBe(false);
    for (let index = 1; index <= 10; index++) {
      await waitFor(() => expect(screen.getByRole('button', { name: `${index}번 경품 공개` })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: `${index}번 경품 공개` }));
      await settled();
      await waitFor(() => expect(state.projection.onsite?.revealedThrough).toBe(index));
      expect(state.projection.onsite.results).toHaveLength(index);
      for (const frame of audienceFrames) {
        const projection = JSON.parse(frame).state?.projection;
        if (projection?.onsite) expect(projection.onsite.results).toHaveLength(projection.onsite.revealedThrough);
      }
    }
    const reveals = posts.filter(post => post.path.endsWith('/draw/reveal'));
    expect(reveals.map(post => post.body.prizeIndex)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(new Set(reveals.map(post => post.body.requestId)).size).toBe(10);
    expect(onsiteExecutions).toBe(1);
    const capturedHostData = JSON.stringify({ state, sourceFrames, audienceFrames });
    expect(capturedHostData.includes(sourceCredential)).toBe(false);
    expect(audienceFrames.some(frame => frame.includes('운영자 전용 대본') || frame.includes(people[0]!.name) || frame.includes('operatorJournal'))).toBe(false);
    expect(posts.every(post => !JSON.stringify(post.body).includes(sourceCredential))).toBe(true);
    console.info('Synthetic API integration verified: real controller/name search/quiz+bingo buttons; duplicate-click=1 grant; before-dispatch disconnect=0 writes; explicit retry preserves command+request IDs; LIVE paired close+published winners=30; onsite committed lost response=1 draw; ordered reveals=10; credentials/roster/scripts/unrevealed winners absent from audience.');
  } finally {
    view?.unmount();
    audience?.terminate(); createdSockets.forEach(socket => socket.terminate());
    host.close(); api.mockRestore(); vi.unstubAllGlobals();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}, 25000);
