import { describe, expect, it, vi } from 'vitest';
import type { Hex, PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { registrationDeployment } from '../src/creator-registration.js';
import { CreatorRegistrationChain } from '../src/adapters/creator-registration-chain.js';
vi.mock('viem', async importOriginal => {
  const actual = await importOriginal<typeof import('viem')>();
  return { ...actual, keccak256: (value: Hex) => value === '0x1234' ? '0x094b3a4a3af412568b9d3f004fd8f9e09e8dca8249398f50b9f25308a034d53b' : actual.keccak256(value) };
});
const slot = '0x9b4561162b6d58cdaee430aa4073a2ec544ff4ca21320ef4e942bd0b419f7707';
function setup(storage: string | undefined) {
  const privateKey = `0x${'1'.repeat(64)}` as Hex;
  const registrar = privateKeyToAccount(privateKey).address;
  const client = {
    getChainId: vi.fn(async () => 91342), getCode: vi.fn(async () => '0x1234'),
    getStorageAt: vi.fn(async () => storage),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'contextRegistry') throw new Error('execution reverted: base Hub has no getter');
      return registrar;
    }),
  };
  const chain = new CreatorRegistrationChain({ rpcUrl: 'https://unused.invalid', privateKey, expectedRegistrar: registrar, deploymentBlock: 1n }, client as unknown as PublicClient);
  return { chain, client };
}
describe('registration deployment storage pointer', () => {
  it.each([undefined, 123n])('accepts the base Hub without a getter at block %s, including packed paused flag', async blockNumber => {
    const h = setup(`0x${'0'.repeat(23)}1${registrationDeployment.registry.slice(2)}`);
    await expect(h.chain.validateDeployment(blockNumber)).resolves.toBeUndefined();
    expect(h.client.getStorageAt).toHaveBeenCalledWith({ address: registrationDeployment.hub, slot, ...(blockNumber === undefined ? {} : { blockNumber }) });
    expect(h.client.readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: 'contextRegistry' }));
    expect(h.client.getCode).toHaveBeenCalledWith({ address: registrationDeployment.registry, ...(blockNumber === undefined ? {} : { blockNumber }) });
  });
  it.each([undefined, '0x', `0x${'0'.repeat(64)}`, `0x${'z'.repeat(64)}`])('rejects missing, malformed or wrong pointer %s', async storage => {
    await expect(setup(storage).chain.validateDeployment()).rejects.toThrow('REGISTRATION_DEPLOYMENT_CHANGED');
  });
});
