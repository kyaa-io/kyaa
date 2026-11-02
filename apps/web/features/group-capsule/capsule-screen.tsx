"use client";
import {ArrowRight,ChevronRight,RefreshCw,Ticket} from "lucide-react";
import { GroupImage } from "@/features/groups/ui/group-image";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { AppLocale } from "@/i18n/locales";
import { GroupShell } from "@/features/groups/ui/group-shell";
import { FanSiteFooter } from "@/components/fan-shell/fan-site-footer";
import { GroupActivityFrame } from "@/features/groups/ui/group-activity-frame";
import { FanAction,fanActionClassName } from "@/components/fan-ui/fan-action";
import {SourceStatePanel} from '@/features/groups/ui/source-state-panel';
import { GroupRequestError, useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { walletSchema } from "@/server/group-wallet/domain";
import { groupsCopy } from "@/features/groups/ui/copy";
import { capsulesSchema, capsuleResultSchema, pendingCapsuleSchema, canDraw, type PendingCapsule } from "./domain";
import {walletCopy} from "@/features/group-wallet/ui/copy";
import { raffleStateCopy } from "@/features/group-raffle/state-copy";
import { capsuleCopy } from "./copy";
import { CapsuleReveal } from "./capsule-reveal";
import styles from "./capsule.module.css";
const parseList=(v:unknown)=>capsulesSchema.parse(v),parseWallet=(v:unknown)=>walletSchema.parse(v);
export type CapsulePresentation={header:ReactNode;aside:ReactNode;creatorName:string;historyHref:string;claimHref:string};
export function CapsuleScreen({locale,pageId,localPresentation}:{locale:AppLocale;pageId?:string;localPresentation?:CapsulePresentation}) {
 const auth=useGroupRequest(),t=groupsCopy(locale),c=capsuleCopy(locale);
 const content=!auth.ready?<p role='status'>{t.loading}</p>:!auth.authenticated?<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/my/capsules?locale=${locale}`)}`}>{t.login}</FanAction>:<OwnedCapsules key={auth.ownerKey} locale={locale} presentation={localPresentation}/>;
 return localPresentation?<><div className={styles.creatorPage}><GroupShell locale={locale} currentPath={localPresentation.header===null?'/benefits':undefined}>{localPresentation.header}<div className={styles.creatorLayout}><section>{content}</section>{localPresentation.aside}</div></GroupShell></div><FanSiteFooter locale={locale}/></>:<GroupActivityFrame standalone locale={locale} pageId={pageId} title={c.title} hideTitle layoutClassName={styles.frame}>{content}</GroupActivityFrame>;
}
function OwnedCapsules({locale,presentation}:{locale:AppLocale;presentation?:CapsulePresentation}) {
 const t=groupsCopy(locale),c=capsuleCopy(locale),[cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<{key:string;items:ReturnType<typeof parseList>['items']}>({key:'',items:[]}),list=useGroupResource(`/api/groups/capsules${cursor?`?cursor=${cursor}`:''}`,parseList),wallet=useGroupResource('/api/me/wallet',parseWallet);
 const [counts,setCounts]=useState<Record<string,1|10>>({}),[revealing,setRevealing]=useState(false),[recovered,setRecovered]=useState(false),[pending,setPending]=useState<PendingCapsule|null>(null),[result,setResult]=useState<ReturnType<typeof capsuleResultSchema.parse>|null>(null),[storageReady,setStorageReady]=useState(false),[error,setError]=useState<'storageError'|'unknown'|'insufficient'|'paused'|null>(null),[busy,setBusy]=useState(false);
 const releaseReveal=useCallback(()=>setRevealing(false),[]);
 const running=useRef(false),alive=useRef(true),storageKey=`kyaa-capsule-pending:${wallet.ownerKey.split(':').slice(0,-1).join(':')}`;
 useEffect(()=>{alive.current=true;try{const stored=sessionStorage.getItem(storageKey);if(stored)setPending(pendingCapsuleSchema.parse(JSON.parse(stored)));setStorageReady(true);}catch{setError('storageError');}return()=>{alive.current=false;};},[storageKey]);
 async function draw(input:PendingCapsule,recover=false){
  if(running.current||!storageReady)return;running.current=true;setBusy(true);setError(null);
  try{
   sessionStorage.setItem(storageKey,JSON.stringify(input));setPending(input);
   let raw:unknown;let fromReceipt=false;
   if(recover){try{raw=await wallet.request(`/api/me/wallet/capsule-requests/${input.requestKey}`);fromReceipt=true;}catch(e){if(!(e instanceof GroupRequestError&&e.code==='CAPSULE_NOT_FOUND'))throw e;}}
   if(raw===undefined)raw=await wallet.request(`/api/groups/capsules/${input.campaignId}/draw`,{method:'POST',body:JSON.stringify({requestKey:input.requestKey,count:input.count})});
   const next=capsuleResultSchema.parse(raw);setRecovered(fromReceipt);
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
 return <div className={styles.content}>
 {pending&&<SourceStatePanel title={c.pending} description={c.pending} role='status' actions={[{label:c.recover,disabled:busy,busy,onClick:()=>void draw(pending,true),variant:'primary'}]}/>}
 {error&&<SourceStatePanel sourceId={error==='unknown'?'We1zf':undefined} title={error==='insufficient'?raffleStateCopy(locale).insufficient:locale==='ko'&&error==='unknown'?'뽑기 결과를 확인할 수 없어요':c[error]} description={error==='unknown'?c[error]:undefined} role='alert' actions={error==='insufficient'?[{label:walletCopy(locale).exchange,href:`/my/wallet?locale=${locale}`,variant:'primary'}]:pending?[{label:c.recover,onClick:()=>void draw(pending,true),disabled:busy,variant:'primary'}]:[]}/>}
 {result&&recovered&&<SourceStatePanel sourceId='es3y5' title={locale==='ko'?'이전 뽑기 결과가 있어요':c.result} description={locale==='ko'?'결과나 연출을 다시 봐도 응모권은 추가로 차감되지 않아요.':c.result} actions={[{label:locale==='ko'?'이전 결과 보기':c.result,onClick:()=>document.getElementById('capsule-confirmed-result')?.scrollIntoView({block:'center'}),variant:'primary'}]}/>}
 {result&&<div id='capsule-confirmed-result'><CapsuleReveal key={result.requestKey} result={result} locale={locale} presentation={presentation} onComplete={releaseReveal} onReturn={()=>setResult(null)}/></div>}
 {!result&&(!campaigns.length?<p>{c.empty}</p>:campaigns.map(campaign=><section className={styles.panel} key={campaign.id}><header className={styles.stageHeader}><div><h2>{presentation&&locale==='ko'?'오늘의 캡슐 럭키드로우':campaign.name}</h2><p>{locale==='ko'?'캡슐을 열면 결과를 볼 수 있어요':c.title}</p></div><div className={styles.balance}>{presentation&&<Ticket aria-hidden="true"/>}<span>{locale==='ko'?'보유 응모권':c.tickets}</span><strong>{wallet.data!.tickets.toLocaleString(locale)}{locale==='ko'?'장':''}</strong></div></header><div className={styles.campaign}><div className={styles.machine}><img src='/images/groups/capsule-machine.png' alt='' width={220} height={220}/></div><div className={styles.controls}><h3>{locale==='ko'?'뽑기 횟수':c.title}</h3><div className={styles.actions} role='group' aria-label={c.title}>{([1,10] as const).map(count=><label key={count} className={fanActionClassName('neutral')}><input type='radio' aria-label={count===1?c.drawOne:c.drawTen} name={`capsule-count-${campaign.id}`} checked={(counts[campaign.id]??1)===count} disabled={locked} onChange={()=>setCounts(current=>({...current,[campaign.id]:count}))}/><span>{count===1?c.drawOne:c.drawTen}</span><small>{c.tickets} {count}{locale==='ko'?'장':''}</small></label>)}</div><button type='button' className={fanActionClassName('primary')} disabled={locked||!canDraw(campaign,counts[campaign.id]??1,ticketBalance)} data-campaign-id={campaign.id} data-count={counts[campaign.id]??1} onClick={handleDraw}>{locale==='ko'?`응모권 ${counts[campaign.id]??1}장으로 뽑기`:(counts[campaign.id]??1)===1?c.drawOne:c.drawTen}{presentation&&<ArrowRight aria-hidden='true'/>}</button><p className={styles.remaining}>{locale==='ko'?`뽑기 후 남는 응모권 ${Math.max(0,ticketBalance-(counts[campaign.id]??1))}장`: `${c.tickets}: ${Math.max(0,ticketBalance-(counts[campaign.id]??1)).toLocaleString(locale)}`}</p>{campaign.status!=='active'||campaign.prizes.some(prize=>prize.stock===0)?<p role='status'>{c.paused}</p>:ticketBalance<1?<p role='status'>{raffleStateCopy(locale).insufficient}</p>:null}<section className={styles.prizePreview}><h3>{locale==='ko'?'캡슐 경품':c.prizes}</h3>{campaign.prizes[0]&&<div className={styles.featuredPrize}>{campaign.prizes[0].imageUrl&&<GroupImage src={campaign.prizes[0].imageUrl} locale={locale} width={116} height={78} alt=''/>}<strong>{campaign.prizes[0].name}</strong></div>}<details className={styles.probability}><summary>{locale==='ko'?'경품별 확률 보기':c.probability}</summary><ul className={styles.prizes}>{campaign.prizes.map(prize=><li key={prize.id}>{prize.imageUrl&&<GroupImage locale={locale} src={prize.imageUrl} alt='' width={48} height={48}/>}<strong>{prize.name}</strong><span>{c.probability} {(prize.weight/campaign.weightTotal).toLocaleString(locale,{style:'percent',maximumFractionDigits:4})}</span><span>{c.stock} {prize.stock.toLocaleString(locale)}</span></li>)}<li><strong>{c.blank}</strong><span>{c.probability} {(campaign.blankWeight/campaign.weightTotal).toLocaleString(locale,{style:'percent',maximumFractionDigits:4})}</span></li></ul></details><p className={styles.meta}>{locale==='ko'&&campaign.blankWeight>0?<>꽝이 있어요.<br/>10회도 당첨을 보장하지 않아요.</>:c.duplicate}</p>{presentation&&<FanAction href={presentation.historyHref}>{locale==='ko'?'내 뽑기 기록':c.result}</FanAction>}</section></div></div></section>))}
 {!result&&list.data.nextCursor&&<FanAction onClick={()=>{setPrevious({key:list.ownerKey,items:campaigns});setCursor(list.data!.nextCursor??undefined);}}>{t.more}</FanAction>}{presentation&&!result&&<div className={styles.sourceSteps}><span><RefreshCw size={18}/>{locale==='ko'?'기계 작동':c.title}</span><ChevronRight size={18}/><span><img src='/images/groups/capsule-closed.png' alt='' width={24} height={24}/>{locale==='ko'?'캡슐 열기':c.result}</span><ChevronRight size={18}/><FanAction href={presentation.historyHref} trailingIcon={<ArrowRight size={18}/>}>{locale==='ko'?'결과 모아보기':c.result}</FanAction></div>}</div>;
}
