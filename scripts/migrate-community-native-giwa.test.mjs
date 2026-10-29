import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {decodeFunctionData,encodeAbiParameters,getContractAddress,keccak256,parseAbi} from 'viem';
import {assertKyaaEnvelope} from './migrate-kyaa-giwa.mjs';
import {COMMUNITY_DEPLOYMENT as d,buildCommunityPlan,validateCommunityPlan,communityPlanHash,assertCommunityArtifacts,assertCommunityGas,inspectCommunityState,recoverOriginalCommunityTransaction,assertCommunityFinalized,assertCommunityFinalizedJournal,pacedCommunityFetch,loadCommunityArtifacts} from './migrate-community-native-giwa.mjs';
const root=new URL('../',import.meta.url);
const artifacts=Object.fromEntries(Object.entries({codec:'contracts/test/fixtures/ByUsActionCodecV4.json',implementation:'contracts/test/fixtures/KyaaCommunityActionHubV4.json',previous:'contracts/test/fixtures/KyaaActionHubV3.json'}).map(([id,file])=>[id,JSON.parse(fs.readFileSync(new URL(file,root)))]));
const plan=()=>buildCommunityPlan(artifacts,42,172800n);
const scheduleAbi=parseAbi(['function schedule(address,uint256,bytes,bytes32,bytes32,uint256)']);
test('exact deterministic plan deploys two contracts then schedules one atomic initializer-4 upgrade',()=>{
 const p=plan();assert.deepEqual(plan(),p);assert.equal(p.chainId,91342);assert.deepEqual(p.steps.map(s=>s.id),['codec','implementation','schedule']);assert.deepEqual(p.steps.map(s=>s.nonce),[42,43,44]);
 assert.equal(p.addresses.codec,getContractAddress({from:d.admin,nonce:42n}).toLowerCase());assert.equal(p.addresses.implementation,getContractAddress({from:d.admin,nonce:43n}).toLowerCase());
 const schedule=decodeFunctionData({abi:scheduleAbi,data:p.steps[2].data});assert.equal(schedule.args[0].toLowerCase(),d.hub);assert.equal(schedule.args[1],0n);assert.equal(schedule.args[5],172800n);assert.equal(schedule.args[4],p.salt);
 const upgrade=decodeFunctionData({abi:parseAbi(['function upgradeToAndCall(address,bytes)']),data:schedule.args[2]});assert.equal(upgrade.args[0].toLowerCase(),p.addresses.implementation);assert.equal(decodeFunctionData({abi:parseAbi(['function initializeCommunityCodec()']),data:upgrade.args[1]}).functionName,'initializeCommunityCodec');
 assert.equal(p.operation,keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'},{type:'bytes'},{type:'bytes32'},{type:'bytes32'}],schedule.args.slice(0,5))));
 const execute=decodeFunctionData({abi:parseAbi(['function execute(address,uint256,bytes,bytes32,bytes32)']),data:p.execute.data});assert.deepEqual(execute.args,schedule.args.slice(0,5));
 assert.equal(p.maximumExposureWei,'900000000000000');assert(BigInt(p.maximumExposureWei)<=1400000000000000n);assert.equal(p.maxFeePerGas,'100000000');assert.equal(p.oldRuntimeHash,d.oldRuntimeHash);
 assert.equal(validateCommunityPlan(p,artifacts,communityPlanHash(p)),p);
});
test('rejects shortened delay, unsafe nonces, tampered manifest, approval and artifact fingerprints',()=>{
 for(const nonce of [-1,1.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>buildCommunityPlan(artifacts,nonce,172800n),/INVALID_NONCE/);
 assert.throws(()=>buildCommunityPlan(artifacts,42,172799n),/TIMELOCK_DELAY/);
 assert.throws(()=>validateCommunityPlan(plan(),artifacts,'0xwrong'),/REVIEWED_MANIFEST_HASH_REQUIRED/);
 for(const change of [p=>{p.chainId=1;},p=>{p.hub=d.admin;},p=>{p.addresses.codec=d.admin;},p=>{p.steps[0].gas='99999999';},p=>{p.steps[2].data='0x';},p=>{p.runtimeHashes.implementation='0xwrong';},p=>{p.pins.previous.sha256='wrong';}]){const p=structuredClone(plan());change(p);assert.throws(()=>validateCommunityPlan(p,artifacts),/MANIFEST_OR_ARTIFACT_CHANGED/);}
 for(const change of [a=>{a.codec.bytecode.object='0x6000';},a=>{a.codec.deployedBytecode.object='0x6000';},a=>{a.implementation.abi=[];},a=>{a.implementation.deployedBytecode.immutableReferences={};},a=>{a.previous.deployedBytecode.object='0x6000';}]){const a=structuredClone(artifacts);change(a);assert.throws(()=>assertCommunityArtifacts(a),/ARTIFACT_FINGERPRINT_CHANGED/);}
});
test('chain and gas/fee/balance safeguards fail before signing',async()=>{
 await assert.rejects(inspectCommunityState({getChainId:async()=>1},null,artifacts),/WRONG_CHAIN/);
 const s=plan().steps[0],fees={maxFeePerGas:100000000n,maxPriorityFeePerGas:0n};assertCommunityGas(s,2000000n,200000000000000n,fees);
 assert.throws(()=>assertCommunityGas(s,2000001n,200000000000000n,fees),/GAS_CAP/);
 assert.throws(()=>assertCommunityGas(s,2000000n,1n,fees),/ADMIN_BALANCE/);
 for(const patch of [{maxFeePerGas:100000001n},{maxFeePerGas:0n},{maxPriorityFeePerGas:-1n},{maxPriorityFeePerGas:100000001n}])assert.throws(()=>assertCommunityGas(s,1n,200000000000000n,{...fees,...patch}),/TRANSACTION_FEE_CAP/);
 const tx={type:'eip1559',chainId:91342,nonce:s.nonce,gas:BigInt(s.gas),data:s.data,value:0n,...fees};assertKyaaEnvelope(tx,s);
 for(const patch of [{chainId:1},{nonce:43},{gas:1n},{data:'0x'},{value:1n},{to:d.admin}])assert.throws(()=>assertKyaaEnvelope({...tx,...patch},s),/TRANSACTION_ENVELOPE/);
});
test('unknown original signed transaction blocks recovery without any rebroadcast or new signing',async()=>{
 let knownReads=0;const missing=name=>Object.assign(Error(),{name});
 const c={getTransactionReceipt:async()=>{throw missing('TransactionReceiptNotFoundError');},getTransaction:async()=>{knownReads++;throw missing('TransactionNotFoundError');},sendRawTransaction:()=>assert.fail('rebroadcast'),signTransaction:()=>assert.fail('resign'),waitForTransactionReceipt:()=>assert.fail('unknown hash must stop')};
 await assert.rejects(recoverOriginalCommunityTransaction(c,{hash:'0xoriginal'}),/SIGNED_TRANSACTION_UNCERTAIN_DO_NOT_RESIGN/);assert.equal(knownReads,1);
});
test('known original recovers only its canonical receipt, including original hash equality',async()=>{
 const receipt={transactionHash:'0xoriginal',blockNumber:12n,blockHash:'0xcanonical'};const requests=[];
 const c={getTransactionReceipt:async()=>{throw Object.assign(Error(),{name:'TransactionReceiptNotFoundError'});},getTransaction:async()=>({hash:'0xoriginal'}),waitForTransactionReceipt:async request=>{requests.push(request);return receipt;},getBlock:async()=>({hash:'0xcanonical'}),sendRawTransaction:()=>assert.fail('rebroadcast')};
 assert.equal(await recoverOriginalCommunityTransaction(c,{hash:'0xoriginal'}),receipt);assert.equal(requests.length,1);assert.equal(requests[0].hash,'0xoriginal');assert.equal(requests[0].checkReplacement,false);
 await assert.rejects(recoverOriginalCommunityTransaction({...c,getTransaction:async()=>({hash:'0xother'})},{hash:'0xoriginal'}),/SIGNED_TRANSACTION_UNCERTAIN_DO_NOT_RESIGN/);
 await assert.rejects(recoverOriginalCommunityTransaction({...c,waitForTransactionReceipt:async()=>({...receipt,transactionHash:'0xother'})},{hash:'0xoriginal'}),/TRANSACTION_RECEIPT_HASH_MISMATCH/);
});
test('already mined original is recovered without pending lookup and needs finalized canonical block',async()=>{
 const receipt={transactionHash:'0xoriginal',blockNumber:12n,blockHash:'0xcanonical'};
 const c={getTransactionReceipt:async()=>receipt,getTransaction:()=>assert.fail('already mined'),waitForTransactionReceipt:async()=>receipt,getBlock:async({blockTag})=>blockTag==='finalized'?{number:12n,hash:'0xfinalized'}:{number:12n,hash:'0xcanonical'}};
 assert.equal(await recoverOriginalCommunityTransaction(c,{hash:'0xoriginal'}),receipt);await assertCommunityFinalized(c,receipt);
 await assert.rejects(assertCommunityFinalized({...c,getBlock:async({blockTag})=>blockTag==='finalized'?{number:11n}:{hash:'0xcanonical'}},receipt),/RECEIPT_FINALITY_PENDING/);
 await assert.rejects(assertCommunityFinalized({...c,getBlock:async()=>({number:12n,hash:'0xwrong'})},receipt),/NONCANONICAL_RECEIPT/);
});

test('final proof rechecks every original receipt, including an earlier reorg with a finalized last step',async()=>{
 const steps=[1n,2n,3n].map(n=>({hash:`tx${n}`,receipt:{hash:`tx${n}`,blockNumber:String(n),blockHash:`block${n}`}}));
 const reads=[];
 const c={getBlock:async({blockTag,blockNumber})=>{if(blockTag==='finalized')return {number:3n};reads.push(blockNumber);return {hash:`block${blockNumber}`};}};
 await assertCommunityFinalizedJournal(c,steps);assert.deepEqual(reads,[1n,2n,3n]);
 await assert.rejects(assertCommunityFinalizedJournal({...c,getBlock:async({blockTag,blockNumber})=>blockTag==='finalized'?{number:3n}:{hash:blockNumber===1n?'replacement-block':`block${blockNumber}`}},steps),/NONCANONICAL_RECEIPT/);
 await assert.rejects(assertCommunityFinalizedJournal(c,[{...steps[0],receipt:undefined}]),/JOURNAL_RECEIPT_REQUIRED/);
 await assert.rejects(assertCommunityFinalizedJournal(c,[{...steps[0],receipt:{...steps[0].receipt,hash:'different-tx'}}]),/JOURNAL_RECEIPT_REQUIRED/);
});

test('RPC transport spaces concurrent calls without changing requests or retrying them',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(input,init)=>{calls.push({input,init,at:Date.now()});return new Response('{}',{status:200});};
 try{
  const first={method:'POST',body:'first'},second={method:'POST',body:'second'};
  await Promise.all([pacedCommunityFetch('https://rpc.example',first),pacedCommunityFetch('https://rpc.example',second)]);
  assert.equal(calls.length,2);assert.equal(calls[0].init,first);assert.equal(calls[1].init,second);
  assert(calls[1].at-calls[0].at>=150);assert.equal(calls[0].input,'https://rpc.example');
 }finally{globalThis.fetch=original;}
});

test('execution requires an explicit reviewed artifact directory and rejects rebuilt bytes',()=>{
 assert.throws(()=>loadCommunityArtifacts(),/REVIEWED_ARTIFACT_DIRECTORY_REQUIRED/);
 assert.throws(()=>loadCommunityArtifacts('contracts/out'),/REVIEWED_ARTIFACT_DIRECTORY_REQUIRED/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'community-artifacts-'));
 try{fs.writeFileSync(path.join(dir,'codec.json'),JSON.stringify(artifacts.codec));assert.throws(()=>loadCommunityArtifacts(dir),/ARTIFACT_SHA_CHANGED/);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
