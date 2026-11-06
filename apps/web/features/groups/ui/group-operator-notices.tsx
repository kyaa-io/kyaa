"use client";
import { useRef, useState, type FormEvent } from "react";
import type { AppLocale } from "@/i18n/locales";
import { groupPostsSchema } from "../domain/contracts";
import { operatorCopy } from "./group-operator-copy";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { groupsCopy } from "./copy";
import { useGroupRequest, useGroupResource } from "./use-group-resource";
import styles from "./group-operator-stats.module.css";
const parse=(value:unknown)=>groupPostsSchema.parse(value);
type Item=ReturnType<typeof parse>["items"][number];
export function GroupOperatorNotices({pageId,locale}:{pageId:string;locale:AppLocale}){
 const t=operatorCopy(locale),more=groupsCopy(locale).more,base=`/api/groups/${pageId}/posts`,auth=useGroupRequest(),[cursor,setCursor]=useState<string>(),[prior,setPrior]=useState<{key:string;items:Item[]}>({key:"",items:[]}),r=useGroupResource(`${base}?category=notice&limit=50${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`,parse);
 const items=[...(prior.key===r.ownerKey?prior.items:[]),...(r.data?.items??[])];
 const [editing,setEditing]=useState<Item|"new"|null>(null),[pending,setPending]=useState(false),[failed,setFailed]=useState(false),op=useRef<{key:string;id:string}|undefined>(undefined);
 const run=async(path:string,method:string,input:Record<string,unknown>)=>{if(pending)return false;setPending(true);setFailed(false);const key=JSON.stringify([path,method,input]);if(op.current?.key!==key)op.current={key,id:crypto.randomUUID()};try{await auth.request(base+path,{method,body:JSON.stringify({...input,requestId:op.current.id})});op.current=undefined;setCursor(undefined);setPrior({key:"",items:[]});r.retry();return true;}catch{setFailed(true);return false;}finally{setPending(false);}};
 const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget),input={title:String(f.get("title")??""),body:String(f.get("body")??""),visibility:f.get("visibility")==="members"?"members":"public",category:"notice"};const ok=editing==="new"?await run("","POST",input):editing?await run(`/${editing.id}`,"PATCH",input):false;if(ok)setEditing(null);};
 const remove=async(item:Item)=>{if(window.confirm(t.confirmRemove)&&await run(`/${item.id}`,"DELETE",{}))setEditing(null);};
 const cur=editing&&editing!=="new"?editing:null;
 return <section id="notices" className={styles.section}>
  <div className={styles.head}><h2>{t.noticesTitle}</h2>{!editing&&<button type="button" className={`${styles.btn} ${styles.primary}`} onClick={()=>setEditing("new")}>{t.write}</button>}</div>
  {editing&&<form className={styles.form} onSubmit={submit} key={cur?.id??"new"}>
   <label className={styles.field}>{t.title}<input name="title" required maxLength={100} defaultValue={cur?.title??""}/></label>
   <label className={styles.field}>{t.body}<textarea name="body" required maxLength={20000} defaultValue={cur?.body??""}/></label>
   <label className={styles.field}>{t.visibility}<select name="visibility" defaultValue={cur?.visibility??"public"}><option value="public">{t.public}</option><option value="members">{t.members_only}</option></select></label>
   <div className={styles.row}><button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={pending}>{t.save}</button><button type="button" className={styles.btn} onClick={()=>setEditing(null)}>{t.cancel}</button></div>
  </form>}
  {failed&&<p role="alert" className={styles.error}>{t.error}</p>}
  {editing?null:r.error?<div className={styles.status}><p role="alert" className={styles.error}>{t.error}</p><button type="button" className={styles.btn} onClick={r.retry}>{t.retry}</button></div>:items.length===0&&!r.data?<FanSkeletonRows rows={3} variant="plain" ariaLabel={t.loading}/>:items.length===0?<p className={styles.status}>{t.empty}</p>:
   <ul className={styles.list}>{items.map(item=><li key={item.id} className={styles.item}><h3>{item.title}</h3><p>{item.body}</p><span className={styles.meta}>{new Date(item.createdAt).toLocaleDateString(locale)} · {item.visibility==="members"?t.members_only:t.public}</span>
    <div className={styles.row}><button type="button" className={styles.btn} onClick={()=>setEditing(item)}>{t.edit}</button><button type="button" className={styles.btn} disabled={pending} onClick={()=>void remove(item)}>{t.remove}</button></div></li>)}</ul>}
  {!editing&&items.length>0&&(r.data?.nextCursor||r.loading)&&<FanAction variant="neutral" disabled={pending||r.loading} onClick={()=>{if(!r.data?.nextCursor)return;setPrior({key:r.ownerKey,items});setCursor(r.data.nextCursor);}}>{more}</FanAction>}
 </section>;
}
