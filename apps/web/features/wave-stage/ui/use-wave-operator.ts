"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { withRequestDeadline } from '@/features/reliability/client/request-deadline';
import { waveAdminDrawResponseSchema } from '@/features/fanpage/domain/wave-draw';
import { stageOperatorStateSchema, type StageOperatorCommand, type StageOperatorResult, type StageOperatorState } from '../domain/stage-operator';

const participantPage = z.object({ participants: z.array(stageOperatorStateSchema.shape.participants.element.extend({ createdAt: z.string() }).strip()), nextCursor: z.string().nullable() });
type Onsite = z.infer<typeof waveAdminDrawResponseSchema>;
const empty: StageOperatorState = { ready: false, participants: [], onsite: null };
export function useWaveOperator({ enabled, role, getAccessToken, drawLive, readLive }: {
  enabled: boolean; role: string; getAccessToken: () => Promise<string | null>;
  drawLive: (role: string, requestId?: string) => Promise<StageOperatorResult>;
  readLive: () => Promise<{ draw: unknown } | null>;
}) {
  const [operator, setOperator] = useState<StageOperatorState>(empty);
  const [onsite, setOnsite] = useState<Onsite | null>(null);
  const latest = useRef({ enabled, role, getAccessToken, drawLive, readLive });
  const generation = useRef(0), busy = useRef(false), requests = useRef(new Set<AbortController>());
  useLayoutEffect(() => { latest.current = { enabled, role, getAccessToken, drawLive, readLive }; });
  const request = useCallback(async (path: string, body?: unknown) => {
    const current = generation.current, controller = new AbortController();
    requests.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const token = await withRequestDeadline(() => latest.current.getAccessToken(), { signal: controller.signal });
      if (!token) throw Error('AUTH');
      if (current !== generation.current || !latest.current.enabled || controller.signal.aborted) throw Error('UNCONFIRMED');
      const response = await fetch(path, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) setOperator(empty);
        throw Error(response.status === 401 || response.status === 403 ? 'AUTH' : response.status >= 400 && response.status < 500 && response.status !== 408 ? 'REJECTED' : 'UNCONFIRMED');
      }
      return await response.json() as unknown;
    } finally { clearTimeout(timeout); requests.current.delete(controller); }
  }, []);
  const readVersion = useRef(0);
  const refresh = useCallback(async () => {
    const current = generation.current, version = ++readVersion.current;
    try {
      const people: StageOperatorState['participants'] = [];
      let cursor: string | null = null;
      do {
        const page = participantPage.parse(await request(`/api/admin/kyaa-wave-participants${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`));
        people.push(...page.participants.map(({ createdAt, ...person }) => person));
        if (people.length > 5000) throw Error('Too many participants');
        cursor = page.nextCursor;
      } while (cursor);
      const next = waveAdminDrawResponseSchema.parse(await request('/api/admin/kyaa-wave/draw'));
      if (current !== generation.current || version !== readVersion.current || !latest.current.enabled) return null;
      setOnsite(next);
      const value = stageOperatorStateSchema.parse({ ready: ['admin', 'editor'].includes(latest.current.role), participants: people, onsite: { drawId: next.draw?.id ?? null, entryCount: next.entryCount, revealedThrough: next.draw?.revealedThrough ?? 0 } });
      setOperator(value); return { operator: value, onsite: next };
    } catch { if (current === generation.current && version === readVersion.current) setOperator(empty); return null; }
  }, [request]);
  useEffect(() => {
    const currentGeneration = ++generation.current, activeRequests = requests.current;
    if (!enabled || !['admin', 'editor'].includes(role)) { setOperator(empty); setOnsite(null); return; }
    void refresh();
    const timer = setInterval(() => { if (!busy.current) void refresh(); }, 10000);
    return () => { generation.current = currentGeneration + 1; activeRequests.forEach(controller => controller.abort()); clearInterval(timer); };
  }, [enabled, role, refresh]);
  const execute = useCallback(async (command: StageOperatorCommand, recovery = false, retry = false): Promise<StageOperatorResult> => {
    if (!latest.current.enabled || !['admin', 'editor'].includes(latest.current.role) || busy.current) return { status: retry || recovery ? 'uncertain' : 'rejected' };
    busy.current = true;
    const current = generation.current;
    readVersion.current++;
    try {
      if (recovery || retry) {
        const read = await refresh();
        if (!read) return { status: 'uncertain' };
        const person = 'participantId' in command ? read.operator.participants.find(person => person.id === command.participantId) : null;
        const live = command.operation === 'live-draw' ? await latest.current.readLive() : null;
        if (command.operation === 'live-draw' && !live) return { status: 'uncertain' };
        const confirmed = command.operation === 'quiz-stamp' ? !!person?.quizCorrectAt : command.operation === 'bingo-stamp' ? !!person?.bingoCompletedAt :
          command.operation === 'onsite-execute' ? !!read.onsite.draw : command.operation === 'onsite-reveal' ? read.onsite.draw?.id === command.drawId && read.onsite.draw.revealedThrough >= command.prizeIndex :
          command.operation === 'live-draw' ? !!live?.draw : true;
        if (confirmed) return { status: 'confirmed' };
        if (recovery || current !== generation.current) return { status: 'uncertain' };
      }
      if (command.operation === 'live-draw') {
        const result = await latest.current.drawLive(latest.current.role, command.requestId);
        return retry && result.status === 'rejected' ? { status: 'uncertain' } : result;
      }
      if (command.operation === 'quiz-stamp' || command.operation === 'bingo-stamp') {
        const field = command.operation === 'quiz-stamp' ? 'quizCorrectAt' : 'bingoCompletedAt';
        const result = z.object({ id: z.uuid(), [field]: z.string().min(1) }).parse(await request(`/api/admin/kyaa-wave-participants/${command.participantId}/${command.operation}`, {}));
        if (result.id !== command.participantId) throw Error('Wrong participant');
      } else if (command.operation === 'onsite-execute' || command.operation === 'onsite-reveal') {
        const result = waveAdminDrawResponseSchema.parse(await request(`/api/admin/kyaa-wave/draw${command.operation === 'onsite-reveal' ? '/reveal' : ''}`, { requestId: command.requestId, ...(command.operation === 'onsite-reveal' ? { drawId: command.drawId, prizeIndex: command.prizeIndex } : {}) }));
        if (!result.draw || (command.operation === 'onsite-reveal' && (result.draw.id !== command.drawId || result.draw.revealedThrough < command.prizeIndex))) throw Error('Unconfirmed draw');
        if (current === generation.current) setOnsite(result);
      }
      if (current !== generation.current) return { status: 'uncertain' };
      const refreshed = await refresh();
      if (command.operation === 'operator-refresh' && !refreshed) return { status: 'uncertain' };
      return { status: 'confirmed' };
    } catch (error) { return { status: !retry && error instanceof Error && ['AUTH', 'REJECTED'].includes(error.message) ? 'rejected' : 'uncertain' }; }
    finally { busy.current = false; }
  }, [refresh, request]);
  return { operator, onsite, execute, refresh };
}
