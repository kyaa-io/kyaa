#!/usr/bin/env node
// Exact V4 transition: two deployments, one delayed atomic codec upgrade; no database writes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createPublicClient,http,encodeDeployData,encodeFunctionData,encodeAbiParameters,getContractAddress,keccak256,padHex,parseAbi,parseTransaction,recoverTransactionAddress} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {assertKyaaEnvelope,checkPrivate,persist,readReceipt,confirmedKyaaReceipt,runtimeMatches,assertAvailableAdminNonce,readAdminJournals} from './migrate-kyaa-giwa.mjs';

export const COMMUNITY_DEPLOYMENT=Object.freeze({chainId:91342,admin:'0xeee82f960476c888950c798c444c1fd92cbbfe50',writer:'0xd0f5dd0885ca87f2c9f4d1017fa1714dd98dc815',hub:'0xbd9991a26d0a0bf744ecdb8ad4f59f60a9132956',timelock:'0x40eaeb0b73c50da5053502eb3b836a6effe54642',oldImplementation:'0xb135c7070eb7dedbea16c8468f27e17c82f6d5f4',oldRuntimeHash:'0x00c5c5d42dc056df77dcc2586d5563c69fa26fef7450119aaaac1ef35984db97',oldCodec:'0x4e44a1c183bac430f30033bd1a639c696b93612a',oldCodecRuntimeHash:'0xe3095c9a1847be6e857e06f7182d417597094331c3a2ab5b2058253ab248bc39',passport:'0xb6c5f48d770a732deb374226eda1e5be209b7ed4',stamp:'0x527a70c0f7cf129650dc282b709327c5958a4ccf',oldPassport:'0x17f9fb7658a326dd88db523739c227faf50fca20',oldStamp:'0x1adcde3473c4e884e60205b397ece744d8892285',eas:'0x4200000000000000000000000000000000000021',schema:'0xbd97671d89c9f4bb246e33369389332486f406ab821a0c7f88860034759c5c0b',environment:'0xd5bc532db275cd70e5f55280b01cd2acc6b30b90d5aaa451adeb4b9a8f02c264',registry:'0x4e104e5dfb3d466a2aac9ed0cf7572578068529b'});
const d=COMMUNITY_DEPLOYMENT,zero='0x'+'00'.repeat(32),zeroAddress='0x'+'00'.repeat(20);
const implementationSlot='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const hubStorage=0x9b4561162b6d58cdaee430aa4073a2ec544ff4ca21320ef4e942bd0b419f7700n;
const tl=parseAbi(['function getMinDelay() view returns(uint256)','function hasRole(bytes32,address) view returns(bool)','function getTimestamp(bytes32) view returns(uint256)','function isOperationReady(bytes32) view returns(bool)','function isOperationDone(bytes32) view returns(bool)','function schedule(address,uint256,bytes,bytes32,bytes32,uint256)','function execute(address,uint256,bytes,bytes32,bytes32) payable']);
const hubAbi=parseAbi(['function getAssetBinding(uint32,uint8) view returns(address)','function environmentId() view returns(bytes32)','function eas() view returns(address)','function getSchema(uint16) view returns(bytes32)','function initializeCommunityCodec()','function upgradeToAndCall(address,bytes) payable']);
const nftAbi=parseAbi(['function defaultAdmin() view returns(address)','function hasRole(bytes32,address) view returns(bool)']);
const assert=(ok,reason)=>{if(!ok)throw Error(reason);};
let nextRequestAt=0;
export async function pacedCommunityFetch(input,init){
 const now=Date.now(),at=Math.max(now,nextRequestAt);nextRequestAt=at+200;
 if(at>now)await new Promise(resolve=>setTimeout(resolve,at-now));
 return fetch(input,init);
}
const json=v=>JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x,2);
export const communityPlanHash=v=>keccak256(new TextEncoder().encode(json(v)));
function persistJournal(file,value){
 persist(file,value);const fd=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
const abiHash=a=>keccak256(new TextEncoder().encode(JSON.stringify(a.abi)));
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Pins include the reviewed compiler output, ABI and immutable reference layout; never rebuild the previous artifact.
const pins={
 codec:{sha256:'7267c317ca0281b486f24d3a479a58e87c65a1deafb0cbcec93866eb21b77494',abi:'0x291831ae89249e51554473e55f1d1839cb8970a3d51d235538326ca78d5d9c9a',creation:'0x440fbfef77309a0dded19d0dbc88d3539a192ff8d9f77b17031bcd4f082eebd0',runtime:'0xb82bd9b261d957b6a52439fb4bb481bb4a060acaf20ff23067c4a7e4d1f99388',refs:{}},
 implementation:{sha256:'b679db359b86a89710bcaa276e1b499a2f23965abb73f00dc9f09a280d74d437',abi:'0xc3e280cdc01816ccf522e301a30490a9492384c6a859f97b9d182d31b281bd99',creation:'0x3503e3ddb915dea93c1ed248198ec113416b9bf9b88f1f0582051be9729cf335',runtime:'0xd0a9d12b4452f4289eef06158fba796a23d93e2e9b33519a0184586d86f13200',refs:{42432:[{start:6409,length:32},{start:21311,length:32}],62113:[{start:5350,length:32}],62116:[{start:5749,length:32}],62119:[{start:10974,length:32}],62122:[{start:10937,length:32}],62125:[{start:5637,length:32},{start:5694,length:32}],62128:[{start:5422,length:32},{start:5562,length:32}]}},
 previous:{sha256:'4a7b40d8a2a5743b6abdb7b35e3c1865f9e299264f95d7dbdac14524ec79c290',abi:'0x44ee306ac26607103cd9bcc5285e2eeda8c1186856d8209734028c82452db74f',creation:'0x2ea60f69d2676ef4bd2038f7bb687468e9e1b627319351c48507733966a197b0',runtime:'0xfc42bc82abc17a0179fcec6286ba3de00d0d0140397030b95e727c76b37e4e1a',refs:{42432:[{start:6432,length:32},{start:21285,length:32}],61748:[{start:561,length:32}],61751:[{start:795,length:32}],61754:[{start:631,length:32},{start:11059,length:32}],61757:[{start:693,length:32},{start:11022,length:32}]}}
};
export function loadCommunityArtifacts(directory){
 assert(directory&&path.isAbsolute(directory),'REVIEWED_ARTIFACT_DIRECTORY_REQUIRED');
 const artifactPaths=Object.fromEntries(['codec','implementation','previous'].map(id=>[id,path.join(directory,id+'.json')]));
 return Object.fromEntries(Object.entries(artifactPaths).map(([id,file])=>{const raw=fs.readFileSync(file);assert(createHash('sha256').update(raw).digest('hex')===pins[id].sha256,'ARTIFACT_SHA_CHANGED');return [id,JSON.parse(raw)];}));
}
export function assertCommunityArtifacts(a){
 for(const [id,pin] of Object.entries(pins)){
  const artifact=a[id];assert(artifact&&abiHash(artifact)===pin.abi&&keccak256(artifact.bytecode.object)===pin.creation&&keccak256(artifact.deployedBytecode.object)===pin.runtime&&json(artifact.deployedBytecode.immutableReferences??{})===json(pin.refs),'ARTIFACT_FINGERPRINT_CHANGED');
  assert((artifact.deployedBytecode.object.length-2)/2<=24576,'RUNTIME_SIZE');
 }
}
function patchedRuntime(a,values){
 let runtime=a.deployedBytecode.object;
 for(const [id,refs] of Object.entries(a.deployedBytecode.immutableReferences??{}))for(const {start,length} of refs){assert(values[id]&&length===32,'IMMUTABLE_LAYOUT');runtime=runtime.slice(0,2+start*2)+padHex(values[id],{size:32}).slice(2)+runtime.slice(2+(start+length)*2);}
 return runtime;
}
function previousRuntime(a){return patchedRuntime(a.previous,{42432:d.oldImplementation,61748:d.hub,61751:d.timelock,61754:d.passport,61757:d.stamp});}
function nextRuntime(a,addresses){return patchedRuntime(a.implementation,{42432:addresses.implementation,62113:d.hub,62116:d.timelock,62119:d.passport,62122:d.stamp,62125:d.oldCodec,62128:addresses.codec});}
export function buildCommunityPlan(a,nonce,delay){
 assertCommunityArtifacts(a);assert(Number.isSafeInteger(nonce)&&nonce>=0&&Number.isSafeInteger(nonce+2),'INVALID_NONCE');assert(delay>=172800n,'TIMELOCK_DELAY');
 assert(keccak256(previousRuntime(a))===d.oldRuntimeHash,'OLD_IMMUTABLES_CHANGED');
 const addresses=Object.fromEntries(['codec','implementation'].map((id,i)=>[id,getContractAddress({from:d.admin,nonce:BigInt(nonce+i)}).toLowerCase()]));
 const runtimeHashes={codec:pins.codec.runtime,implementation:keccak256(nextRuntime(a,addresses))};
 const steps=['codec','implementation'].map((id,i)=>({id,nonce:nonce+i,gas:id==='codec'?'2000000':'6000000',data:encodeDeployData({abi:a[id].abi,bytecode:a[id].bytecode.object,args:id==='codec'?[]:[d.hub,d.passport,d.stamp,d.oldCodec,addresses.codec]})}));
 const upgrade=encodeFunctionData({abi:hubAbi,functionName:'upgradeToAndCall',args:[addresses.implementation,encodeFunctionData({abi:hubAbi,functionName:'initializeCommunityCodec'})]});
 const salt=communityPlanHash({domain:'kyaa-giwa-community-native-v4',chainId:d.chainId,hub:d.hub,addresses,pins});
 const operation=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'},{type:'bytes'},{type:'bytes32'},{type:'bytes32'}],[d.hub,0n,upgrade,zero,salt]));
 steps.push({id:'schedule',nonce:nonce+2,to:d.timelock,gas:'500000',data:encodeFunctionData({abi:tl,functionName:'schedule',args:[d.hub,0n,upgrade,zero,salt,delay]})});
 const execute={id:'execute',to:d.timelock,gas:'500000',data:encodeFunctionData({abi:tl,functionName:'execute',args:[d.hub,0n,upgrade,zero,salt]})};
 const maximumExposureWei=String([...steps,execute].reduce((total,s)=>total+BigInt(s.gas)*100000000n,0n));assert(BigInt(maximumExposureWei)<=1400000000000000n,'TOTAL_FEE_CAP');
 return {format:'kyaa-giwa-community-native-v4',...d,addresses,pins,runtimeHashes,delay:String(delay),salt,operation,steps,execute,maxFeePerGas:'100000000',maximumExposureWei};
}
export function validateCommunityPlan(plan,a,approvedHash){
 assert(json(plan)===json(buildCommunityPlan(a,plan.steps[0].nonce,BigInt(plan.delay))),'MANIFEST_OR_ARTIFACT_CHANGED');
 if(approvedHash!==undefined)assert(communityPlanHash(plan)===approvedHash,'REVIEWED_MANIFEST_HASH_REQUIRED');
 return plan;
}
const addressWord=word=>{assert(/^0x[0-9a-fA-F]{64}$/.test(word??'')&&/^0x0{24}/i.test(word),'INVALID_ADDRESS_SLOT');return '0x'+word.slice(-40).toLowerCase();};
const roleHash=name=>name==='DEFAULT_ADMIN_ROLE'?zero:keccak256(new TextEncoder().encode(name));
export async function inspectCommunityState(c,plan,a){
 assert(await c.getChainId()===d.chainId,'WRONG_CHAIN');
 const finalized=await c.getBlock({blockTag:'finalized'}),blockNumber=finalized.number;assert(blockNumber!==null&&finalized.hash,'FINALIZED_BLOCK_REQUIRED');
 const read=(address,abi,functionName,args=[])=>c.readContract({address,abi,functionName,args,blockNumber});
 const storage=slot=>c.getStorageAt({address:d.hub,slot,blockNumber});
 const bytecode=address=>c.getBytecode({address,blockNumber});
 assert(keccak256(await bytecode(d.hub))==='0x2373de27ebdd05a3665c30eb6afdc555833cb5e0f60a663ff23f0f2825a412a7','PROXY_RUNTIME_CHANGED');
 assert(keccak256(await bytecode(d.timelock))==='0x0e3a4d6350ada4a2eb17e084770058b2b6f5bb487036eb19b0de7f1363f63900','TIMELOCK_RUNTIME_CHANGED');
 const delay=await read(d.timelock,tl,'getMinDelay');assert(delay>=172800n&&(!plan||delay===BigInt(plan.delay)),'TIMELOCK_DELAY_CHANGED');
 for(const role of ['PROPOSER_ROLE','EXECUTOR_ROLE'])assert(await read(d.timelock,tl,'hasRole',[roleHash(role),d.admin]),'TIMELOCK_ROLE_CHANGED');
 assert(await read(d.timelock,tl,'hasRole',[zero,d.timelock]),'TIMELOCK_ADMIN_CHANGED');
 for(const [role,account,expected] of [['DEFAULT_ADMIN_ROLE',d.timelock,true],['UPGRADER_ROLE',d.timelock,true],['WRITER_ROLE',d.writer,true],['MIGRATOR_ROLE',d.admin,true],['CORRECTOR_ROLE',d.admin,true],['PAUSER_ROLE',d.admin,true],['DEFAULT_ADMIN_ROLE',d.admin,false],['UPGRADER_ROLE',d.admin,false]]){
  const inner=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[roleHash(role),hubStorage+9n]));
  const slot=keccak256(encodeAbiParameters([{type:'address'},{type:'bytes32'}],[account,inner]));
  assert(BigInt(await storage(slot))===(expected?1n:0n),'HUB_ROLE_CHANGED');
 }
 for(const [version,passport,stamp] of [[1,d.oldPassport,d.oldStamp],[2,d.passport,d.stamp]]){
  for(const [kind,expected] of [[0,passport],[1,stamp],[2,zeroAddress]])assert((await read(d.hub,hubAbi,'getAssetBinding',[version,kind])).toLowerCase()===expected,'BINDING_CHANGED');
 }
 for(const address of [d.passport,d.stamp]){
  assert((await read(address,nftAbi,'defaultAdmin')).toLowerCase()===d.timelock,'NFT_ADMIN_CHANGED');
  assert(await read(address,nftAbi,'hasRole',[roleHash('MINTER_ROLE'),d.hub]),'NFT_MINTER_CHANGED');
 }
 assert(await read(d.hub,hubAbi,'environmentId')===d.environment&&(await read(d.hub,hubAbi,'eas')).toLowerCase()===d.eas&&await read(d.hub,hubAbi,'getSchema',[1])===d.schema,'ATTESTATION_CONFIG_CHANGED');
 const registryWord=await storage(padHex('0x'+(hubStorage+7n).toString(16),{size:32}));
 assert(BigInt(registryWord)===BigInt(d.registry),'REGISTRY_OR_PAUSE_CHANGED');
 assert(keccak256(await bytecode(d.oldCodec))===d.oldCodecRuntimeHash,'OLD_CODEC_CHANGED');
 const previous=await bytecode(d.oldImplementation);assert(runtimeMatches(previous,a.previous)&&keccak256(previous)===d.oldRuntimeHash,'OLD_IMPLEMENTATION_RUNTIME_CHANGED');
 const completed=plan?await read(d.timelock,tl,'isOperationDone',[plan.operation]):false;
 const currentImplementation=addressWord(await storage(implementationSlot)),expectedImplementation=completed?plan.addresses.implementation:d.oldImplementation;
 assert(currentImplementation===expectedImplementation,'HUB_IMPLEMENTATION_CHANGED');
 assert(addressWord(await storage(padHex('0x'+(hubStorage+6n).toString(16),{size:32})))===(completed?plan.addresses.codec:d.oldCodec),'CODEC_SLOT_CHANGED');
 return {delay,completed,currentImplementation,expectedImplementation,blockNumber:String(blockNumber),blockHash:finalized.hash,timestamp:plan?await read(d.timelock,tl,'getTimestamp',[plan.operation]):0n,ready:plan?await read(d.timelock,tl,'isOperationReady',[plan.operation]):false};
}
async function verifyNewContracts(c,plan,a){
 for(const id of ['codec','implementation']){const actual=await c.getBytecode({address:plan.addresses[id],blockTag:'finalized'});assert(runtimeMatches(actual,a[id])&&keccak256(actual)===plan.runtimeHashes[id],'DEPLOYED_RUNTIME_CHANGED');}
}
export function assertCommunityGas(step,estimate,balance,fees){
 assert(estimate<=BigInt(step.gas),'GAS_CAP');assert(balance>=BigInt(step.gas)*100000000n,'ADMIN_BALANCE');
 assert(fees.maxFeePerGas>0n&&fees.maxFeePerGas<=100000000n&&fees.maxPriorityFeePerGas>=0n&&fees.maxPriorityFeePerGas<=fees.maxFeePerGas,'TRANSACTION_FEE_CAP');
}
export async function recoverOriginalCommunityTransaction(c,saved){
 const receipt=await readReceipt(c,saved.hash);
 if(!receipt){let tx;try{tx=await c.getTransaction({hash:saved.hash});}catch(e){if(e.name!=='TransactionNotFoundError')throw e;}assert(tx&&tx.hash===saved.hash,'SIGNED_TRANSACTION_UNCERTAIN_DO_NOT_RESIGN');}
 return confirmedKyaaReceipt(c,saved.hash);
}
export async function assertCommunityFinalized(c,receipt){
 const [block,finalized]=await Promise.all([c.getBlock({blockNumber:receipt.blockNumber}),c.getBlock({blockTag:'finalized'})]);
 assert(block.hash===receipt.blockHash,'NONCANONICAL_RECEIPT');assert(finalized.number!==null&&finalized.number>=receipt.blockNumber,'RECEIPT_FINALITY_PENDING');
}
export async function assertCommunityFinalizedJournal(c,steps){
 for(const saved of steps){
  assert(saved.receipt&&saved.receipt.hash===saved.hash,'JOURNAL_RECEIPT_REQUIRED');
  await assertCommunityFinalized(c,{...saved.receipt,blockNumber:BigInt(saved.receipt.blockNumber)});
 }
}
async function main(){
 const args=process.argv.slice(2),mode=args[0],get=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];};
 assert(['prepare','deploy-and-schedule','inspect','execute-upgrade'].includes(mode),'USAGE_PREPARE_DEPLOY_AND_SCHEDULE_INSPECT_EXECUTE_UPGRADE');const file=get('--manifest');assert(file,'MANIFEST_REQUIRED');
 const a=loadCommunityArtifacts(get('--artifact-dir'));assertCommunityArtifacts(a);const c=createPublicClient({transport:http('https://sepolia-rpc.giwa.io',{timeout:15000,retryCount:1,retryDelay:2000,fetchFn:pacedCommunityFetch})});
 if(mode==='prepare'){
  const state=await inspectCommunityState(c,null,a);const [latest,pending,balance]=await Promise.all([c.getTransactionCount({address:d.admin}),c.getTransactionCount({address:d.admin,blockTag:'pending'}),c.getBalance({address:d.admin})]);assert(latest===pending,'PENDING_ADMIN_TRANSACTION');
  const plan=buildCommunityPlan(a,pending,state.delay);assert(balance>=BigInt(plan.maximumExposureWei),'ADMIN_BALANCE');fs.writeFileSync(file,json(plan)+'\n',{flag:'wx',mode:0o644});console.log(json({prepared:true,manifest:file,hash:communityPlanHash(plan),addresses:plan.addresses,operation:plan.operation,maximumExposureWei:plan.maximumExposureWei,verifiedFinalizedBlock:state.blockNumber}));return;
 }
 const plan=validateCommunityPlan(JSON.parse(fs.readFileSync(file)),a),manifestHash=communityPlanHash(plan);let state=await inspectCommunityState(c,plan,a);
 if(mode==='inspect'){if(state.completed)await verifyNewContracts(c,plan,a);console.log(json({manifestHash,operation:plan.operation,...state}));return;}
 assert(get('--approved-hash')===manifestHash,'REVIEWED_MANIFEST_HASH_REQUIRED');
 const common=path.resolve(execFileSync('git',['rev-parse','--git-common-dir'],{encoding:'utf8',cwd:projectRoot}).trim()),dir=path.join(common,'byus-admin-transactions');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const dirStat=fs.lstatSync(dir);assert(dirStat.isDirectory()&&!dirStat.isSymbolicLink()&&dirStat.uid===process.getuid()&&(dirStat.mode&0o077)===0,'UNSAFE_JOURNAL_DIRECTORY');
 const lock=path.join(dir,'kyaa-migration.lock');fs.closeSync(fs.openSync(lock,'wx',0o600));
 try{
  const journalFile=path.join(dir,manifestHash+'.json');checkPrivate(journalFile);
  const journal=fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile)):{manifestHash,steps:[]};assert(journal.manifestHash===manifestHash&&Array.isArray(journal.steps)&&new Set(journal.steps.map(s=>s.id)).size===journal.steps.length,'JOURNAL_MANIFEST');
  assert(journal.steps.every((s,i)=>s.id===[...plan.steps,plan.execute][i]?.id),'JOURNAL_STEP_ORDER');
  let steps=plan.steps;
  if(mode==='execute-upgrade'){
   await verifyNewContracts(c,plan,a);assert(state.completed||state.ready,'TIMELOCK_NOT_READY');const saved=journal.steps.find(s=>s.id==='execute');assert(!state.completed||saved,'COMPLETED_OPERATION_WITHOUT_JOURNAL');steps=[{...plan.execute,nonce:saved?.nonce??await c.getTransactionCount({address:d.admin})}];
  }else assert(!state.completed,'UPGRADE_ALREADY_COMPLETED');
  for(const step of steps){
   let saved=journal.steps.find(s=>s.id===step.id),receipt;
   if(saved){
    assert(keccak256(saved.signed)===saved.hash&&(await recoverTransactionAddress({serializedTransaction:saved.signed})).toLowerCase()===d.admin,'JOURNAL_SIGNATURE');assertKyaaEnvelope(parseTransaction(saved.signed),step);receipt=await recoverOriginalCommunityTransaction(c,saved);
   }else{
    state=await inspectCommunityState(c,plan,a);if(step.id==='execute'){assert(state.ready&&!state.completed,'TIMELOCK_NOT_READY');await verifyNewContracts(c,plan,a);}
    const [latest,pending,fees,estimate,balance]=await Promise.all([c.getTransactionCount({address:d.admin}),c.getTransactionCount({address:d.admin,blockTag:'pending'}),c.estimateFeesPerGas(),c.estimateGas({account:d.admin,data:step.data,value:0n,...(step.to?{to:step.to}:{})}),c.getBalance({address:d.admin})]);
    await assertAvailableAdminNonce(readAdminJournals(common),latest,d.admin);
    assert(latest===pending&&pending===step.nonce,'ADMIN_NONCE_CHANGED');assertCommunityGas(step,estimate,balance,fees);
    const tx={chainId:d.chainId,type:'eip1559',nonce:step.nonce,gas:BigInt(step.gas),data:step.data,value:0n,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas,...(step.to?{to:step.to}:{})};assertKyaaEnvelope(tx,step);
    let key=execFileSync('/Users/jewel/.local/share/byus-admin-keychain/keychain-helper',['read'],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();assert(/^0x[0-9a-fA-F]{64}$/.test(key),'KEYCHAIN_FORMAT');const account=privateKeyToAccount(key);key='';assert(account.address.toLowerCase()===d.admin,'SIGNER_CHANGED');
    const signed=await account.signTransaction(tx);saved={id:step.id,nonce:step.nonce,signed,hash:keccak256(signed)};journal.steps.push(saved);persistJournal(journalFile,journal);
    assert(await c.sendRawTransaction({serializedTransaction:signed})===saved.hash,'BROADCAST_HASH');receipt=await confirmedKyaaReceipt(c,saved.hash);
   }
   assert(receipt.status==='success'&&receipt.from.toLowerCase()===d.admin&&(receipt.to?.toLowerCase()??null)===(step.to??null),'CANONICAL_RECEIPT');
   if(a[step.id])assert(receipt.contractAddress?.toLowerCase()===plan.addresses[step.id],'DEPLOYED_ADDRESS');
   saved.receipt={hash:saved.hash,blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash};persistJournal(journalFile,journal);
   if(a[step.id]){const actual=await c.getBytecode({address:plan.addresses[step.id],blockNumber:receipt.blockNumber});assert(runtimeMatches(actual,a[step.id])&&keccak256(actual)===plan.runtimeHashes[step.id],'DEPLOYED_RUNTIME_CHANGED');}
   console.log(json({step:step.id,...saved.receipt,canonical:true}));
  }
  // Recheck every original receipt after the sequence before publishing finalized proof.
  await assertCommunityFinalizedJournal(c,journal.steps);
  await verifyNewContracts(c,plan,a);state=await inspectCommunityState(c,plan,a);assert(state.timestamp>0n,'OPERATION_NOT_SCHEDULED');if(mode==='execute-upgrade')assert(state.completed,'UPGRADE_NOT_COMPLETED');
  const result={manifestHash,addresses:plan.addresses,operation:plan.operation,...state,readyAt:state.timestamp>1n?new Date(Number(state.timestamp)*1000).toISOString():null,transactions:journal.steps.map(s=>({id:s.id,...s.receipt})),finalized:true};fs.writeFileSync(file+'.receipts.json',json(result)+'\n');console.log(json(result));
 }finally{fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(json({stopped:true,reason:/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:e.name}));process.exitCode=1;});
