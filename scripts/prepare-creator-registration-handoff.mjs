#!/usr/bin/env node
// Read-only preparation. This tool never funds, signs, schedules or executes a transaction.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, parseAbi, encodeFunctionData, encodeAbiParameters, getAddress, keccak256, stringToHex } from 'viem';
export const HANDOFF = Object.freeze({ chainId: 91342, registry: '0x4e104e5dfb3d466a2aac9ed0cf7572578068529b', timelock: '0x40EaEB0b73c50Da5053502Eb3B836a6EfFe54642', currentRegistrar: '0xeEE82f960476c888950C798C444c1FD92CBbFE50', runtime: '0x094b3a4a3af412568b9d3f004fd8f9e09e8dca8249398f50b9f25308a034d53b', delay: 172800 });
const zero = `0x${'00'.repeat(32)}`;
const abi = parseAbi(['function setRegistrar(address)', 'function registrar() view returns(address)', 'function admin() view returns(address)', 'function getMinDelay() view returns(uint256)', 'function hasRole(bytes32,address) view returns(bool)', 'function isOperationPending(bytes32) view returns(bool)', 'function isOperationDone(bytes32) view returns(bool)', 'function schedule(address,uint256,bytes,bytes32,bytes32,uint256)', 'function execute(address,uint256,bytes,bytes32,bytes32) payable']);
const assert = (ok, code) => { if (!ok) throw Error(code); };
export function prepareRegistrarHandoff(address) {
  const next = getAddress(address);
  assert(![HANDOFF.currentRegistrar.toLowerCase(), HANDOFF.timelock.toLowerCase(), '0x0000000000000000000000000000000000000000'].includes(next.toLowerCase()), 'NEW_DEDICATED_REGISTRAR_REQUIRED');
  const data = encodeFunctionData({ abi, functionName: 'setRegistrar', args: [next] });
  const salt = keccak256(stringToHex(`byus-creator-registration-automation-v1:${next.toLowerCase()}`));
  const args = [HANDOFF.registry, 0n, data, zero, salt];
  const operationId = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'bytes' }, { type: 'bytes32' }, { type: 'bytes32' }], args));
  const manifest = {
    format: 'byus-registrar-handoff-v1', chainId: HANDOFF.chainId, registry: HANDOFF.registry,
    timelock: HANDOFF.timelock, currentRegistrar: HANDOFF.currentRegistrar, nextRegistrar: next,
    minimumDelaySeconds: HANDOFF.delay, predecessor: zero, salt, operationId,
    schedule: { to: HANDOFF.timelock, value: '0', data: encodeFunctionData({ abi, functionName: 'schedule', args: [...args, BigInt(HANDOFF.delay)] }) },
    execute: { to: HANDOFF.timelock, value: '0', data: encodeFunctionData({ abi, functionName: 'execute', args }) },
  };
  return { ...manifest, hash: keccak256(stringToHex(JSON.stringify(manifest))) };
}
export async function verifyRegistrarHandoff(client, manifest) {
  assert(JSON.stringify(manifest) === JSON.stringify(prepareRegistrarHandoff(manifest.nextRegistrar)), 'HANDOFF_MANIFEST_CHANGED');
  const read = (address, functionName, args) => client.readContract({ address, abi, functionName, ...(args ? { args } : {}) });
  const [chainId, code, registrar, admin, delay, proposer, executor, pending, done] = await Promise.all([
    client.getChainId(), client.getCode({ address: HANDOFF.registry }),
    read(HANDOFF.registry, 'registrar'), read(HANDOFF.registry, 'admin'), read(HANDOFF.timelock, 'getMinDelay'),
    read(HANDOFF.timelock, 'hasRole', [keccak256(stringToHex('PROPOSER_ROLE')), HANDOFF.currentRegistrar]),
    read(HANDOFF.timelock, 'hasRole', [keccak256(stringToHex('EXECUTOR_ROLE')), HANDOFF.currentRegistrar]),
    read(HANDOFF.timelock, 'isOperationPending', [manifest.operationId]), read(HANDOFF.timelock, 'isOperationDone', [manifest.operationId]),
  ]);
  assert(chainId === HANDOFF.chainId && code && keccak256(code) === HANDOFF.runtime, 'HANDOFF_DEPLOYMENT_CHANGED');
  assert(registrar.toLowerCase() === HANDOFF.currentRegistrar.toLowerCase() && admin.toLowerCase() === HANDOFF.timelock.toLowerCase() && delay === BigInt(HANDOFF.delay), 'HANDOFF_AUTHORITY_CHANGED');
  assert(proposer && executor && !pending && !done, 'HANDOFF_OPERATOR_OR_OPERATION_CHANGED');
  return { verified: true, authorityChanged: false, minimumDelaySeconds: Number(delay) };
}
async function main(args) {
  assert(args.length === 4 && args[0] === '--new-registrar' && args[2] === '--out', 'USAGE_NEW_REGISTRAR_AND_OUTPUT');
  const manifest = prepareRegistrarHandoff(args[1]);
  const result = await verifyRegistrarHandoff(createPublicClient({ transport: http('https://sepolia-rpc.giwa.io', { retryCount: 1, timeout: 15000 }) }), manifest);
  fs.writeFileSync(args[3], JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ...result, nextRegistrar: manifest.nextRegistrar, operationId: manifest.operationId, hash: manifest.hash, output: args[3] }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'HANDOFF_PREPARATION_FAILED'); process.exitCode = 1; });
