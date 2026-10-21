import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOperatorBridge, operatorCommandSchema, operatorStateSchema } from '../host/operator-bridge.mjs';
const command = { commandId: '11111111-1111-4111-8111-111111111111', requestId: '22222222-2222-4222-8222-222222222222', operation: 'onsite-execute' };
test('binds command IDs, locks uncertainty, ignores late ACK, and recovers only on explicit read', async () => {
  const state = { sourceConnected: true, operator: { ready: true } }, sent = [];
  const bridge = createOperatorBridge(state, { sendSource: value => sent.push(value), publish() {}, timeoutMs: 5 });
  try {
    bridge.command(command); bridge.command(command);
    assert.equal(sent.length, 1);
    assert.throws(() => bridge.command({ ...command, operation: 'live-draw' }));
    await new Promise(resolve => setTimeout(resolve, 12));
    bridge.result({ commandId: command.commandId, status: 'confirmed' });
    assert.equal(state.operatorJournal[0].status, 'uncertain');
    bridge.result({ commandId: command.commandId, status: 'confirmed', recovery: true });
    assert.equal(state.operatorJournal[0].status, 'uncertain');
    assert.throws(() => bridge.command({ ...command, commandId: '33333333-3333-4333-8333-333333333333' }));
    bridge.reconcile(command.commandId);
    assert.equal(sent[1].type, 'operator-reconcile');
    bridge.result({ commandId: command.commandId, status: 'confirmed', recovery: true });
    assert.equal(state.operatorJournal[0].status, 'confirmed');
  } finally { bridge.close(); }
});
test('source replacement and restart preserve uncertain identity without automatic retry', () => {
  const state = { sourceConnected: true, operator: { ready: true } }, sent = [];
  const bridge = createOperatorBridge(state, { sendSource: value => sent.push(value), publish() {} });
  bridge.command(command); bridge.invalidate();
  assert.equal(state.operator, null);
  bridge.result({ commandId: command.commandId, status: 'confirmed' });
  assert.equal(state.operatorJournal[0].status, 'uncertain');
  const restored = { sourceConnected: false, operator: null, operatorJournal: structuredClone(state.operatorJournal) };
  const next = createOperatorBridge(restored, { sendSource: () => assert.fail('must not resend'), publish() {} });
  assert.equal(restored.operatorJournal[0].command.requestId, command.requestId);
  assert.throws(() => next.reconcile(command.commandId));
  next.close(); bridge.close();
});
test('closed commands and private DTO reject credentials and hidden winners', () => {
  assert.equal(operatorCommandSchema.safeParse({ ...command, url: 'https://evil.test' }).success, false);
  const value = { ready: true, participants: [], onsite: null };
  for (const extra of [{ email: 'x@example.test' }, { token: 'secret' }, { winners: [{ name: 'hidden' }] }]) assert.equal(operatorStateSchema.safeParse({ ...value, ...extra }).success, false);
});
test('explicit retry after disconnect reuses the complete original identity and rejects changed source origin', () => {
  let origin = 'https://kyaa.io';
  const state = { sourceConnected: true, operator: { ready: true } }, sent = [];
  const bridge = createOperatorBridge(state, { sourceIdentity: () => origin, sendSource: value => sent.push(value), publish() {} });
  try {
    bridge.command(command); bridge.invalidate();
    assert.equal(sent.length, 1);
    state.sourceConnected = true; state.operator = { ready: true };
    origin = 'http://localhost:3000';
    assert.throws(() => bridge.reconcile(command.commandId), /원래 소스/);
    assert.throws(() => bridge.retry(command.commandId), /원래 소스/);
    assert.equal(sent.length, 1);
    origin = 'https://kyaa.io';
    bridge.retry(command.commandId);
    assert.deepEqual(sent[1], { type: 'operator-retry', ...command });
    assert.equal(state.operatorJournal[0].status, 'pending');
    assert.throws(() => bridge.retry(command.commandId));
    bridge.result({ commandId: command.commandId, status: 'confirmed' });
    assert.equal(state.operatorJournal[0].status, 'confirmed');
  } finally { bridge.close(); }
});
