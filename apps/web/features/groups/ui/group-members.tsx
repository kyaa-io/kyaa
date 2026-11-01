"use client";
import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronRight,Search,Trophy,UserRound,UserRoundCheck,UsersRound } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { groupPeopleSchema,type GroupPeopleMode } from "@/server/group-members/domain";
import { useGroupResource } from "./use-group-resource";
import { groupMembersCopy } from "./group-members-copy";
import common from "./groups.module.css";
import styles from "./group-members.module.css";
const parse=(value:unknown)=>groupPeopleSchema.parse(value);
export function GroupMembers({pageId,locale,member}:{pageId:string;locale:AppLocale;member:boolean}){
 const t=groupMembersCopy(locale),[mode,setMode]=useState<GroupPeopleMode>("members"),[draft,setDraft]=useState(""),[search,setSearch]=useState(""),[cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<ReturnType<typeof parse>["items"]>([]);
 const query=new URLSearchParams({mode,search,locale,limit:"30"});if(cursor)query.set("cursor",cursor);
 const resource=useGroupResource(member?`/api/groups/${pageId}/people?${query}`:null,parse),rows=[...previous,...(resource.data?.items??[])];
 const tabs=[{key:"members",icon:UsersRound},{key:"friends",icon:UserRoundCheck},{key:"ranking",icon:Trophy}] as const;
 const reset=()=>{setPrevious([]);setCursor(undefined);};
 return <section className={styles.section} aria-labelledby="group-people-title"><h2 id="group-people-title"><UsersRound aria-hidden="true"/>{t.title}</h2>
  <nav className={styles.switch} aria-label={t.title}>{tabs.map(({key,icon:Icon})=><button key={key} type="button" className={common.chip} aria-pressed={mode===key} onClick={()=>{setMode(key);reset();}}><Icon size={20} aria-hidden="true"/>{t[key]}</button>)}</nav>
  {!member?<div className={styles.state}><UsersRound size={32} aria-hidden="true"/><p>{t.join}</p>{!resource.authenticated&&<FanAction href={`/login?returnTo=${encodeURIComponent(`/pages/groups/${pageId}?tab=members&locale=${locale}`)}`}>{t.login}</FanAction>}</div>:<>
   <form className={styles.search} onSubmit={event=>{event.preventDefault();setSearch(draft.trim());reset();}}><label className={styles.searchField}><Search size={20} aria-hidden="true"/><input className={common.input} type="search" value={draft} onChange={event=>setDraft(event.target.value)} maxLength={100} placeholder={t.search} aria-label={t.search}/></label><FanAction type="submit">{t.find}</FanAction></form>
   {mode==="ranking"&&resource.data?.ranking?.available&&<p className={common.meta}>{t.rankingScope}</p>}
   {resource.error?<div className={styles.state} role="alert"><UsersRound size={32} aria-hidden="true"/><p>{t.error}</p><FanAction onClick={resource.retry}>{t.retry}</FanAction></div>:resource.loading?<div className={styles.state} role="status"><UsersRound size={32} aria-hidden="true"/><p>{t.loading}</p></div>:rows.length?<ul className={styles.list}>{rows.map(row=><li key={row.profileId}><Link className={styles.person} href={`/my/friends?locale=${locale}&profileId=${row.profileId}` as Route}>
    {row.rank!==null&&<span className={styles.rank} aria-label={`${t.ranking} ${row.rank}`}>{row.rank<=3&&<Trophy size={16} aria-hidden="true"/>}{row.rank}</span>}
    {row.avatarUrl?<img src={row.avatarUrl} alt="" width={44} height={44} className={styles.avatar}/>:<span className={styles.avatar}><UserRound size={24} aria-hidden="true"/></span>}
    <span className={styles.identity}><strong>{row.nickname}</strong><span className={common.meta}>{row.points!==null?`${t.points} ${row.points.toLocaleString(locale)}`:t[row.role]}</span></span><span className={styles.profile}>{t.profile}<ChevronRight size={18} aria-hidden="true"/></span>
   </Link></li>)}</ul>:<div className={styles.state}>{mode==="ranking"?<Trophy size={32} aria-hidden="true"/>:<UsersRound size={32} aria-hidden="true"/>}<p>{mode==="ranking"&&resource.data?.ranking&&!resource.data.ranking.available?t[resource.data.ranking.reason==="creator_required"?"creatorRequired":"threshold"]:mode==="friends"&&!search?t.noFriends:t.empty}</p></div>}
   {resource.data?.nextCursor&&<FanAction className={common.more} disabled={resource.loading} onClick={()=>{setPrevious(rows);setCursor(resource.data!.nextCursor!);}}>{t.more}</FanAction>}
  </>}
 </section>;
}
