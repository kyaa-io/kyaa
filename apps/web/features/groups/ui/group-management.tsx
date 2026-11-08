"use client";
import { GroupSettingsPanel } from "./group-settings-panel";
import { imageAssetInput } from "./group-image-field";
import { GroupReportManager } from "./group-report-manager";
import { GroupCollectionEditor } from "./group-activity-editors";
import {GroupManageEvents} from './group-manage-events';
import {GroupManageGifts} from './group-manage-gifts';
import {GroupManageMissions,GroupManageRaffles} from './group-manage-activities';
import {manageFormText} from './manage-form-copy';
import {FanSkeletonRows} from '@/components/fan-ui/fan-skeleton';
import { useRef, useState, type FormEvent } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { groupRoomsSchema, type GroupDetail } from "../domain/contracts";
import { useGroupRequest,useGroupResource } from "./use-group-resource";
import { GroupOperatorStats } from "./group-operator-stats";
import { GroupOperatorNotices } from "./group-operator-notices";
import { groupsCopy } from "./copy";
import { roomStatusCopy } from "./room-status-copy";
import { activitiesCopy } from "./activities-copy";
import { managementCopy } from "./management-copy";
import { GroupManagementMembers } from "./group-management-members";
import type { GroupManagementPresentation } from './management-presentation';
import styles from "./groups.module.css";
import { tierDisplayName } from "@/features/passport/domain/passport-read-model";
const parseRooms=(value:unknown)=>groupRoomsSchema.parse(value);
export function GroupManagement({detail,locale,refresh,section="members",localPresentation,initialGiftId}:{initialGiftId?:string;detail:GroupDetail;locale:AppLocale;refresh:()=>void;section?:string;localPresentation?:GroupManagementPresentation}) {
 const t=groupsCopy(locale),m=managementCopy(locale),c=activitiesCopy(locale),roomLabels=roomStatusCopy(locale),base=`/api/groups/${detail.page.id}`,auth=useGroupRequest(),rooms=useGroupResource(section==='rooms'?`${base}/rooms`:null,parseRooms);
 const [imageReady,setImageReady]=useState(true);
 const [pending,setPending]=useState(false),[error,setError]=useState(false),operation=useRef<{key:string;requestId:string}|undefined>(undefined);
 const mutate=async(path:string,method:string,input:Record<string,unknown>)=>{if(pending)return false;setPending(true);setError(false);const key=JSON.stringify([path,method,input]);if(operation.current?.key!==key)operation.current={key,requestId:crypto.randomUUID()};try{await auth.request(base+path,{method,body:JSON.stringify({...input,requestId:operation.current.requestId})});operation.current=undefined;refresh();rooms.retry();return true;}catch{setError(true);return false;}finally{setPending(false);}};
 const save=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(!imageReady)return;const f=new FormData(e.currentTarget);void mutate('','PATCH',{imageAssetId:imageAssetInput(f),name:f.get('name'),description:f.get('description'),question:f.get('question')||null,anonymous:f.get('anonymous')==='on'});};
 const room=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);void mutate('/rooms','POST',{name:f.get('roomName'),minimumTier:f.get('minimumTier')||'Gold'});};
 return <div className={styles.form}>{section==='events'&&<GroupManageEvents pageId={detail.page.id} pageName={detail.page.name} locale={locale}/>}{section==='missions'&&<GroupManageMissions pageId={detail.page.id} pageName={detail.page.name} locale={locale}/>}{section==='collection'&&<details open id="collection" className={styles.panel}><summary>{c.createCollection}</summary><GroupCollectionEditor pageId={detail.page.id} locale={locale}/></details>}{section==='gifts'&&<GroupManageGifts pageId={detail.page.id} locale={locale}/>}{section==='raffles'&&<GroupManageRaffles pageId={detail.page.id} pageName={detail.page.name} locale={locale} initialGiftId={initialGiftId}/>}{section==='settings'&&<GroupSettingsPanel detail={detail} locale={locale} pending={pending} saveDisabled={!imageReady} onSubmit={save} onImageReady={setImageReady} localBoards={localPresentation?.boards} onLeave={()=>{if(window.confirm(m.leave))void mutate('/membership','DELETE',{});}}/>}

 {section==='rooms'&&<><section id="rooms" className={styles.panel}><h2>{m.createRoom}</h2><form className={styles.form} onSubmit={room}><label className={styles.field}>{m.roomName}<input name="roomName" className={styles.input} required maxLength={100} disabled={pending}/></label>{detail.page.kind==='fan'&&<label className={styles.field}>{m.minimumTier}<select name="minimumTier" className={styles.select} defaultValue="Gold" disabled={pending}>{['Member','Bronze','Silver','Gold','Platinum','Diamond'].map(x=><option key={x} value={x}>{x==='Member'?m.member:tierDisplayName(locale,x)}</option>)}</select></label>}<FanAction type="submit" disabled={pending}>{m.createRoom}</FanAction></form></section>
 <section className={styles.panel}><h2>{t.rooms}</h2>{rooms.data&&!rooms.data.items.length&&<p>{manageFormText(locale,'roomsNone')}</p>}{rooms.loading&&!rooms.data&&<FanSkeletonRows rows={2} variant='plain' ariaLabel={t.loading}/>}{rooms.data?.items.map(item=><details key={item.id}><summary>{item.name}</summary><form className={styles.form} onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);void mutate(`/rooms/${item.id}`,'PATCH',{name:f.get('name'),status:f.get('status'),minimumTier:f.get('minimumTier')||null,opensAt:f.get('opensAt')?new Date(String(f.get('opensAt'))).toISOString():undefined,closesAt:f.get('closesAt')?new Date(String(f.get('closesAt'))).toISOString():undefined});}}><label className={styles.field}>{m.roomName}<input className={styles.input} name='name' defaultValue={item.name} required disabled={pending}/></label><select name='status' className={styles.select} aria-label={t.rooms} defaultValue={item.status} disabled={pending}>{(['scheduled','open','readonly','closed'] as const).map(status=><option key={status} value={status}>{roomLabels[status]}</option>)}</select><label className={styles.field}>{c.opens}<input type='datetime-local' name='opensAt' className={styles.input} defaultValue={item.opensAt?new Date(Date.parse(item.opensAt)-new Date(item.opensAt).getTimezoneOffset()*60000).toISOString().slice(0,16):''} disabled={pending}/></label><label className={styles.field}>{c.closes}<input type='datetime-local' name='closesAt' className={styles.input} defaultValue={item.closesAt?new Date(Date.parse(item.closesAt)-new Date(item.closesAt).getTimezoneOffset()*60000).toISOString().slice(0,16):''} disabled={pending}/></label>{detail.page.kind==='fan'&&<label className={styles.field}>{m.minimumTier}<select className={styles.select} name='minimumTier' defaultValue={item.minimumTier??'Gold'} disabled={pending}>{['Member','Bronze','Silver','Gold','Platinum','Diamond'].map(tier=><option key={tier} value={tier}>{tier==='Member'?m.member:tierDisplayName(locale,tier)}</option>)}</select></label>}<FanAction type='submit' disabled={pending}>{m.save}</FanAction></form></details>)}{rooms.error&&<FanAction onClick={rooms.retry}>{t.retry}</FanAction>}</section></>}
 {section==='reports'&&<GroupReportManager pageId={detail.page.id} locale={locale} localPosts={localPresentation?.posts} localReports={localPresentation?.reports} initialTab={localPresentation?.reportTab}/>} {section==='stats'&&<GroupOperatorStats pageId={detail.page.id} locale={locale}/>}{section==='notices'&&<GroupOperatorNotices pageId={detail.page.id} locale={locale}/>}{section==='members'&&<GroupManagementMembers detail={detail} locale={locale} refresh={refresh}/>} {error&&<p role="alert" className={styles.error}>{t.error}</p>}</div>;
}
