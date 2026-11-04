import test from 'node:test';
import assert from 'node:assert/strict';
import { failedStackEventLines, reportFailedStackEvents } from './aws-release-stack-failure.mjs';

const event = (changes = {}) => ({ LogicalResourceId: 'WorkerFunction', ResourceType: 'AWS::Lambda::Function', ResourceStatus: 'UPDATE_FAILED', ResourceStatusReason: 'Resource handler returned message: "boom"', Timestamp: '2026-11-04T01:00:00Z', ...changes });

test('lists only FAILED rows with a reason, newest first, from this deploy', () => {
  const lines = failedStackEventLines([event(), event({ ResourceStatus: 'UPDATE_COMPLETE' }), event({ LogicalResourceId: 'Old', Timestamp: '2026-11-03T01:00:00Z' }), event({ ResourceStatusReason: undefined })], { since: Date.parse('2026-11-04T00:00:00Z') });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /WorkerFunction \(AWS::Lambda::Function\) UPDATE_FAILED: /);
});
test('masks account IDs, control characters and workflow-command prefixes', () => {
  const [line] = failedStackEventLines([event({ ResourceStatusReason: '::error::role arn:aws:iam::123456789012:role/x denied\nnext' })]);
  assert.doesNotMatch(line, /123456789012/);
  assert.match(line, /\[account\]/);
  assert.doesNotMatch(line, /\n/);
  assert.doesNotMatch(line, /(?:^|: )::error::/);
});
test('caps rows and tolerates malformed input', () => {
  assert.equal(failedStackEventLines(Array.from({ length: 20 }, () => event())).length, 8);
  assert.deepEqual(failedStackEventLines(undefined), []);
  assert.deepEqual(failedStackEventLines([null, 1]), []);
});
test('lookup failure is reported without throwing', () => {
  const logs = [];
  reportFailedStackEvents({ stackName: 'stack', describeEvents: () => { throw new Error('AccessDenied for 123456789012'); }, log: message => logs.push(message) });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /could not be read/);
  assert.doesNotMatch(logs[0], /123456789012/);
});
test('prints rows when events exist and a note when none match', () => {
  const logs = [];
  reportFailedStackEvents({ stackName: 'stack', describeEvents: () => ({ StackEvents: [event()] }), log: message => logs.push(message) });
  reportFailedStackEvents({ stackName: 'stack', describeEvents: () => ({ StackEvents: [] }), log: message => logs.push(message) });
  assert.match(logs[0], /WorkerFunction/);
  assert.match(logs[1], /no FAILED events/);
});
