"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight,ChartNoAxesColumn,ChevronRight,Search,Trophy,UserRound,UserRoundCheck,UsersRound } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction, fanActionClassName } from "@/components/fan-ui/fan-action";
import { MemberDmEntry } from "@/features/group-social/member-dm-entry";
import { groupPeopleSchema,type GroupPeopleMode } from "@/server/group-members/domain";
import { useGroupResource } from "./use-group-resource";
import { groupMembersCopy } from "./group-members-copy";
import common from "./groups.module.css";
import styles from "./group-members.module.css";
const parse=(value:unknown)=>groupPeopleSchema.parse(value);
export type GroupMembersPresentation={overview?:ReactNode;creatorName:string;subtitles:Record<string,string>;selectedProfileId?:string};
export function GroupMembers({pageId,locale,member,presentation}:{pageId:string;locale:AppLocale;member:boolean;presentation?:GroupMembersPresentation}){
 const [rankingFilter,setRankingFilter]=useState("전체");
 const t=groupMembersCopy(locale),[mode,setMode]=useState<GroupPeopleMode>("members"),[draft,setDraft]=useState(""),[search,setSearch]=useState(""),[cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<ReturnType<typeof parse>["items"]>([]);
 const query=new URLSearchParams({mode,search,locale,limit:"30"});if(cursor)query.set("cursor",cursor);
 const resource=useGroupResource(member?`/api/groups/${pageId}/people?${query}`:null,parse),rows=[...previous,...(resource.data?.items??[])];
 const tabs=[{key:"members",icon:UsersRound},{key:"friends",icon:UserRoundCheck},{key:"ranking",icon:Trophy}] as const;
 const reset=()=>{setPrevious([]);setCursor(undefined);};
 return <section className={`${styles.section} ${presentation?styles.source:""}`} data-member-mode={mode} aria-labelledby="group-people-title"><div className={styles.summary}><h2 id="group-people-title">{(!presentation||mode==="ranking")&&(mode==="ranking"?<Trophy aria-hidden="true"/>:<UsersRound aria-hidden="true"/>)}{t.title}</h2>{presentation&&mode!=="ranking"&&<div className={styles.overview}>{presentation.overview}</div>}
  </div><nav className={styles.switch} aria-label={t.title}>{tabs.map(({key,icon:Icon})=><button key={key} type="button" className={common.chip} aria-pressed={mode===key} onClick={()=>{setMode(key);reset();}}>{!presentation&&<Icon size={20} aria-hidden="true"/>}{presentation&&locale==="ko"&&key==="ranking"?"팬랭킹":t[key]}{presentation&&<Icon size={18} aria-hidden="true"/>}</button>)}</nav><div className={styles.body}>
  {!member?<div className={styles.state}><UsersRound size={32} aria-hidden="true"/><p>{t.join}</p>{!resource.authenticated&&<FanAction href={`/login?returnTo=${encodeURIComponent(`/pages/groups/${pageId}?tab=members&locale=${locale}`)}`}>{t.login}</FanAction>}</div>:<>
   {presentation&&mode==="members"&&<FanAction className={styles.incomingRequests} href={`/my/friends?locale=${locale}&filter=incoming`}>{t.incomingRequests}</FanAction>}
   {presentation&&mode!=="members"&&<h3 className={styles.modeTitle}>{mode==="ranking"?`${presentation.creatorName} ${locale==="ko"?"팬랭킹":t.ranking}`:mode==="friends"?t.friendsHere:t.members}</h3>}
   {presentation&&mode==="ranking"?<><p className={styles.scope}>{t.topScope}</p><nav className={styles.filters} aria-label={t.category}>{["전체","지식","LIVE","미션","팬인증"].map(label=><button key={label} aria-pressed={rankingFilter===label} onClick={()=>setRankingFilter(label)}>{label}</button>)}</nav></>:<form className={styles.search} onSubmit={event=>{event.preventDefault();setSearch(draft.trim());reset();}}><label className={styles.searchField}>{!presentation&&<Search size={20} aria-hidden="true"/>}<input className={common.input} type="search" value={draft} onChange={event=>setDraft(event.target.value)} maxLength={100} placeholder={t.search} aria-label={t.search}/></label><FanAction type="submit">{t.find}</FanAction></form>}
   {!presentation&&mode==="ranking"&&resource.data?.ranking?.available&&<p className={common.meta}>{t.rankingScope}</p>}
   {resource.error?<div className={styles.state} role="alert"><UsersRound size={32} aria-hidden="true"/><p>{t.error}</p><FanAction onClick={resource.retry}>{t.retry}</FanAction></div>:resource.loading?<div className={styles.state} role="status"><UsersRound size={32} aria-hidden="true"/><p>{t.loading}</p></div>:rows.length?<>{presentation&&mode==="ranking"&&<div className={styles.rankColumns} aria-hidden="true"><span>{t.rankColumn}</span><span>{t.members}</span><span>{t.scoreColumn}</span></div>}<ul className={`${styles.list} ${presentation&&mode==="ranking"?styles.rankingList:""}`}>{rows.map(row=><li key={row.profileId} data-selected={presentation?.selectedProfileId===row.profileId||undefined}><Link className={styles.person} href={`/my/friends?locale=${locale}&profileId=${row.profileId}` as Route}>
    {row.rank!==null&&<span className={styles.rank} aria-label={`${t.ranking} ${row.rank}`}>{!presentation&&row.rank<=3&&<Trophy size={16} aria-hidden="true"/>}{row.rank}</span>}
    {row.avatarUrl?<img src={row.avatarUrl} alt="" width={44} height={44} className={styles.avatar}/>:<span className={styles.avatar}><UserRound size={24} aria-hidden="true"/></span>}
    <span className={styles.identity}><strong>{row.nickname}</strong><span className={common.meta}>{presentation?(presentation.subtitles[row.nickname]??t[row.role]):row.points!==null?`${t.points} ${row.points.toLocaleString(locale)}`:t[row.role]}</span></span>{presentation&&mode==="ranking"?<strong className={styles.score}>{row.points?.toLocaleString(locale)}{locale==="ko"?" 점":""}</strong>:<span className={fanActionClassName('neutral',{className:styles.profile})}><span className={styles.profileLabel}>{t.profile}</span>{presentation&&locale==="ko"&&<span className={styles.profileCompact}>프로필</span>}<ChevronRight size={18} aria-hidden="true"/></span>}
   </Link><MemberDmEntry profileId={row.profileId} nickname={row.nickname} locale={locale}/></li>)}</ul></>:<div className={styles.state}>{mode==="ranking"?<Trophy size={32} aria-hidden="true"/>:<UsersRound size={32} aria-hidden="true"/>}<p>{mode==="ranking"&&resource.data?.ranking&&!resource.data.ranking.available?t[resource.data.ranking.reason==="creator_required"?"creatorRequired":"threshold"]:mode==="friends"&&!search?t.noFriends:t.empty}</p></div>}
   {presentation&&mode==="ranking"&&<div className={styles.rankSummary}><Link className={styles.myRank} href={`/my?locale=${locale}` as Route}><ChartNoAxesColumn size={24} aria-hidden="true"/><span><strong>{t.myRank}</strong><small>{t.myRankHelp}</small></span><ChevronRight size={20} aria-hidden="true"/></Link><small>{t.rankHelp}</small><FanAction variant="text" trailingIcon={<ArrowRight size={18}/>} onClick={()=>{if(resource.data?.nextCursor){setPrevious(rows);setCursor(resource.data.nextCursor);}}}>{t.topAll}</FanAction></div>}
   {presentation&&mode==="friends"&&<FanAction href={`/my/friends?locale=${locale}`} trailingIcon={<ArrowRight size={18}/>}>{t.manageFriends}</FanAction>}
   {resource.data?.nextCursor&&(!presentation||mode!=="ranking")&&<FanAction className={common.more} variant={presentation?"text":"neutral"} trailingIcon={presentation?<ArrowRight size={18}/>:undefined} disabled={resource.loading} onClick={()=>{setPrevious(rows);setCursor(resource.data!.nextCursor!);}}>{presentation?t.memberMore:t.more}</FanAction>}
  </>}</div>
 </section>;
}
