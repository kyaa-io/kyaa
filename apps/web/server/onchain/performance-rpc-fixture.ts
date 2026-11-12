import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, keccak256, stringToHex, getAddress, type Address, type Hash, type PublicClient } from 'viem';
import { actionHubAbi, credentialRefComponents } from '../../../worker/src/action-abi';
import { onchainConfig as config } from './public-config';
import { performanceFixture } from './performance-fixture';

export function performanceRpcFixture() {
  const { source, representatives } = performanceFixture();
  const zero = `0x${'0'.repeat(64)}` as Hash;
  const migrator = config.credentialReplacement.deployment!.address;
  const hub = config.hubAddress, uri = 'fixture';
  const records = new Map<string, Record<string, unknown>>();
  const attestations = new Map<string, unknown>();
  const transactions = new Map<string, unknown>();
  const latest = new Map<string, Hash>();
  const requests = new Map<string, Hash>();
  const replacements = new Map<string, unknown[]>();
  const targetSources = new Map<string, Hash>();
  const tokens = new Map<string, bigint>();
  const logs: Array<Record<string, unknown>> = [];
  const replacementLogs: Array<Record<string, unknown>> = [];
  const identity = (asset: string, token: string) => keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[asset as Address,BigInt(token)]));
  for (const [index, action] of source.actions.entries()) {
    action.recipient=getAddress(action.recipient);action.easRecipient=action.recipient;action.originalRecipient=action.recipient;
    const sourceOccurrence=action.sourceOccurrence as Hash;
    const occurrenceId=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'bytes32'},{type:'bytes32'}],[BigInt(config.chainId),hub,config.environmentId,sourceOccurrence]));
    const actionId=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint32'}],[occurrenceId,1]));
    action.occurrenceId=occurrenceId;action.actionId=actionId;
    const credential=action.credentials[0];credential.nftContract=getAddress(credential.nftContract);
    // Linked credentials exercise verification without manufacturing mint receipts.
    credential.linkOrigin=1;
    credential.credentialKey=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'uint256'}],[BigInt(config.chainId),credential.nftContract as Address,BigInt(credential.tokenId)]));
    const ref={nftContract:credential.nftContract as Address,tokenId:BigInt(credential.tokenId),kind:1,issuanceKey:sourceOccurrence,linkOrigin:1};
    const refsHash=keccak256(encodeAbiParameters([{type:'tuple[]',components:credentialRefComponents}],[[ref]]));
    const data=encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'uint32'},{type:'uint16'},{type:'uint16'},{type:'uint32'},{type:'bytes32'},{type:'bytes32'},{type:'bytes32'},{type:'uint32'},{type:'uint8'},{type:'bytes32'},{type:'bytes32'},{type:'bytes32'}],
      [occurrenceId,actionId,1,10,1,1,config.environmentId,action.creatorId as Hash,action.campaignId as Hash,action.occurredDay,0,zero,refsHash,zero]);
    const request={sourceOccurrence,revision:1,actionCode:10,schemaVersion:1,policyVersion:1,fan:action.recipient as Address,creatorId:action.creatorId as Hash,campaignId:action.campaignId as Hash,occurredDay:action.occurredDay,evidenceCommitment:zero,migrationBatchId:zero,bindingVersion:1};
    const record={occurrenceId,actionId,easUID:action.easUid,requestHash:sourceOccurrence,recordHash:keccak256(data),schemaUID:config.schemaUid,refUID:zero,fan:action.recipient,revision:1,actionCode:10,schemaVersion:1,policyVersion:1,status:2,origin:0,migrationBatchId:zero};
    records.set(actionId,record);requests.set(sourceOccurrence,sourceOccurrence);latest.set(occurrenceId,actionId);
    attestations.set(action.easUid,{uid:action.easUid,schema:config.schemaUid,time:1n,expirationTime:0n,revocationTime:0n,refUID:zero,recipient:action.recipient,attester:hub,revocable:true,data});
    transactions.set(action.txHash,{hash:action.txHash,to:hub,blockHash:source.blockHash,blockNumber:source.blockNumber,input:encodeFunctionData({abi:actionHubAbi,functionName:'recordAndIssue',args:[request,[{kind:1,mode:1,issuanceKey:sourceOccurrence,tokenId:ref.tokenId,metadataUri:''}]]})});
    const location={address:hub,transactionHash:action.txHash,blockNumber:source.blockNumber,blockHash:source.blockHash,transactionIndex:0,removed:false};
    logs.push({...location,logIndex:logs.length,topics:encodeEventTopics({abi:actionHubAbi,eventName:'CredentialLinked',args:{actionId,nftContract:ref.nftContract,tokenId:ref.tokenId}}),data:encodeAbiParameters([{type:'uint8'},{type:'bytes32'},{type:'uint8'}],[1,sourceOccurrence,1])});
    logs.push({...location,logIndex:logs.length,topics:encodeEventTopics({abi:actionHubAbi,eventName:'FanActionRecorded',args:{actionId,fan:request.fan,campaignId:request.campaignId}}),data:encodeAbiParameters([{type:'bytes32'},{type:'uint32'},{type:'bytes32'},{type:'string'},{type:'uint16'},{type:'uint32'},{type:'bytes32'},{type:'uint32'},{type:'uint8'},{type:'bytes32'}],[occurrenceId,1,request.creatorId,'DAILY_CHECKIN',1,1,action.easUid as Hash,request.occurredDay,0,zero])});
    const lifecycle=source.lifecycleTransactions[index];lifecycle.actionIds=[actionId];lifecycle.recipients=[action.recipient];
    const representative=representatives.get(`${credential.nftContract.toLowerCase()}:${credential.tokenId}`);
    if(representative){
      representative.owner=action.recipient;representative.nftContract=getAddress(representative.nftContract);representative.migration.migratorAddress=getAddress(representative.migration.migratorAddress);representative.migration.sourceHub=getAddress(representative.migration.sourceHub);
      representative.migration.sourceActionId=actionId;representative.issuanceKey=sourceOccurrence;representative.metadataHash=keccak256(stringToHex(uri));
      const sourceId=identity(credential.nftContract,credential.tokenId),targetId=identity(representative.nftContract,representative.tokenId);
      replacements.set(sourceId,[zero,representative.migration.batchId,BigInt(representative.tokenId),action.recipient,representative.metadataHash,hub,actionId,true]);
      targetSources.set(targetId,sourceId);tokens.set(sourceOccurrence,BigInt(credential.tokenId));
      replacementLogs.push({...location,address:migrator,logIndex:replacementLogs.length,args:{batchId:representative.migration.batchId,oldContract:credential.nftContract,oldTokenId:BigInt(credential.tokenId),newContract:representative.nftContract,newTokenId:BigInt(representative.tokenId),recipient:action.recipient,issuanceKey:sourceOccurrence,metadataHash:representative.metadataHash,sourceHub:hub,sourceActionId:actionId,leaf:zero,minted:true}});
    }
  }
  const immutable: Record<string,unknown>={timelock:config.credentialReplacement.timelock,operator:config.credentialReplacement.operator,hub,legacyHub:config.deployments[0].hubAddress,environmentId:config.environmentId,oldPassport:config.assetBindings[1][0],oldStamp:config.assetBindings[1][1],newPassport:config.assetBindings[2][0],newStamp:config.assetBindings[2][1]};
  const client={
    getChainId:async()=>config.chainId,
    getBlock:async()=>({number:source.blockNumber,hash:source.blockHash,timestamp:source.timestamp}),
    getLogs:async({address,fromBlock,toBlock}: {address:string|string[];fromBlock:bigint;toBlock:bigint})=> source.blockNumber<fromBlock||source.blockNumber>toBlock?[]:address===migrator?replacementLogs:logs,
    getTransaction:async({hash}:{hash:string})=>transactions.get(hash),
    readContract:async({address,functionName,args=[]}:{address:string;functionName:string;args?:unknown[]})=>{
      if(address.toLowerCase()===migrator.toLowerCase()){
        if(functionName in immutable)return immutable[functionName];
        if(functionName==='replacements')return replacements.get(String(args[0]));
        if(functionName==='sourceByTarget')return targetSources.get(String(args[0]));
      }
      if(functionName==='environmentId')return config.environmentId;
      if(functionName==='eas')return config.easAddress;
      if(functionName==='getSchema')return config.schemaUid;
      if(functionName==='getAction')return records.get(String(args[0]));
      if(functionName==='latestActionId')return latest.get(String(args[0]));
      if(functionName==='hashRequest')return requests.get((args[1] as {sourceOccurrence:string}).sourceOccurrence);
      if(functionName==='getAssetBinding')return config.assetBindings[1][1];
      if(functionName==='getAttestation')return attestations.get(String(args[0]));
      if(functionName==='isAttestationValid')return true;
      if(functionName==='tokenByIssuanceId')return tokens.get(String(args[0]));
      if(functionName==='balanceOf'||functionName==='totalSupply')return 1n;
      if(functionName==='uri')return uri;
      throw new Error(`Unexpected fixture RPC: ${functionName}`);
    },
  } as unknown as PublicClient;
  return {source,representatives,client};
}
