"use client";
import { useState, type ReactNode } from "react";
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
export type GroupMembersPresentation={overview:ReactNode;creatorName:string;subtitles:Record<string,string>};
export function GroupMembers({pageId,locale,member,presentation}:{pageId:string;locale:AppLocale;member:boolean;presentation?:GroupMembersPresentation}){
 const [rankingFilter,setRankingFilter]=useState("전체");
 const t=groupMembersCopy(locale),[mode,setMode]=useState<GroupPeopleMode>("members"),[draft,setDraft]=useState(""),[search,setSearch]=useState(""),[cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<ReturnType<typeof parse>["items"]>([]);
 const query=new URLSearchParams({mode,search,locale,limit:"30"});if(cursor)query.set("cursor",cursor);
 const resource=useGroupResource(member?`/api/groups/${pageId}/people?${query}`:null,parse),rows=[...previous,...(resource.data?.items??[])];
 const tabs=[{key:"members",icon:UsersRound},{key:"friends",icon:UserRoundCheck},{key:"ranking",icon:Trophy}] as const;
 const reset=()=>{setPrevious([]);setCursor(undefined);};
 return <section className={`${styles.section} ${presentation?styles.source:""}`} aria-labelledby="group-people-title"><div className={styles.summary}><h2 id="group-people-title">{!presentation&&<UsersRound aria-hidden="true"/>}{t.title}</h2>{presentation&&<div className={styles.overview}>{mode!=="ranking"&&presentation.overview}</div>}
  <nav className={styles.switch} aria-label={t.title}>{tabs.map(({key,icon:Icon})=><button key={key} type="button" className={common.chip} aria-pressed={mode===key} onClick={()=>{setMode(key);reset();}}>{!presentation&&<Icon size={20} aria-hidden="true"/>}{presentation&&locale==="ko"&&key==="ranking"?"팬랭킹":t[key]}</button>)}</nav></div><div className={styles.body}>
  {!member?<div className={styles.state}><UsersRound size={32} aria-hidden="true"/><p>{t.join}</p>{!resource.authenticated&&<FanAction href={`/login?returnTo=${encodeURIComponent(`/pages/groups/${pageId}?tab=members&locale=${locale}`)}`}>{t.login}</FanAction>}</div>:<>
   {presentation&&<h3 className={styles.modeTitle}>{mode==="ranking"?`${presentation.creatorName} 팬랭킹`:mode==="friends"?"이 페이지의 친구":t.members}</h3>}
   {presentation&&mode==="ranking"?<><p className={styles.scope}>팬점수 기준 · 상위 100명</p><nav className={styles.filters} aria-label="팬점수 분류">{["전체","지식","LIVE","미션","팬인증"].map(label=><button key={label} aria-pressed={rankingFilter===label} onClick={()=>setRankingFilter(label)}>{label}</button>)}</nav></>:<form className={styles.search} onSubmit={event=>{event.preventDefault();setSearch(draft.trim());reset();}}><label className={styles.searchField}><Search size={20} aria-hidden="true"/><input className={common.input} type="search" value={draft} onChange={event=>setDraft(event.target.value)} maxLength={100} placeholder={t.search} aria-label={t.search}/></label><FanAction type="submit">{t.find}</FanAction></form>}
   {!presentation&&mode==="ranking"&&resource.data?.ranking?.available&&<p className={common.meta}>{t.rankingScope}</p>}
   {resource.error?<div className={styles.state} role="alert"><UsersRound size={32} aria-hidden="true"/><p>{t.error}</p><FanAction onClick={resource.retry}>{t.retry}</FanAction></div>:resource.loading?<div className={styles.state} role="status"><UsersRound size={32} aria-hidden="true"/><p>{t.loading}</p></div>:rows.length?<ul className={`${styles.list} ${presentation&&mode==="ranking"?styles.rankingList:""}`}>{rows.map(row=><li key={row.profileId}><Link className={styles.person} href={`/my/friends?locale=${locale}&profileId=${row.profileId}` as Route}>
    {row.rank!==null&&<span className={styles.rank} aria-label={`${t.ranking} ${row.rank}`}>{!presentation&&row.rank<=3&&<Trophy size={16} aria-hidden="true"/>}{row.rank}</span>}
    {row.avatarUrl?<img src={row.avatarUrl} alt="" width={44} height={44} className={styles.avatar}/>:<span className={styles.avatar}><UserRound size={24} aria-hidden="true"/></span>}
    <span className={styles.identity}><strong>{row.nickname}</strong><span className={common.meta}>{presentation?(mode==="ranking"?"Gold":presentation.subtitles[row.nickname]??t[row.role]):row.points!==null?`${t.points} ${row.points.toLocaleString(locale)}`:t[row.role]}</span></span>{presentation&&mode==="ranking"?<strong className={styles.score}>{row.points?.toLocaleString(locale)} 점</strong>:<span className={styles.profile}>{t.profile}{!presentation&&<ChevronRight size={18} aria-hidden="true"/>}</span>}
   </Link></li>)}</ul>:<div className={styles.state}>{mode==="ranking"?<Trophy size={32} aria-hidden="true"/>:<UsersRound size={32} aria-hidden="true"/>}<p>{!presentation&&mode==="ranking"&&resource.data?.ranking&&!resource.data.ranking.available?t[resource.data.ranking.reason==="creator_required"?"creatorRequired":"threshold"]:mode==="friends"&&!search?t.noFriends:t.empty}</p></div>}
   {presentation&&mode==="ranking"&&<div className={styles.rankSummary}><strong>내 순위 보기</strong><p>내 팬점수와 순위를 확인해요</p><small>팬 100명부터 공개 · 포인트 잔액과 팬점수는 달라요.</small><FanAction onClick={()=>{if(resource.data?.nextCursor){setPrevious(rows);setCursor(resource.data.nextCursor);}}}>상위 100명 전체 보기</FanAction></div>}
   {presentation&&mode==="friends"&&<FanAction href={`/my/friends?locale=${locale}`}>MY에서 친구 관리</FanAction>}
   {resource.data?.nextCursor&&(!presentation||mode!=="ranking")&&<FanAction className={common.more} disabled={resource.loading} onClick={()=>{setPrevious(rows);setCursor(resource.data!.nextCursor!);}}>{presentation?"회원 더 보기":t.more}</FanAction>}
  </>}</div>
 </section>;
}
