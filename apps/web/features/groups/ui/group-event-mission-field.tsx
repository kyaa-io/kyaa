"use client";
import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";
import {useEffect,useState} from 'react';
import type {AppLocale} from '@/i18n/locales';
import {groupMissionsSchema,type GroupMission} from '@/server/group-activities/domain';
import {FanAction} from '@/components/fan-ui/fan-action';
import {useGroupRequest} from './use-group-resource';
import {groupsCopy} from './copy';
import {eventSourceCopy} from './event-source-copy';
import styles from './groups.module.css';
export async function loadEventMissions(request:(url:string,input?:RequestInit)=>Promise<unknown>,pageId:string,signal:AbortSignal){
 const missions:GroupMission[]=[],seen=new Set<string>();let cursor:string|null=null;
 do{const query=new URLSearchParams({limit:'100'});if(cursor)query.set('cursor',cursor);const page=groupMissionsSchema.parse(await request(`/api/groups/${pageId}/missions?${query}`,{signal}));throwIfAborted(signal);if(!page.canManage)throw new Error('FORBIDDEN');missions.push(...page.missions);cursor=page.nextCursor;if(cursor&&seen.has(cursor))throw new Error('INVALID_CURSOR');if(cursor)seen.add(cursor);}while(cursor);
 return missions;
}
export function GroupEventMissionField({pageId,locale,initialId,busy}:{pageId:string;locale:AppLocale;initialId?:string|null;busy:boolean}){
 const {request,ready,ownerKey}=useGroupRequest(),t=groupsCopy(locale),copy=eventSourceCopy(locale);
 const [revision,setRevision]=useState(0),[snapshot,setSnapshot]=useState<{key:string;missions?:GroupMission[];failed?:boolean}>(),[choice,setChoice]=useState<{owner:string;id:string;dirty:boolean}>();
 const key=`${ownerKey}:${pageId}:${revision}`;
 useEffect(()=>{if(!ready)return;const controller=new AbortController();void loadEventMissions(request,pageId,controller.signal).then(missions=>{if(!controller.signal.aborted)setSnapshot({key,missions});}).catch(()=>{if(!controller.signal.aborted)setSnapshot({key,failed:true});});return()=>controller.abort();},[key,request,ready,pageId]);
 const current=snapshot?.key===key?snapshot:undefined,selected=choice&&choice.owner===ownerKey?choice.id:initialId??'',dirty=Boolean(choice&&choice.owner===ownerKey&&choice.dirty);
 return <div><label className={styles.field}>{copy.linkedMission}<select className={styles.select} name={dirty?'linkedMissionId':undefined} disabled={busy||!current?.missions} value={selected} onChange={event=>setChoice({owner:ownerKey,id:event.target.value,dirty:true})}><option value=''>{copy.noMission}</option>{selected&&!current?.missions?.some(mission=>mission.id===selected)&&<option value={selected} disabled>{selected}</option>}{current?.missions?.map(mission=><option key={mission.id} value={mission.id}>{mission.title}</option>)}</select></label>{!current&&<p role='status'>{t.loading}</p>}{current?.failed&&<div role='alert'><p>{t.error}</p><FanAction disabled={busy} onClick={()=>setRevision(value=>value+1)}>{t.retry}</FanAction></div>}</div>;
}
