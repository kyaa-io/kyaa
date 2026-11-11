import type {RewardedAdState,RewardedGpt} from './google-rewarded-ad';
// Order is fixed: the server session comes first, the ad second. A session that cannot be issued
// (flag/config closed, daily cap, rate limit, balance, fence) is refused before any ad is requested.
// 'shown' and 'granted' are client reports; the server compares their times, so this raises forgery
// cost but does not prove the ad was watched.
export type SessionPost=(path:string,body:unknown)=>Promise<unknown>;
export interface RewardedSessionDeps{
 post:SessionPost;
 unit:string|undefined;
 loadGpt():Promise<RewardedGpt>;
 requestAd(gpt:RewardedGpt,unit:string,onState:(state:RewardedAdState)=>void):{show():boolean;cancel():void};
 onState(state:RewardedAdState):void;
 /** Called once with a server-granted session; the caller then sends the exchange. */
 onGranted(sessionId:string):void;
 /** Called when the session or a report was refused; no exchange is sent. */
 onRefused(error:unknown):void;
 alive():boolean;
 /** Session routes; the ticket exchange's by default. A passport page heart uses its own (issue per page, report). */
 paths?:{issue:string;report:string};
}
const READY=new Set(['issued','shown','granted']);
function parse(value:unknown):{sessionId:string;status:string}{
 const v=value as {sessionId?:unknown;status?:unknown}|null;
 if(!v||typeof v.sessionId!=='string'||typeof v.status!=='string')throw new Error('GROUP_WALLET_UNAVAILABLE');
 return {sessionId:v.sessionId,status:v.status};
}
export async function runRewardedSession(deps:RewardedSessionDeps):Promise<{show():boolean;cancel():void}>{
 let control:{show():boolean;cancel():void}|undefined,cancelled=false;
 const handle={show:()=>control?.show()??false,cancel(){cancelled=true;control?.cancel();}};
 if(!deps.unit){deps.onState('unsupported');return handle;}
 deps.onState('loading');
 let session:{sessionId:string;status:string};
 try{session=parse(await deps.post(deps.paths?.issue??'/api/me/wallet/ad-session',{}));if(!READY.has(session.status))throw new Error('GROUP_WALLET_AD_SESSION_INVALID');}
 catch(error){if(deps.alive())deps.onRefused(error);return handle;}
 if(!deps.alive()||cancelled)return handle;
 // A watched but unspent session is handed back by the server: no second ad.
 if(session.status==='granted'){deps.onGranted(session.sessionId);return handle;}
 try{
  const gpt=await deps.loadGpt();
  if(!deps.alive()||cancelled)return handle;
  let shown:Promise<unknown>=Promise.resolve(),refused=false;
  const report=(event:'shown'|'granted')=>deps.post(deps.paths?.report??'/api/me/wallet/ad-session/report',{sessionId:session.sessionId,event});
  control=deps.requestAd(gpt,deps.unit,state=>{
   if(!deps.alive()||refused)return;
   if(state==='showing'){shown=report('shown').catch(error=>{refused=true;control?.cancel();deps.onRefused(error);});}
   if(state==='earned'){
    void shown.then(async()=>{
     if(refused||!deps.alive())return;
     try{const granted=parse(await report('granted'));if(granted.status==='granted')deps.onGranted(session.sessionId);else deps.onRefused(new Error('GROUP_WALLET_AD_SESSION_INVALID'));}
     catch(error){deps.onRefused(error);}
    });
   }
   deps.onState(state);
  });
 }catch(error){
  // A second press while an ad is already up must not end that ad's flow on screen.
  if(error instanceof Error&&error.message==='REWARDED_AD_BUSY')return handle;
  if(deps.alive())deps.onState('error');
 }
 return handle;
}
