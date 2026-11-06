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
 return <ParticipationAdmin className={groupStyles.surface} locale={locale} title={locale==="ko"?"아티스트 계정 연결":"Artist account binding"} description="">{role=><Bindings locale={locale} role={role}/>}</ParticipationAdmin>;
}
function Bindings({locale,role}:{locale:"ko"|"en";role:string}) {
 const ko=locale==="ko",pages=useAdminPage("/api/groups?type=fan&limit=50",parsePages),[query,setQuery]=useState(""),[search,setSearch]=useState(""),[pageId,setPageId]=useState(""),[userId,setUserId]=useState(""),[confirmed,setConfirmed]=useState(false),[result,setResult]=useState<{nickname:string;page:string}>();
 const bindings=useGroupResource(pageId?`/api/groups/admin/pages/${pageId}/artists`:null,parseBindings);
 const users=useGroupResource(search?`/api/admin/fans?q=${encodeURIComponent(search)}&status=active&limit=50&lang=${locale}`:null,parseUsers),action=useParticipationAction();
 const found=users.data?.items.filter(item=>item.accountStatus==="active")??[],chosen=found.find(item=>item.fanId===userId)??(found.length===1?found[0]:undefined),locked=role==="viewer"||action.busy,name=(nickname:string|null)=>nickname??(ko?"이름 미등록":"Unnamed account");
 const check=()=>{const next=query.trim();if(next.length<2)return;setUserId("");setConfirmed(false);setResult(undefined);setSearch(next);};
 const grant=async()=>{if(!chosen||!pageId||!confirmed)return;const done=await action.run(`/api/groups/admin/pages/${pageId}/artists`,"POST",{appUserId:chosen.fanId,requestId:action.idempotencyKey({pageId,userId:chosen.fanId})},value=>z.object({updated:z.literal(true)}).parse(value));if(done){setResult({nickname:name(chosen.nickname),page:pages.state.data.find(item=>item.id===pageId)?.name??""});setConfirmed(false);bindings.retry();}};
 return <><form className={styles.form} onSubmit={event=>{event.preventDefault();void grant();}}>
  <label>{ko?"아티스트 이메일 또는 닉네임":"Artist email or nickname"}<input value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();check();}}} maxLength={100} autoComplete="off"/></label>
  <FanAction disabled={query.trim().length<2} leadingIcon={<Search aria-hidden size={16}/>} onClick={check}>{ko?"계정 확인":"Find account"}</FanAction>
  {users.loading&&<p role="status">{ko?"확인 중":"Checking"}</p>}{users.error&&<FanAction onClick={users.retry}>{ko?"다시 시도":"Try again"}</FanAction>}{users.data&&found.length===0&&<p role="status">{ko?"일치하는 계정이 없어요.":"No matching account."}</p>}
  {found.length>0&&<fieldset disabled={locked}><legend>{ko?"연결할 계정":"Account to bind"}</legend>{found.map(item=><label key={item.fanId}><input type="radio" name="artist" checked={chosen?.fanId===item.fanId} onChange={()=>{setUserId(item.fanId);setResult(undefined);}}/>{name(item.nickname)}{item.email?` · ${item.email}`:""}</label>)}</fieldset>}
  {chosen&&<fieldset disabled={locked}><label>{ko?"팬페이지":"Fan page"}<select required value={pageId} onChange={event=>{setPageId(event.target.value);setResult(undefined);}}><option value="">{ko?"선택":"Select"}</option>{pages.state.data.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><input type="checkbox" required checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{ko?"아티스트 본인 계정임을 확인했습니다.":"I verified that this account belongs to the artist."}</label><FanAction type="submit" variant="primary" disabled={!pageId||!confirmed} leadingIcon={<BadgeCheck aria-hidden size={16}/>}>{ko?"아티스트로 연결":"Bind as artist"}</FanAction></fieldset>}
  {result&&<p role="status">{ko?`연결했어요: ${result.nickname} → ${result.page}`:`Bound: ${result.nickname} → ${result.page}`}</p>}
 </form>
 {pageId&&bindings.data&&<section><h2>{ko?"연결된 아티스트":"Bound artists"}</h2>{bindings.data.items.length?<ul className={styles.list}>{bindings.data.items.map(item=><li className={styles.row} key={item.appUserId}><strong>{name(item.nickname)}</strong><FanAction disabled={locked} onClick={async()=>{const done=await action.run(`/api/groups/admin/pages/${pageId}/artists`,"DELETE",{appUserId:item.appUserId,requestId:action.idempotencyKey({pageId,remove:item.appUserId})},value=>z.object({updated:z.literal(true)}).parse(value));if(done){setResult(undefined);bindings.retry();}}}>{ko?"아티스트 연결 해제":"Remove artist binding"}</FanAction></li>)}</ul>:<p>{ko?"아직 없어요.":"None yet."}</p>}</section>}{bindings.error&&<FanAction onClick={bindings.retry}>{ko?"연결 목록 다시 불러오기":"Retry bindings"}</FanAction>}
 <AdminListState locale={locale} resource={pages}/><ActionFeedback locale={locale} error={action.error}/></>;
}
