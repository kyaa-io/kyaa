import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, parseAbi } from 'viem';
import { HANDOFF, prepareRegistrarHandoff, verifyRegistrarHandoff } from './prepare-creator-registration-handoff.mjs';
const next = '0x515dF0b2A70a31111c2859F0841DFE1E49daEd69';
test('prepares only a zero-value delayed registrar change, deterministically', () => {
  const m = prepareRegistrarHandoff(next);
  const scheduled = decodeFunctionData({ abi: parseAbi(['function schedule(address,uint256,bytes,bytes32,bytes32,uint256)']), data: m.schedule.data });
  assert.equal(scheduled.args[0].toLowerCase(), HANDOFF.registry);
  assert.equal(scheduled.args[1], 0n);
  assert.equal(scheduled.args[5], 172800n);
  assert.equal(decodeFunctionData({ abi: parseAbi(['function setRegistrar(address)']), data: scheduled.args[2] }).args[0], next);
  assert.deepEqual(prepareRegistrarHandoff(next.toLowerCase()), m);
  assert.equal(m.schedule.to, HANDOFF.timelock);
  assert.equal(m.execute.value, '0');
  assert.throws(() => prepareRegistrarHandoff(HANDOFF.currentRegistrar), /NEW_DEDICATED/);
  assert.throws(() => prepareRegistrarHandoff(HANDOFF.timelock), /NEW_DEDICATED/);
  assert.throws(() => prepareRegistrarHandoff('0x0000000000000000000000000000000000000000'), /NEW_DEDICATED/);
});
test('rejects altered manifests before RPC calls', async () => {
  const m = { ...prepareRegistrarHandoff(next), minimumDelaySeconds: 0 };
  await assert.rejects(verifyRegistrarHandoff({}, m), /HANDOFF_MANIFEST_CHANGED/);
});
