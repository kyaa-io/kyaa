import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {assertAvailableAdminNonce} from './migrate-kyaa-giwa.mjs';
const account=privateKeyToAccount('0x'+'01'.repeat(32));
const tx={chainId:91342,type:'eip1559',nonce:7,to:account.address,value:0n,gas:21000n,maxFeePerGas:1n,maxPriorityFeePerGas:0n};
test('rejects pending signatures in every persisted journal shape, even with a claimed receipt',async()=>{
 const raw=await account.signTransaction(tx);
 for(const key of ['signed','signedRawTransaction','rawTransaction']){
  await assert.rejects(assertAvailableAdminNonce([{[key]:raw,receipt:{status:'success'}}],7,account.address),/UNRESOLVED_ADMIN_SIGNATURE/);
  await assert.rejects(assertAvailableAdminNonce([{steps:[{nested:{[key]:raw}}]}],7,account.address),/UNRESOLVED_ADMIN_SIGNATURE/);
 }
 await assertAvailableAdminNonce([{signed:raw}],8,account.address);
 await assertAvailableAdminNonce([{signed:await account.signTransaction({...tx,chainId:1})}],7,account.address);
 await assert.rejects(assertAvailableAdminNonce([{signed:'0xinvalid'}],7,account.address));
});
