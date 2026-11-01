"use client";
import { GroupImage } from "@/features/groups/ui/group-image";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Ticket } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { GroupActivityFrame } from "@/features/groups/ui/group-activity-frame";
import { FanAction,fanActionClassName } from "@/components/fan-ui/fan-action";
import { GroupRequestError, useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { walletSchema } from "@/server/group-wallet/domain";
import { groupsCopy } from "@/features/groups/ui/copy";
import { capsulesSchema, capsuleResultSchema, pendingCapsuleSchema, canDraw, type PendingCapsule } from "./domain";
import { raffleStateCopy } from "@/features/group-raffle/state-copy";
import { capsuleCopy } from "./copy";
import { CapsuleReveal } from "./capsule-reveal";
import styles from "./capsule.module.css";
const parseList=(v:unknown)=>capsulesSchema.parse(v),parseWallet=(v:unknown)=>walletSchema.parse(v);
export function CapsuleScreen({locale,pageId}:{locale:AppLocale;pageId?:string}) {
 const auth=useGroupRequest(),t=groupsCopy(locale),c=capsuleCopy(locale);
 return <GroupActivityFrame standalone locale={locale} pageId={pageId} title={c.title}>{!auth.ready?<p role='status'>{t.loading}</p>:!auth.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/my/capsules?locale=${locale}`)}`}>{t.login}</FanAction>:<OwnedCapsules key={auth.ownerKey} locale={locale}/>}</GroupActivityFrame>;
}
function OwnedCapsules({locale}:{locale:AppLocale}) {
 const t=groupsCopy(locale),c=capsuleCopy(locale),[cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<{key:string;items:ReturnType<typeof parseList>['items']}>({key:'',items:[]}),list=useGroupResource(`/api/groups/capsules${cursor?`?cursor=${cursor}`:''}`,parseList),wallet=useGroupResource('/api/me/wallet',parseWallet);
 const [counts,setCounts]=useState<Record<string,1|10>>({}),[revealing,setRevealing]=useState(false),[pending,setPending]=useState<PendingCapsule|null>(null),[result,setResult]=useState<ReturnType<typeof capsuleResultSchema.parse>|null>(null),[storageReady,setStorageReady]=useState(false),[error,setError]=useState<'storageError'|'unknown'|'insufficient'|'paused'|null>(null),[busy,setBusy]=useState(false);
 const releaseReveal=useCallback(()=>setRevealing(false),[]);
 const running=useRef(false),alive=useRef(true),storageKey=`kyaa-capsule-pending:${wallet.ownerKey.split(':').slice(0,-1).join(':')}`;
 useEffect(()=>{alive.current=true;try{const stored=sessionStorage.getItem(storageKey);if(stored)setPending(pendingCapsuleSchema.parse(JSON.parse(stored)));setStorageReady(true);}catch{setError('storageError');}return()=>{alive.current=false;};},[storageKey]);
 async function draw(input:PendingCapsule,recover=false){
  if(running.current||!storageReady)return;running.current=true;setBusy(true);setError(null);
  try{
   sessionStorage.setItem(storageKey,JSON.stringify(input));setPending(input);
   let raw:unknown;
   if(recover){try{raw=await wallet.request(`/api/me/wallet/capsule-requests/${input.requestKey}`);}catch(e){if(!(e instanceof GroupRequestError&&e.code==='CAPSULE_NOT_FOUND'))throw e;}}
   if(raw===undefined)raw=await wallet.request(`/api/groups/capsules/${input.campaignId}/draw`,{method:'POST',body:JSON.stringify({requestKey:input.requestKey,count:input.count})});
   const next=capsuleResultSchema.parse(raw);
   if(next.campaignId!==input.campaignId||next.requestKey!==input.requestKey||next.count!==input.count)throw new Error('CAPSULE_RECEIPT_MISMATCH');
   if(!alive.current)return;
   sessionStorage.removeItem(storageKey);setPending(null);setRevealing(true);setResult(next);setPrevious({key:'',items:[]});setCursor(undefined);list.retry();wallet.retry();
  }catch(e){if(alive.current){
   if(e instanceof GroupRequestError&&['CAPSULE_INVALID','CAPSULE_CLOSED','CAPSULE_INSUFFICIENT_STOCK','CAPSULE_SOLD_OUT','GROUP_WALLET_INSUFFICIENT_BALANCE'].includes(e.code)){sessionStorage.removeItem(storageKey);setPending(null);list.retry();wallet.retry();setError(e.code==='GROUP_WALLET_INSUFFICIENT_BALANCE'?'insufficient':'paused');}
   else setError('unknown');
  }}finally{running.current=false;if(alive.current)setBusy(false);}
 }
 function handleDraw(event:MouseEvent<HTMLButtonElement>){const campaignId=event.currentTarget.dataset.campaignId,count=event.currentTarget.dataset.count==='10'?10:1;if(campaignId)void draw({campaignId,requestKey:crypto.randomUUID(),count});}
 if(list.loading||wallet.loading)return <p role='status'>{t.loading}</p>;
 if(!list.data||!wallet.data)return <div role='alert'><p>{t.error}</p><FanAction onClick={()=>{list.retry();wallet.retry();}}>{t.retry}</FanAction></div>;
 const ticketBalance=wallet.data.tickets;
 const campaigns=[...(previous.key===list.ownerKey?previous.items:[]),...list.data.items];
 const locked=busy||revealing||Boolean(pending)||!storageReady||wallet.data.writeFenced;
 return <div className={styles.content}><div className={styles.balance}><Ticket aria-hidden='true' size={20}/><strong>{c.tickets} {wallet.data.tickets.toLocaleString(locale)}</strong><FanAction href={`/my/wallet?locale=${locale}`}>MY</FanAction></div>
 {pending&&<section className={styles.pending} role='status'><p>{c.pending}</p><FanAction disabled={busy} onClick={()=>void draw(pending,true)}>{c.recover}</FanAction></section>}
 {error&&<p role='alert' className={styles.error}>{error==='insufficient'?raffleStateCopy(locale).insufficient:c[error]}{error==='insufficient'&&<FanAction href={`/my/wallet?locale=${locale}`}>MY</FanAction>}</p>}
 {result&&<CapsuleReveal key={result.requestKey} result={result} locale={locale} onComplete={releaseReveal}/>}
 {!campaigns.length?<p>{c.empty}</p>:campaigns.map(campaign=><section className={styles.panel} key={campaign.id}><h2>{campaign.name}</h2><div className={styles.campaign}><div className={styles.machine}><img src='/images/groups/capsule-machine.png' alt='' width={220} height={220}/></div><div className={styles.controls}><div className={styles.actions} role='group' aria-label={c.title}>{([1,10] as const).map(count=><label key={count} className={fanActionClassName('neutral')}><input type='radio' name={`capsule-count-${campaign.id}`} checked={(counts[campaign.id]??1)===count} disabled={locked} onChange={()=>setCounts(current=>({...current,[campaign.id]:count}))}/>{count===1?c.drawOne:c.drawTen}</label>)}</div><button type='button' className={fanActionClassName('primary')} disabled={locked||!canDraw(campaign,counts[campaign.id]??1,ticketBalance)} data-campaign-id={campaign.id} data-count={counts[campaign.id]??1} onClick={handleDraw}>{(counts[campaign.id]??1)===1?c.drawOne:c.drawTen}</button>{campaign.status!=='active'||campaign.prizes.some(prize=>prize.stock===0)?<p role='status'>{c.paused}</p>:ticketBalance<1?<p role='status'>{raffleStateCopy(locale).insufficient}</p>:null}<p className={styles.meta}>{c.duplicate}</p><h3>{c.prizes}</h3><ul className={styles.prizes}>{campaign.prizes.map(prize=><li key={prize.id}>{prize.imageUrl&&<GroupImage locale={locale} src={prize.imageUrl} alt='' width={48} height={48}/>}<strong>{prize.name}</strong><span>{c.probability} {(prize.weight/campaign.weightTotal).toLocaleString(locale,{style:'percent',maximumFractionDigits:4})}</span><span>{c.stock} {prize.stock.toLocaleString(locale)}</span></li>)}<li><strong>{c.blank}</strong><span>{c.probability} {(campaign.blankWeight/campaign.weightTotal).toLocaleString(locale,{style:'percent',maximumFractionDigits:4})}</span></li></ul></div></div></section>)}
 {list.data.nextCursor&&<FanAction onClick={()=>{setPrevious({key:list.ownerKey,items:campaigns});setCursor(list.data!.nextCursor??undefined);}}>{t.more}</FanAction>}</div>;
}
