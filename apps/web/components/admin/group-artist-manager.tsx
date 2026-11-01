"use client";
import groupStyles from "./group-admin.module.css";
import { useState } from "react";
import { z } from "zod";
import { BadgeCheck, Search } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useGroupResource } from "@/features/groups/ui/use-group-resource";
import { useParticipationAction, ActionFeedback } from "@/features/schedules/ui/participation-ui";
import { ParticipationAdmin, useAdminPage, AdminListState, styles } from "./participation-controls";
const parsePages = (value: unknown) => z.object({items:z.array(z.object({id:z.uuid(),name:z.string()})),nextCursor:z.string().nullable()}).parse(value);
const parseBindings = (value: unknown) => z.object({items:z.array(z.object({appUserId:z.uuid(),nickname:z.string().nullable(),avatarUrl:z.string().nullable(),verifiedBy:z.uuid()}))}).parse(value);
const parseUsers = (value: unknown) => z.object({items:z.array(z.object({fanId:z.uuid(),nickname:z.string().nullable(),email:z.string().nullable().optional(),accountStatus:z.enum(["active","disabled"])}))}).parse(value);
export function GroupArtistManager({locale}:{locale:"ko"|"en"}) {
 return <ParticipationAdmin className={groupStyles.surface} locale={locale} title={locale==="ko"?"아티스트 계정 연결":"Artist account binding"} description={locale==="ko"?"본인 확인을 마친 아티스트 계정을 팬페이지에 연결합니다.":"Bind an identity-verified artist account to a fan page."}>{role=><Bindings locale={locale} role={role}/>}</ParticipationAdmin>;
}
function Bindings({locale,role}:{locale:"ko"|"en";role:string}) {
 const ko=locale==="ko",pages=useAdminPage("/api/groups?type=fan&limit=50",parsePages),[query,setQuery]=useState(""),[search,setSearch]=useState(""),[pageId,setPageId]=useState(""),[userId,setUserId]=useState("");
 const bindings=useGroupResource(pageId?`/api/groups/admin/pages/${pageId}/artists`:null,parseBindings);
 const users=useGroupResource(search?`/api/admin/fans?q=${encodeURIComponent(search)}&status=active&limit=50&lang=${locale}`:null,parseUsers),action=useParticipationAction();
 return <><form className={styles.form} onSubmit={event=>{event.preventDefault();setUserId("");setSearch(query.trim());}}><label>{ko?"닉네임 또는 정확한 이메일":"Nickname or exact email"}<input value={query} onChange={event=>setQuery(event.target.value)} required maxLength={200}/></label><FanAction type="submit"><Search aria-hidden size={16}/>{ko?"회원 검색":"Search members"}</FanAction></form>
 <form className={styles.form} onSubmit={async event=>{event.preventDefault();const result=await action.run(`/api/groups/admin/pages/${pageId}/artists`,"POST",{appUserId:userId,requestId:action.idempotencyKey({pageId,userId})},value=>z.object({updated:z.literal(true)}).parse(value));if(result){setUserId("");bindings.retry();}}}><fieldset disabled={role==="viewer"||action.busy}><label>{ko?"팬페이지":"Fan page"}<select required value={pageId} onChange={event=>setPageId(event.target.value)}><option value="">{ko?"선택":"Select"}</option>{pages.state.data.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{ko?"확인한 아티스트 계정":"Verified artist account"}<select required value={userId} onChange={event=>setUserId(event.target.value)}><option value="">{ko?"검색 결과에서 선택":"Select a search result"}</option>{users.data?.items.filter(item=>item.accountStatus==="active").map(item=><option key={item.fanId} value={item.fanId}>{item.nickname??"—"}{item.email?` · ${item.email}`:""}</option>)}</select></label><label><input type="checkbox" required/>{ko?"아티스트 본인 계정임을 확인했습니다.":"I verified that this account belongs to the artist."}</label><FanAction type="submit" disabled={!pageId||!userId}><BadgeCheck aria-hidden size={16}/>{ko?"계정 연결":"Bind account"}</FanAction></fieldset></form>
 {bindings.data?.items.length ? <ul className={styles.list}>{bindings.data.items.map(item=><li className={styles.row} key={item.appUserId}><strong>{item.nickname??(ko?"이름 미등록":"Unnamed account")}</strong><FanAction disabled={role==="viewer"||action.busy} onClick={async()=>{const result=await action.run(`/api/groups/admin/pages/${pageId}/artists`,"DELETE",{appUserId:item.appUserId,requestId:action.idempotencyKey({pageId,remove:item.appUserId})},value=>z.object({updated:z.literal(true)}).parse(value));if(result)bindings.retry();}}>{ko?"아티스트 연결 해제":"Remove artist binding"}</FanAction></li>)}</ul>:null}{bindings.error&&<FanAction onClick={bindings.retry}>{ko?"연결 목록 다시 불러오기":"Retry bindings"}</FanAction>}
 {users.loading&&<p role="status">{ko?"검색 중":"Searching"}</p>}{users.error&&<FanAction onClick={users.retry}>{ko?"다시 시도":"Try again"}</FanAction>}{users.data?.items.length===0&&<p role="status">{ko?"검색 결과가 없습니다.":"No matches."}</p>}<AdminListState locale={locale} resource={pages}/><ActionFeedback locale={locale} error={action.error}/></>;
}
