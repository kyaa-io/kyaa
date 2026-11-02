"use client";
import { GroupImage } from "./group-image";
import { useRef,useState,type ReactNode } from 'react';
import { Coins, FileText, ListChecks } from 'lucide-react';
import { groupMissionDetailSchema, groupSubmissionsSchema, groupMissionsSchema } from '@/server/group-activities/domain';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import { useGroupResource } from './use-group-resource';
import { GroupShell } from './group-shell';
import { groupsCopy } from './copy';
import { activitiesCopy } from './activities-copy';
import { managementCopy } from './management-copy';
import { GroupMissionEditor } from './group-activity-editors';
import styles from './groups.module.css';
import {GroupTextTask} from './group-text-task';
import {taskSubmitCopy} from './task-submit-copy';
import overviewStyles from './group-mission-screen.module.css';
import {walletSchema} from '@/server/group-wallet/domain';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {groupDetailSchema,groupHref} from '../domain/contracts';
const parseMission=(v:unknown)=>groupMissionDetailSchema.parse(v),parseSubmissions=(v:unknown)=>groupSubmissionsSchema.parse(v);
export function GroupMissionScreen({pageId,missionId,locale}:{pageId:string;missionId:string;locale:AppLocale}){
 const t=groupsCopy(locale),c=activitiesCopy(locale),m=managementCopy(locale),base=`/api/groups/${pageId}/missions/${missionId}`,r=useGroupResource(base,parseMission),[editing,setEditing]=useState(false),[writing,setWriting]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<{key:string;items:ReturnType<typeof parseSubmissions>['items']}>({key:'',items:[]}),submissions=useGroupResource(r.data?.canReview?`${base}/submissions${cursor?`?cursor=${cursor}`:''}`:null,parseSubmissions),operation=useRef<{key:string;requestId:string}|undefined>(undefined);
 async function mutate(path:string,method:string,input:Record<string,unknown>){if(busy)return false;const key=JSON.stringify([path,method,input]);if(operation.current?.key!==key)operation.current={key,requestId:crypto.randomUUID()};setBusy(true);setFailed(false);try{await r.request(base+path,{method,body:JSON.stringify({...input,requestId:operation.current.requestId})});operation.current=undefined;setPrevious({key:'',items:[]});setCursor(undefined);r.retry();submissions.retry();return true;}catch{setFailed(true);return false;}finally{setBusy(false);}}

 if(!r.data)return <GroupShell locale={locale}><p role={r.error?'alert':'status'}>{r.error?t.error:t.loading}</p>{r.error&&<FanAction onClick={r.retry}>{t.retry}</FanAction>}</GroupShell>;
 const d=r.data,rows=[...(previous.key===r.ownerKey?previous.items:[]),...(submissions.data?.items??[])];
 return <GroupShell locale={locale}><header className={styles.identity}><ListChecks aria-hidden='true'/><h1>{d.mission.title}</h1>{d.canReview&&<FanAction onClick={()=>setEditing(!editing)}>{m.manage}</FanAction>}</header>{editing?<GroupMissionEditor pageId={pageId} locale={locale} initial={d.mission} done={()=>{setEditing(false);r.retry();}}/>:<section className={styles.panel}>{d.mission.imageUrl&&<GroupImage locale={locale} src={d.mission.imageUrl} alt='' style={{maxWidth:360,width:'100%',height:'auto',objectFit:'contain'}}/>}<p style={{whiteSpace:'pre-wrap'}}>{d.mission.instructions}</p>{d.mission.rewardPoints>0&&<p>{c.reward} {d.mission.rewardPoints.toLocaleString(locale)} P</p>}{d.submission&&<div role='status'><strong>{c[d.submission.status]}</strong>{d.submission.reason&&<p>{d.submission.reason}</p>}</div>}{d.canSubmit&&<FanAction variant='primary' onClick={()=>{setFailed(false);setWriting(true);}}>{taskSubmitCopy[locale].mission}</FanAction>}{d.canSubmit&&writing&&<GroupTextTask key={r.ownerKey} locale={locale} title={d.mission.title} submitLabel={taskSubmitCopy[locale].mission} label={m.body} initialValue={d.submission?.body??''} maxLength={10000} busy={busy} failed={failed} onSubmit={body=>mutate('/submissions','POST',{body})} onClose={()=>setWriting(false)}/>}{!r.authenticated&&<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/pages/groups/${pageId}/missions/${missionId}?locale=${locale}`)}`}>{t.login}</FanAction>}</section>}{d.canReview&&<section className={styles.panel}><h2>{c.missions}</h2>{submissions.error?<p role='alert'>{t.error}</p>:rows.map(item=><article className={styles.panel} key={item.id}><strong>{item.nickname}</strong><p style={{whiteSpace:'pre-wrap'}}>{item.body}</p><span>{c[item.status]}</span>{item.status==='pending'&&<div className={styles.actions}><FanAction disabled={busy} onClick={()=>void mutate(`/submissions/${item.id}`,'PATCH',{action:'approve'})}>{c.completed}</FanAction><FanAction disabled={busy} onClick={()=>{const reason=window.prompt(`${c.rejected} · ${t.description}`);if(reason?.trim())void mutate(`/submissions/${item.id}`,'PATCH',{action:'reject',reason});}}>{c.rejected}</FanAction></div>}</article>)}{submissions.data?.nextCursor&&<FanAction onClick={()=>{setPrevious({key:r.ownerKey,items:rows});setCursor(submissions.data!.nextCursor??undefined);}}>{t.more}</FanAction>}</section>}{failed&&<p role='alert' className={styles.error}>{t.error}</p>}</GroupShell>;
}


const parseOverview=(value:unknown)=>groupMissionsSchema.parse(value),parseOverviewGroup=(value:unknown)=>groupDetailSchema.parse(value),parseOverviewWallet=(value:unknown)=>walletSchema.parse(value);
type MissionCardLabels=Record<string,{category:string;action:string}>;
export function GroupMissionsOverview({pageId,locale,header,creatorName,missionLabels={}}:{pageId:string;locale:AppLocale;header?:ReactNode;creatorName?:string;missionLabels?:MissionCardLabels}){
 const t=groupsCopy(locale),c=activitiesCopy(locale),w=walletCopy(locale);
 const [cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<{key:string;items:ReturnType<typeof parseOverview>['missions']}>({key:'',items:[]});
 const list=useGroupResource(`/api/groups/${pageId}/missions${cursor?`?cursor=${cursor}`:''}`,parseOverview),group=useGroupResource(`/api/groups/${pageId}`,parseOverviewGroup),wallet=useGroupResource(list.authenticated?'/api/me/wallet':null,parseOverviewWallet);
 const owner=`${list.ownerKey}:${pageId}`,missions=[...(previous.key===owner?previous.items:[]),...(list.data?.missions??[])].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index),participated=missions.filter(item=>item.status!=='available');
 const retry=()=>{setCursor(undefined);setPrevious({key:'',items:[]});list.retry();};
 const missionHref=(href:string)=>`${href}${href.includes('?')?'&':'?'}locale=${locale}`;
 const card=(mission:ReturnType<typeof parseOverview>['missions'][number])=><article key={mission.id} className={`${overviewStyles.card} ${mission.imageUrl?overviewStyles.photoCard:''}`}>
  {mission.imageUrl?<GroupImage src={mission.imageUrl} locale={locale} alt='' width={300} height={225}/>:<FileText className={overviewStyles.cardIcon} size={28} aria-hidden='true'/>}
  <div className={overviewStyles.cardCopy}><span>{missionLabels[mission.id]?.category??c.missions}</span><h3>{mission.title}</h3><p>{mission.instructions}</p></div>
  <FanAction variant='neutral' href={missionHref(mission.actionHref)}>{missionLabels[mission.id]?.action??t.submit}</FanAction>
 </article>;
 const imageMissions=missions.filter(item=>item.imageUrl),textMissions=missions.filter(item=>!item.imageUrl),page=group.data?.page;
 return <GroupShell locale={locale}>{header??<header className={overviewStyles.fallbackHeader}><h1>{creatorName??page?.name??c.missions}</h1></header>}
  <div className={overviewStyles.layout}><section className={overviewStyles.main}>
   <header className={overviewStyles.heading}><h2>{locale==='ko'?'오늘의 덕질':c.missions}</h2><div className={overviewStyles.filters}>{(creatorName||page)&&<FanAction variant='neutral' href={page?`${groupHref(page,locale)}&tab=activities`:`/pages/groups/${pageId}?locale=${locale}&tab=activities`}>{creatorName??page?.name}</FanAction>}{group.data?.membership&&<FanAction variant='neutral' href={`/pages/groups?mine=joined&locale=${locale}`}>{locale==='ko'?'참여 중':t.joinedPages}</FanAction>}<FanAction variant='text' href={`/pages/groups?locale=${locale}`}>{locale==='ko'?'전체 모임 보기':t.explore}</FanAction></div></header>
   <section className={overviewStyles.attendance}><div><span className={overviewStyles.availability}>{wallet.data?wallet.data.attendance.checkedIn?w.checkedIn:locale==='ko'?'오늘 참여 가능':c.published:!list.authenticated?t.login:wallet.error?t.error:t.loading}</span><h3>{locale==='ko'?'오늘 출석체크':w.attendance}</h3><p>{locale==='ko'?'출석하고 포인트를 받으세요.':w.checkIn}</p><FanAction className={overviewStyles.attendanceAction} variant='primary' href={`/my/wallet?view=attendance&locale=${locale}`}>{w.attendance}</FanAction></div><img src='/images/groups/mission-attendance.png' width={180} height={180} alt=''/></section>
   {list.error?<div role='alert'><p>{t.error}</p><FanAction onClick={retry}>{t.retry}</FanAction></div>:list.loading?<p role='status'>{t.loading}</p>:!missions.length?<p>{t.empty}</p>:<div className={overviewStyles.cards}>{imageMissions.map(card)}{textMissions.length>0&&<div className={overviewStyles.textCards}>{textMissions.map(card)}</div>}</div>}
   {list.data?.nextCursor&&<FanAction onClick={()=>{setPrevious({key:owner,items:missions});setCursor(list.data!.nextCursor??undefined);}}>{t.more}</FanAction>}
  </section><aside className={overviewStyles.aside}><section className={overviewStyles.history}><h2>{locale==='ko'?'내 참여 내역':w.history}</h2>{participated.length?<ol>{participated.map(mission=><li key={mission.id}><span className={overviewStyles.status} data-status={mission.status}>{locale==='ko'&&mission.status==='completed'?'참여 완료':c[mission.status==='available'?'published':mission.status]}</span><strong>{mission.title}</strong><FanAction variant='text' href={missionHref(mission.actionHref)}>{locale==='ko'?'제출 내역 보기':c.review}</FanAction></li>)}</ol>:<p>{list.loading?t.loading:t.empty}</p>}</section><section className={overviewStyles.rewards}><Coins size={32} aria-hidden='true'/><h2>{locale==='ko'?'활동 보상':c.reward}</h2><p>{locale==='ko'?'보상은 포인트 내역에서 확인할 수 있어요.':w.history}</p><FanAction variant='neutral' href={`/my/wallet?locale=${locale}`}>{locale==='ko'?'포인트 내역 보기':w.history}</FanAction></section></aside></div>
 </GroupShell>;
}
