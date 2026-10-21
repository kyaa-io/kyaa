import { z } from 'zod';
const id = z.string().uuid();
const stamp = z.object({ key: z.enum(['checkin','event-photo','fanpage-like','introduction','friendship','dm-greeting','live-cheer','insight-review','quiz-correct','website-cheer','bingo']), status: z.enum(['waiting_wallet','preparing','queued','processing','retryable','permanent_failure','minted']), stampId: id.nullable() }).strict();
export const operatorStateSchema = z.object({
  ready: z.boolean(),
  participants: z.array(z.object({ id, name: z.string().max(200), quizCorrectAt: z.string().nullable(), bingoCompletedAt: z.string().nullable(), stamps: z.array(stamp).max(11) }).strict()).max(5000),
  onsite: z.object({ drawId: id.nullable(), entryCount: z.number().int().nonnegative(), revealedThrough: z.number().int().min(0).max(10) }).strict().nullable(),
}).strict();
export const operatorCommandSchema = z.discriminatedUnion('operation', [
  ...['quiz-stamp', 'bingo-stamp'].map(operation => z.object({ commandId: id, requestId: id, operation: z.literal(operation), participantId: id }).strict()),
  ...['live-draw', 'onsite-execute', 'operator-refresh'].map(operation => z.object({ commandId: id, requestId: id, operation: z.literal(operation) }).strict()),
  z.object({ commandId: id, requestId: id, operation: z.literal('onsite-reveal'), drawId: id, prizeIndex: z.number().int().min(1).max(10) }).strict(),
]);
export const operatorResultSchema = z.object({ commandId: id, status: z.enum(['confirmed', 'rejected', 'uncertain']), message: z.string().max(300).optional(), recovery: z.boolean().optional() }).strict();
export function createOperatorBridge(state, { sendSource, publish, timeoutMs = 20000, sourceIdentity = () => null }) {
  const journal = state.operatorJournal = (state.operatorJournal ?? []);
  for (const item of journal) if (item.status === 'pending') item.status = 'uncertain';
  const timers = new Map(), recoveryRequested = new Set();
  const invalidate = () => {
    timers.forEach(clearTimeout); timers.clear(); recoveryRequested.clear();
    journal.forEach(item => { if (item.status === 'pending') item.status = 'uncertain'; });
    state.operator = null;
  };
  const command = input => {
    const value = operatorCommandSchema.parse(input);
    const serialized = JSON.stringify(value);
    const existing = journal.find(item => item.command.commandId === value.commandId);
    if (existing) {
      if (JSON.stringify(existing.command) !== serialized) throw Error('같은 명령에 다른 값을 사용할 수 없습니다.');
      return existing;
    }
    if (!state.sourceConnected || !state.operator?.ready) throw Error('인증된 운영 소스를 연결하고 상태를 확인해 주세요.');
    if (journal.some(item => ['pending', 'uncertain'].includes(item.status))) throw Error('이전 명령의 결과를 인증된 소스에서 확인해 주세요.');
    const item = { command: value, status: 'pending', sourceOrigin: sourceIdentity() };
    journal.push(item);

    timers.set(value.commandId, setTimeout(() => { item.status = 'uncertain'; timers.delete(value.commandId); publish(); }, timeoutMs));
    sendSource({ type: 'operator-command', ...value });
    return item;
  };
  const result = input => {
    const value = operatorResultSchema.parse(input);
    const item = journal.find(item => item.command.commandId === value.commandId);
    // A timeout or source replacement cannot be cleared by a delayed acknowledgement.
    if (!item || (item.status !== 'pending' && !(item.status === 'uncertain' && value.recovery === true && recoveryRequested.has(value.commandId) && value.status === 'confirmed'))) return;
    clearTimeout(timers.get(value.commandId)); timers.delete(value.commandId);
    recoveryRequested.delete(value.commandId);
    item.status = value.status;
    item.message = value.message;
  };
  const reconcile = commandId => {
    const item = journal.find(item => item.command.commandId === commandId);
    if (!item || item.status !== 'uncertain' || !state.sourceConnected || !state.operator?.ready) throw Error('먼저 인증된 소스를 다시 연결해 주세요.');
    if (item.sourceOrigin !== sourceIdentity()) throw Error('명령을 실행한 원래 소스 주소로 다시 연결해 주세요.');
    recoveryRequested.add(commandId);
    sendSource({ type: 'operator-reconcile', ...item.command });
  };
  const retry = commandId => {
    const item = journal.find(item => item.command.commandId === commandId);
    if (!item || item.status !== 'uncertain' || !state.sourceConnected || !state.operator?.ready) throw Error('먼저 인증된 소스를 다시 연결해 주세요.');
    if (item.sourceOrigin !== sourceIdentity()) throw Error('명령을 실행한 원래 소스 주소로 다시 연결해 주세요.');
    recoveryRequested.delete(commandId);
    item.status = 'pending';
    timers.set(commandId, setTimeout(() => { item.status = 'uncertain'; timers.delete(commandId); publish(); }, timeoutMs));
    sendSource({ type: 'operator-retry', ...item.command });
  };
  return { command, result, reconcile, retry, invalidate, close: invalidate };
}
