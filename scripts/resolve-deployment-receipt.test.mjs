import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveReceipt} from './resolve-deployment-receipt.mjs';
function harness(prior = {}) {
 const writes=[];
 return {writes, args:{deploymentId:123,outcome:'sent',messageIds:[701],evidence:'Room -5187701508 inspected; message 701 confirms delivery.',github:async(path,init)=>{
 if(init){writes.push(init.body);return {};}
 if(path.startsWith('/deployments')) return {sha:'a'.repeat(40),environment:'AWS production',creator:{login:'github-actions[bot]'},payload:{publicLive:true}};
 return {check_runs:[{id:456,name:'Telegram deployment notice',app:{slug:'github-actions'},external_id:'123',head_sha:'a'.repeat(40),status:'completed',conclusion:'action_required',output:{summary:JSON.stringify(prior)}}]};
 }}};
}
test('confirmed delivery is terminal and preserves evidence',async()=>{const {args,writes}=harness();await resolveReceipt(args);assert.equal(writes[0].conclusion,'success');assert.equal(JSON.parse(writes[0].output.summary).evidence,args.evidence);});
test('confirmed absence is rejected',async()=>{const {args,writes}=harness();await resolveReceipt({...args,outcome:'rejected'});assert.equal(writes[0].conclusion,'failure');});
test('partial delivery cannot be hidden as sent or retried as rejected',async()=>{for(const outcome of ['sent','rejected']){const {args,writes}=harness({delivered:[{messageId:701}],batchCount:36});await assert.rejects(resolveReceipt({...args,outcome}),/PARTIAL_DELIVERY/);assert.equal(writes.length,0);}});
test('missing inspection evidence cannot mutate receipt',async()=>{const {args,writes}=harness();await assert.rejects(resolveReceipt({...args,messageIds:[]}),/EVIDENCE/);assert.equal(writes.length,0);});
