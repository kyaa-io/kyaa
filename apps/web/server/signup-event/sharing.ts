import { appendFile, readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { localSignupEnabled, readLocalSnapshot } from './local';
import { ingestLocalSources } from './local-store';
const linkSchema=z.object({token:z.uuid(),owner:z.uuid(),createdAt:z.iso.datetime()});
function path() {
 if(!localSignupEnabled()||!process.env.KYAA_SIGNUP_EVENT_SNAPSHOT)throw new Error('SIGNUP_EVENT_LOCAL_DISABLED');
 return `${process.env.KYAA_SIGNUP_EVENT_SNAPSHOT}.shares.jsonl`;
}
export async function createLocalShareLink(owner:string) {
 z.uuid().parse(owner);
 const link={token:randomUUID(),owner,createdAt:new Date().toISOString()};
 await appendFile(path(),JSON.stringify(link)+'\n',{mode:0o600});
 return link.token;
}
export async function readLocalShareLink(token:string) {
 if(!z.uuid().safeParse(token).success)return null;
 const lines=(await readFile(path(),'utf8')).trim().split('\n');
 return lines.map(line=>linkSchema.parse(JSON.parse(line))).find(link=>link.token===token) ?? null;
}
export function clickSource(owner:string,visitor:string) {
 const digest=createHash('sha256').update(`${owner}:${visitor}`).digest('hex');
 return `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
}
export async function recordLocalShareClick(token:string,visitor:string) {
 z.uuid().parse(visitor);
 const link=await readLocalShareLink(token);
 if(!link)return null;
 const snapshot=await readLocalSnapshot();
 const id=clickSource(link.owner,visitor);
 if(!snapshot.actions.some(action=>action.kind==='share-click'&&action.sourceId===id)) {
  await ingestLocalSources({app_users:[],fan_action_occurrences:[],activityNamespaces:{attendance:'group_creator_attendance',post:'fan_posts'},shareRecords:[{id,owner_id:link.owner,occurred_at:new Date().toISOString(),kind:'share-click',verified:true}],draftWeights:snapshot.draftWeights});
 }
 return link;
}
export async function recordLocalReferral(token:string,referredUserId:string,createdAt:string) {
 const link=await readLocalShareLink(token);
 if(!link||link.owner===referredUserId||Date.parse(link.createdAt)>Date.parse(createdAt))return;
 const snapshot=await readLocalSnapshot();
 await ingestLocalSources({app_users:[{id:referredUserId,created_at:createdAt}],fan_action_occurrences:[],activityNamespaces:{attendance:'group_creator_attendance',post:'fan_posts'},shareRecords:[{id:clickSource(link.owner,referredUserId),owner_id:link.owner,occurred_at:createdAt,kind:'referral-signup',referred_user_id:referredUserId,verified:true}],draftWeights:snapshot.draftWeights});
}
