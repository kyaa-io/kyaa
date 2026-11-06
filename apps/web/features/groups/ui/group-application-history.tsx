"use client";
import { useRef,useState } from 'react';
import { z } from 'zod';
import { CircleAlert } from 'lucide-react';
import { FanAction } from '@/components/fan-ui/fan-action';
import { FanLockedRows } from '@/components/fan-ui/fan-locked-value';
import { FanSkeletonRows } from '@/components/fan-ui/fan-skeleton';
import { FanTag } from '@/components/fan-ui/fan-tag';
import { fanLoginHref } from '@/components/login-href';
import type { AppLocale } from '@/i18n/locales';
import { useGroupResource } from './use-group-resource';
import { GroupImageField,imageAssetInput } from "./group-image-field";
import { applicationReceiptSchema } from '../domain/contracts';
import {isLegacyQualification,qualificationSchema} from '../domain/qualification';
import {GroupQualificationForm} from './group-qualification';
import {groupApplyText,type GroupApplyCopyKey} from './group-apply-copy';
import {useOperatingExperience} from './operating-experience-fields';
import {SourceStatePanel} from './source-state-panel';
import { groupsCopy } from './copy';
import styles from './groups.module.css';
import statusStyles from './group-application-status.module.css';
const application=z.object({qualification:qualificationSchema.nullable().optional(),submissionRevision:z.number().int().min(1).default(1),id:z.uuid(),kind:z.enum(['fan','hobby','brand']),name:z.string(),description:z.string(),question:z.string().nullable(),imageUrl:z.string().nullable().optional(),image_url:z.string().nullable().optional(),status:z.enum(['submitted','reviewing','changes_requested','approved','rejected']),reason:z.string().nullable(),pageId:z.uuid().nullable().optional(),createdAt:z.string()});
type Application=z.infer<typeof application>;
const parse=(v:unknown)=>z.object({items:z.array(application),nextCursor:z.string().nullable()}).parse(v);
const statusView:Record<Application['status'],{label:GroupApplyCopyKey;tone:'fan'|'neutral'|'notice'}>={submitted:{label:'statusReviewing',tone:'neutral'},reviewing:{label:'statusReviewing',tone:'neutral'},changes_requested:{label:'statusChanges',tone:'notice'},approved:{label:'statusApproved',tone:'fan'},rejected:{label:'statusRejected',tone:'neutral'}};
const resubmitLabel:Record<AppLocale,string>={ko:'보완하여 다시 신청',en:'Resubmit',ja:'再申請','zh-Hans':'重新申请','zh-Hant':'重新申請',es:'Reenviar',id:'Ajukan ulang',vi:'Gửi lại',th:'ส่งใหม่',pt:'Reenviar',fr:'Renvoyer',ru:'Подать снова'};
/** Beside the application form the list stays out of the way until there is something in it. `standalone` is the 내 신청 screen and always answers. */
export function GroupApplicationHistory({locale,standalone=false}:{locale:AppLocale;standalone?:boolean}){
 const t=groupsCopy(locale),[cursor,setCursor]=useState<string>(),[prior,setPrior]=useState<{key:string;items:Application[]}>({key:'',items:[]}),r=useGroupResource(`/api/groups/applications${cursor?`?cursor=${cursor}`:''}`,parse);
 const rows=[...(prior.key===r.ownerKey?prior.items:[]),...(r.data?.items??[])];
 if(!r.authenticated)return standalone?<div className={statusStyles.guest}><FanLockedRows rows={2}/><FanAction variant='primary' href={fanLoginHref(locale,`/pages/groups/apply?view=mine&locale=${locale}`)}>{t.login}</FanAction></div>:null;
 if(r.loading&&!rows.length)return standalone?<FanSkeletonRows rows={3} variant='plain' ariaLabel={t.loading}/>:null;
 if(!standalone&&!r.error&&!rows.length)return null;
 const title=!standalone&&<h2 className={statusStyles.title}>{groupApplyText(locale,'mineTitle')}</h2>;
 if(r.error&&!rows.length)return <section className={statusStyles.list}>{title}<SourceStatePanel sourceId='application-status-error' title={t.error} icon={<CircleAlert size={24}/>} feedback='danger' role='alert' actions={[{label:t.retry,onClick:r.retry,variant:'primary'}]}/></section>;
 if(!rows.length)return <SourceStatePanel sourceId='application-status-empty' illustration='page' role='status' title={groupApplyText(locale,'mineEmpty')} actions={[{label:groupApplyText(locale,'fanPageApply'),href:`/pages/groups/apply?kind=fan&locale=${locale}`,variant:'primary'}]}/>;
 return <section className={statusStyles.list}>{title}{rows.map(item=><ApplicationItem key={`${r.ownerKey}:${item.id}:${item.submissionRevision}`} item={item} locale={locale} request={r.request} refresh={r.retry}/>)}{r.data?.nextCursor&&<FanAction onClick={()=>{setPrior({key:r.ownerKey,items:rows});setCursor(r.data!.nextCursor??undefined);}}>{t.more}</FanAction>}</section>;
}
function ApplicationItem({item,locale,request,refresh}:{item:Application;locale:AppLocale;request:ReturnType<typeof useGroupResource>['request'];refresh:()=>void}){
 const [supplementing,setSupplementing]=useState(false),view=statusView[item.status],legacy=item.qualification&&isLegacyQualification(item.qualification)?item.qualification:null;
 return <article className={statusStyles.item}>
  <header className={statusStyles.head}><strong>{item.name}</strong><FanTag tone={view.tone}>{groupApplyText(locale,view.label)}</FanTag></header>
  <time className={statusStyles.date} dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(locale,{timeZone:'Asia/Seoul'})}</time>
  {item.reason&&item.status!=='submitted'&&item.status!=='reviewing'&&<p className={statusStyles.reason}>{item.reason}</p>}
  {item.status==='approved'&&item.pageId&&<FanAction href={`/pages/groups/${item.pageId}?locale=${locale}`} className={statusStyles.action}>{groupApplyText(locale,'viewPage')}</FanAction>}
  {item.status==='changes_requested'&&(legacy?<><FanAction onClick={()=>setSupplementing(true)} className={statusStyles.action}>{resubmitLabel[locale]}</FanAction>{supplementing&&<GroupQualificationForm key={`${item.id}:${item.submissionRevision}`} locale={locale} application={{id:item.id,kind:item.kind,qualification:legacy,submissionRevision:item.submissionRevision}} supplement={{status:groupApplyText(locale,'statusChanges'),reason:item.reason,onClose:()=>setSupplementing(false)}} onSaved={refresh}/>}</>:<ReviseForm item={item} locale={locale} request={request} refresh={refresh}/>)}
 </article>;
}
function ReviseForm({item,locale,request,refresh}:{item:Application;locale:AppLocale;request:ReturnType<typeof useGroupResource>['request'];refresh:()=>void}){
 const t=groupsCopy(locale),[imageReady,setImageReady]=useState(true),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),operation=useRef<{input:string;requestId:string}|undefined>(undefined);
 const answer=item.qualification&&!isLegacyQualification(item.qualification)?item.qualification:null,experience=useOperatingExperience({locale,disabled:busy,initial:answer});
 return <form className={styles.form} onSubmit={async event=>{event.preventDefault();if(busy||!imageReady||experience.blocked)return;const qualification=experience.read();if(!qualification)return;const f=new FormData(event.currentTarget),payload={kind:item.kind,name:f.get('name'),description:f.get('description'),question:f.get('question')||null,imageAssetId:imageAssetInput(f),qualification,expectedRevision:item.submissionRevision},input=JSON.stringify(payload);if(operation.current?.input!==input)operation.current={input,requestId:crypto.randomUUID()};setBusy(true);setFailed(false);try{applicationReceiptSchema.parse(await request(`/api/groups/applications/${item.id}`,{method:'PATCH',body:JSON.stringify({...payload,requestId:operation.current.requestId})}));experience.markUsed();operation.current=undefined;refresh();}catch{setFailed(true);}finally{setBusy(false);}}}>
  {item.kind!=='fan'&&<GroupImageField locale={locale} initialUrl={item.imageUrl??item.image_url} disabled={busy} onReadyChange={setImageReady}/>}
  <label className={styles.field}>{t.name}<input name='name' className={styles.input} defaultValue={item.name} required maxLength={100} disabled={busy}/></label>
  <label className={styles.field}>{t.description}<textarea name='description' className={styles.textarea} defaultValue={item.description} required maxLength={1000} disabled={busy}/></label>
  {experience.node}
  {item.kind!=='fan'&&<label className={styles.field}>{t.question}<input name='question' className={styles.input} defaultValue={item.question??''} maxLength={300} disabled={busy}/></label>}
  <FanAction type='submit' disabled={busy||!imageReady||experience.blocked}>{resubmitLabel[locale]}</FanAction>{failed&&<p role='alert'>{t.error}</p>}
 </form>;
}
