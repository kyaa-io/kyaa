"use client";
import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import type { AppLocale } from "@/i18n/locales";
import { groupPostsSchema } from "../domain/contracts";
import { groupNoticeBroadcastStatusSchema, type GroupNoticeBroadcastStatus } from "../domain/operator-tools";
import { operatorToolsCopy } from "./operator-tools-copy";
import own from "./group-operator-members.module.css";
import { operatorCopy } from "./group-operator-copy";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { groupsCopy } from "./copy";
import { useGroupPostBody } from "./group-post-body";
import { useGroupRequest, useGroupResource } from "./use-group-resource";
import styles from "./group-operator-stats.module.css";
const parse=(value:unknown)=>groupPostsSchema.parse(value);
type Item=ReturnType<typeof parse>["items"][number];
// 목록 응답에는 bodyDoc이 없다. 수정은 항상 상세(format=rich)로 시작해야 서식과 첨부를 잃지 않는다.
const detailSchema=groupPostsSchema.shape.items.element.extend({assets:z.array(z.object({id:z.uuid(),kind:z.enum(["image","video"]),width:z.number().nullable().optional(),height:z.number().nullable().optional()})).optional(),bodyDoc:z.unknown().optional(),bodyDocUnavailable:z.boolean().optional()});
const parseDetail=(value:unknown)=>detailSchema.parse(value);
const parseBroadcast=(value:unknown)=>groupNoticeBroadcastStatusSchema.parse(value);
type Detail=z.infer<typeof detailSchema>;
/** 운영진 공지(`group_posts`) 입력. kyaa 공식 공지(`celebrity_notices`)는 이 폼을 쓰지 않는다. */
function NoticeForm({locale,post,pending,broadcast,onSave,onCancel}:{locale:AppLocale;post?:Detail;pending:boolean;broadcast?:GroupNoticeBroadcastStatus;onSave:(input:Record<string,unknown>)=>Promise<boolean>;onCancel:()=>void}){
 const t=operatorCopy(locale),o=operatorToolsCopy(locale),[initial]=useState(post),[title,setTitle]=useState(initial?.title??""),[notify,setNotify]=useState(false),canNotify=!post&&broadcast?.noticeBroadcastEnabled===true,notifyOpen=canNotify&&broadcast?.noticeBroadcastRemainingToday===1;
 const body=useGroupPostBody({locale,label:t.body,disabled:pending,initial:initial&&{body:initial.body,bodyDoc:initial.bodyDoc,bodyDocUnavailable:initial.bodyDocUnavailable,assets:initial.assets}});
 const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(pending||body.blocked||!title.trim())return;const f=new FormData(e.currentTarget);if(await onSave({title,...body.submission(),visibility:f.get("visibility")==="members"?"members":"public",category:"notice",...(notifyOpen&&notify?{notifyMembers:true}:{})}))body.commit();};
 return <form className={styles.form} onSubmit={submit}>
  <label className={styles.field}>{t.title}<input name="title" required maxLength={100} value={title} disabled={pending} onChange={e=>setTitle(e.target.value)}/></label>
  <div className={styles.field}><span>{t.body}</span>{body.field}</div>
  <label className={styles.field}>{t.visibility}<select name="visibility" defaultValue={initial?.visibility??"public"} disabled={pending}><option value="public">{t.public}</option><option value="members">{t.members_only}</option></select></label>
  {canNotify&&<div className={styles.field}><label className={own.toggle}><input type="checkbox" name="notifyMembers" checked={notifyOpen&&notify} disabled={pending||!notifyOpen} onChange={e=>setNotify(e.target.checked)}/>{o.notify}</label>{!notifyOpen&&<p className={own.toggleNote}>{o.notifyUsed}</p>}</div>}
  <div className={styles.row}><FanAction type="submit" variant="primary" disabled={pending||body.blocked||!title.trim()}>{t.save}</FanAction><FanAction onClick={onCancel}>{t.cancel}</FanAction></div>
 </form>;
}
export function GroupOperatorNotices({pageId,locale}:{pageId:string;locale:AppLocale}){
 const t=operatorCopy(locale),more=groupsCopy(locale).more,base=`/api/groups/${pageId}/posts`,auth=useGroupRequest(),[cursor,setCursor]=useState<string>(),[prior,setPrior]=useState<{key:string;items:Item[]}>({key:"",items:[]}),r=useGroupResource(`${base}?category=notice&limit=50${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`,parse);
 const items=[...(prior.key===r.ownerKey?prior.items:[]),...(r.data?.items??[])];
 const [editing,setEditing]=useState<Item|"new"|null>(null),[pending,setPending]=useState(false),[failed,setFailed]=useState<false|"error"|"notified">(false),op=useRef<{key:string;id:string}|undefined>(undefined);
 const run=async(path:string,method:string,input:Record<string,unknown>)=>{if(pending)return false;setPending(true);setFailed(false);const key=JSON.stringify([path,method,input]);if(op.current?.key!==key)op.current={key,id:crypto.randomUUID()};try{await auth.request(base+path,{method,body:JSON.stringify({...input,requestId:op.current.id})});op.current=undefined;setCursor(undefined);setPrior({key:"",items:[]});r.retry();if(input.notifyMembers)broadcast.retry();return true;}catch(error){// GroupRequestError: 409 GROUPS_RATE_LIMITED = 오늘 몫을 이미 썼다(글도 저장되지 않았다).
 const notified=error instanceof Error&&"status" in error&&error.status===409&&"code" in error&&String(error.code).startsWith("GROUPS_RATE_LIMITED");if(notified){op.current=undefined;broadcast.retry();}setFailed(notified?"notified":"error");return false;}finally{setPending(false);}};
 const broadcast=useGroupResource(editing==="new"?`/api/groups/${pageId}/notice-broadcast`:null,parseBroadcast),cur=editing&&editing!=="new"?editing:null,detail=useGroupResource(cur?`${base}/${cur.id}?format=rich`:null,parseDetail,{forEdit:true});
 const save=async(input:Record<string,unknown>)=>{const ok=cur?await run(`/${cur.id}`,"PATCH",input):await run("","POST",input);if(ok)setEditing(null);return ok;};
 const remove=async(item:Item)=>{if(window.confirm(t.confirmRemove)&&await run(`/${item.id}`,"DELETE",{}))setEditing(null);};
 return <section id="notices" className={styles.section}>
  <div className={styles.head}><h2>{t.noticesTitle}</h2>{!editing&&<FanAction variant="text" onClick={()=>setEditing("new")}>{t.write}{" "}<span aria-hidden="true">›</span></FanAction>}</div>
  {editing==="new"?<NoticeForm key="new" locale={locale} pending={pending} broadcast={broadcast.data} onSave={save} onCancel={()=>setEditing(null)}/>:cur&&detail.data?<NoticeForm key={cur.id} locale={locale} post={detail.data} pending={pending} onSave={save} onCancel={()=>setEditing(null)}/>:cur&&<div className={styles.status}>{detail.error?<><p role="alert" className={styles.error}>{t.error}</p><div className={styles.row}><FanAction onClick={detail.retry}>{t.retry}</FanAction><FanAction onClick={()=>setEditing(null)}>{t.cancel}</FanAction></div></>:<FanSkeletonRows rows={3} variant="plain" ariaLabel={t.loading}/>}</div>}
  {failed&&<p role="alert" className={styles.error}>{failed==="notified"?operatorToolsCopy(locale).notifyUsed:t.error}</p>}
  {editing?null:r.error?<div className={styles.status}><p role="alert" className={styles.error}>{t.error}</p><button type="button" className={styles.btn} onClick={r.retry}>{t.retry}</button></div>:items.length===0&&!r.data?<FanSkeletonRows rows={3} variant="plain" ariaLabel={t.loading}/>:items.length===0?<p className={styles.status}>{t.empty}</p>:
   <ul className={styles.list}>{items.map(item=><li key={item.id} className={styles.item}><h3>{item.title}</h3><p>{item.body}</p><span className={styles.meta}>{new Date(item.createdAt).toLocaleDateString(locale)} · {item.visibility==="members"?t.members_only:t.public}</span>
    <div className={styles.row}><button type="button" className={styles.btn} onClick={()=>setEditing(item)}>{t.edit}</button><button type="button" className={styles.btn} disabled={pending} onClick={()=>void remove(item)}>{t.remove}</button></div></li>)}</ul>}
  {!editing&&items.length>0&&(r.data?.nextCursor||r.loading)&&<FanAction variant="neutral" disabled={pending||r.loading} onClick={()=>{if(!r.data?.nextCursor)return;setPrior({key:r.ownerKey,items});setCursor(r.data.nextCursor);}}>{more}</FanAction>}
 </section>;
}
