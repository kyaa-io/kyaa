// Local proposal only. Never imported by product routes or RPC code.
import policy from './local-policy.json';
import {z} from 'zod';
import {earningStatusSchema} from '../../server/mobile-fan-economy/domain';
import {walletSchema,exchangeInputSchema,checkInSchema,exchangeSchema} from '../../server/group-wallet/domain';
export {policy as localPolicy};
const action=(id:string)=>policy.actions.find(a=>a.id===id)!;
const reaction=action('reaction'),writing=action('comment'),first=action('first_eligible_comment_or_post'),mission=action('approved_mission');
const uuid='e9200000-0000-4000-8000-000000000001';
type Credit={source:string;target:string;fingerprint:string;kind:'reaction'|'comment'|'new_post';eligible:boolean;self?:boolean;first?:boolean;approvedMission?:boolean;reserved?:boolean};
export class LocalPolicyLedger {
 reactionUsed=0;writingUsed=0;missionUsed=0;missionMonthUsed=0;firstUsed=false;
 exchangeDay=0;exchangeMonth=0;pointsDelta=0;heartsDelta=0;ticketsDelta=0;
 sources=new Map<string,{total:number;bonus:boolean;target:string;fingerprint:string;kind:Credit['kind']}>();
 // Eligibility (including media readiness/meaningful content) must be supplied, never inferred from a click.
 credit(input:Credit){
  if(!input.eligible||(input.kind==='reaction'&&input.self))return 0;
  const previous=this.sources.get(input.source),isReaction=input.kind==='reaction';
  if(previous&&(previous.kind!==input.kind||previous.target!==input.target||previous.fingerprint!==input.fingerprint))return 0;
  if(!previous&&[...this.sources.values()].some(s=>(s.kind==='reaction')===isReaction&&(s.target===input.target||(!isReaction&&s.fingerprint===input.fingerprint))))return 0;
  if(!previous&&(isReaction?this.reactionUsed>=reaction.daily_cap!:this.writingUsed>=writing.shared_daily_cap!))return 0;
  const firstBonus=!isReaction&&input.first&&!this.firstUsed;
  const missionBonus=!isReaction&&input.approvedMission&&input.reserved&&this.missionUsed<mission.daily_cap!&&this.missionMonthUsed<mission.monthly_cap!;
  const total=isReaction?reaction.points!:firstBonus?first.total_points!:missionBonus?mission.total_points!:writing.points!;
  if(previous?.bonus||total<=(previous?.total??0))return 0;
  if(!previous){if(isReaction)this.reactionUsed++;else this.writingUsed++;}
  if(firstBonus)this.firstUsed=true;else if(missionBonus){this.missionUsed++;this.missionMonthUsed++;}
  const delta=total-(previous?.total??0);this.pointsDelta+=delta;
  this.sources.set(input.source,{total,bonus:Boolean(firstBonus||missionBonus),target:input.target,fingerprint:input.fingerprint,kind:input.kind});return delta;
 }
 status(){return earningStatusSchema.parse({celebrityId:uuid,policy:{status:'configured',version:policy.policy},actions:[['reaction',reaction.points,this.reactionUsed,reaction.daily_cap],['comment',writing.points,this.writingUsed,writing.shared_daily_cap]].map(([key,pointAmount,used,limit])=>({key,pointAmount,scope:'daily',dailyLimit:limit,usedToday:used,remainingToday:Number(limit)-Number(used),lifetimeLimit:null,lifetimeUsed:used,status:Number(used)>=Number(limit)?'daily_limit':'available',sourceId:null,ledgerId:null}))});}
}

export function withLocalPolicyFixture(delegate:typeof fetch,params:URLSearchParams):typeof fetch {
 const ledger=new LocalPolicyLedger(),receipts=new Map<string,{signature:string;result:Record<string,unknown>}>();
 let attended=false,adSession:string|null=null,adGranted=false;
 const scenario=params.get('policyScenario');
 if(scenario==='activity-limit'){ledger.reactionUsed=reaction.daily_cap!;ledger.writingUsed=writing.shared_daily_cap!;}
 if(scenario==='exchange-day-limit')ledger.exchangeDay=policy.exchange.shared_daily_units;
 if(scenario==='exchange-month-limit')ledger.exchangeMonth=policy.exchange.shared_monthly_units;
 const json=(data:unknown,status=200)=>Response.json(data,{status});
 const fail=(code='GROUP_WALLET_INVALID')=>json({error:{code}},409);
 const wallet=async()=>{const response=await delegate('/api/me/wallet');if(!response.ok)return response;
  const parsed=walletSchema.safeParse(await response.json());if(!parsed.success)return json({error:{code:'GROUP_WALLET_UNAVAILABLE'}},503);
  const data=parsed.data;return json({...data,pointCost:policy.exchange.points_per_unit,points:data.points+ledger.pointsDelta,tickets:data.tickets+ledger.ticketsDelta,attendance:attended?{...data.attendance,checkedIn:true,streak:data.attendance.streak+1,nextBonusIn:action('attendance_streak').every_consecutive_days!-(data.attendance.streak+1)%action('attendance_streak').every_consecutive_days!,days:[...data.attendance.days,{date:data.attendance.date,points:action('attendance').points!+((data.attendance.streak+1)%action('attendance_streak').every_consecutive_days! ===0?action('attendance_streak').points!:0)}]}:data.attendance});};
 return (async(input,init)=>{
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const url=new URL(raw,'http://localhost:3128'),path=url.pathname,method=init?.method??(input instanceof Request?input.method:'GET');
  // Keep existing error/empty/source-state review scenarios intact.
  if(params.has('state')||params.has('apiState')||params.get('policy')==='off')return delegate(input,init);
  const economy=path.startsWith('/api/me/mobile-fan-economy/'),walletPath=path.startsWith('/api/me/wallet');
  if(params.get('auth')==='off'&&(economy||walletPath))return json({error:{code:'UNAUTHENTICATED'}},401);
  if(economy&&method==='GET'&&path.endsWith('/earning-status'))return json(ledger.status());
  if(economy&&method==='GET'&&path.endsWith('/activities/source'))return json({sourceId:ledger.sources.has(`reaction:${url.searchParams.get('sourceKey')}`)?uuid:null});
  if(path==='/api/me/wallet'&&method==='GET')return wallet();
  if(path.startsWith('/api/me/wallet/requests/')&&receipts.has(path.split('/').at(-1)!))return json({status:'committed',result:receipts.get(path.split('/').at(-1)!)!.result});
  if(method==='POST'&&path==='/api/me/wallet/ad-session'){
   const base=await wallet();if(!base.ok)return base;const data=walletSchema.parse(await base.json());
   if(data.points<policy.exchange.points_per_unit)return fail('GROUP_WALLET_INSUFFICIENT_BALANCE');
   adSession=uuid;adGranted=false;return json({sessionId:uuid,status:'issued',expiresAt:new Date(Date.now()+600000).toISOString()});
  }
  if(method==='POST'&&path==='/api/me/wallet/ad-session/report'){
   let body:Record<string,unknown>;try{body=JSON.parse(String(init?.body));}catch{return fail();}
   if(!adSession||body.sessionId!==adSession)return fail('GROUP_WALLET_AD_SESSION_INVALID');
   if(body.event==='granted')adGranted=true;
   return json({sessionId:adSession,status:adGranted?'granted':'shown',expiresAt:new Date(Date.now()+600000).toISOString()});
  }
  if(method==='POST'&&(path==='/api/me/wallet/exchange'||path==='/api/me/wallet/check-in')){
   let body:Record<string,unknown>;try{body=JSON.parse(String(init?.body));}catch{return fail();}
   const key=String(body.requestKey??''),signature=JSON.stringify({path,body}),old=receipts.get(key);
   if(old)return old.signature===signature?json({...old.result,replayed:true}):fail('GROUP_WALLET_REQUEST_CONFLICT');
   if(!z.uuid().safeParse(key).success)return fail();
   const base=await wallet();if(!base.ok)return base;const data=walletSchema.parse(await base.json());
   if(data.writeFenced)return fail('GROUP_WALLET_WRITE_FENCED');
   let result:Record<string,unknown>;
   if(path.endsWith('/exchange')){
    const valid=exchangeInputSchema.safeParse(body);if(!valid.success)return fail();const b=valid.data;
    if(b.target==='ticket'&&(b.units!==1||!adSession||!adGranted||b.adSessionId!==adSession))return json({error:{code:'GROUP_WALLET_AD_SESSION_REQUIRED'}},400);
    if(ledger.exchangeDay+b.units>policy.exchange.shared_daily_units||ledger.exchangeMonth+b.units>policy.exchange.shared_monthly_units)return fail();
    const cost=b.units*policy.exchange.points_per_unit;if(data.points<cost)return fail('GROUP_WALLET_INSUFFICIENT_BALANCE');
    ledger.pointsDelta-=cost;ledger.ticketsDelta+=b.units;adSession=null;adGranted=false;ledger.exchangeDay+=b.units;ledger.exchangeMonth+=b.units;
    const {adSessionId:_session,...shown}=b;result=exchangeSchema.parse({...shown,pointsSpent:cost,pointLedgerId:uuid,creditLedgerId:uuid,createdAt:new Date().toISOString(),replayed:false});
   }else{
    if(data.attendance.checkedIn)return fail();
    const streak=data.attendance.streak+1,points=action('attendance').points!+(streak%action('attendance_streak').every_consecutive_days! ===0?action('attendance_streak').points!:0);
    attended=true;ledger.pointsDelta+=points;
    result=checkInSchema.parse({requestKey:key,date:data.attendance.date,pointsAwarded:points,streak,ledgerId:uuid,replayed:false});
   }
   receipts.set(key,{signature,result});return json(result);
  }
  const response=await delegate(input,init);if(!response.ok)return response;
  if(method==='GET'&&((path==='/api/groups/benefits'&&url.searchParams.get('kind')==='missions')||/\/api\/groups\/[^/]+\/missions(?:\/[^/]+)?$/.test(path))){
   const data=await response.json();const points=mission.total_points!;
   return json({...data,...(data.items?{items:data.items.map((item:Record<string,unknown>)=>({...item,rewardPoints:points}))}:{}),...(data.mission?{mission:{...data.mission,rewardPoints:points}}:{})});
  }
  return response;
 }) as typeof fetch;
}
