"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { UsersRound, MessageCircle, Shield } from "lucide-react";
import { FanAppFrame } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { GroupRequestError,useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { groupsCopy } from "@/features/groups/ui/copy";
import { waveFriendsCopy } from "@/i18n/catalogs/features__fanpage__wave-friends";
import type { AppLocale } from "@/i18n/locales";
import { PublicFavorites } from "./public-favorites";
import { socialPrivacyCopy } from "./privacy-copy";
import { socialCopy,incomingMessageRequest } from "./copy";
import styles from "./social.module.css";
const friend=z.object({id:z.uuid(),profileId:z.uuid(),nickname:z.string(),avatarUrl:z.string().nullable(),status:z.enum(['friends','incoming','outgoing'])});
const friends=z.object({friendships:z.array(friend)});
const conversation=z.object({id:z.uuid(),profileId:z.uuid(),nickname:z.string(),avatarUrl:z.string().nullable(),status:z.string(),canSend:z.boolean(),latestMessage:z.string().nullable()});
const conversations=z.object({conversations:z.array(conversation)});
const profile=z.object({profile:z.object({id:z.uuid(),nickname:z.string(),avatarUrl:z.string().nullable()}),relationship:z.object({friendshipId:z.uuid().nullable(),status:z.string()}),dm:z.object({conversationId:z.uuid().nullable(),status:z.string(),canSend:z.boolean()}),capabilities:z.object({canRequestFriend:z.boolean(),canRequestDm:z.boolean(),canBlock:z.boolean()})});
const blocks=z.object({profiles:z.array(z.object({profileId:z.uuid(),nickname:z.string(),avatarUrl:z.string().nullable(),blockedAt:z.string()}))});
const parseBlocks=(v:unknown)=>blocks.parse(v);
const settings=z.object({profileVisible:z.boolean(),favoriteSlugs:z.array(z.string()),dmPolicy:z.enum(['friends','requests','none'])});
const message=z.object({id:z.uuid(),senderProfileId:z.uuid(),text:z.string(),createdAt:z.string(),isMine:z.boolean()});
const messages=z.object({messages:z.array(message)});
const parseFriends=(v:unknown)=>friends.parse(v),parseConversations=(v:unknown)=>conversations.parse(v),parseProfile=(v:unknown)=>profile.parse(v),parseSettings=(v:unknown)=>settings.parse(v);
function Avatar({url}:{url:string|null}) { return url?<img src={url} alt="" width={44} height={44} className={styles.avatar}/>:<UsersRound size={24} aria-hidden/>; }
export function GroupSocialScreen(props:{locale:AppLocale;profileId?:string;conversationId?:string}) {
 const auth=useGroupRequest();return <GroupSocialContent key={auth.ownerKey} {...props}/>;
}
function GroupSocialContent({locale,profileId:initialProfile,conversationId:initialConversation}:{locale:AppLocale;profileId?:string;conversationId?:string}) {
 const t=waveFriendsCopy(locale),s=socialCopy(locale),p=socialPrivacyCopy(locale),g=groupsCopy(locale),auth=useGroupRequest();
 const base='/api/me/social'; const apiLocale=locale==='ko'?'ko':'en';
 const people=useGroupResource(auth.authenticated?`${base}/friends?locale=${apiLocale}`:null,parseFriends);
 const chats=useGroupResource(auth.authenticated?`${base}/conversations`:null,parseConversations);
 const blockList=useGroupResource(auth.authenticated?`${base}/blocks`:null,parseBlocks);
 const [justBlocked,setJustBlocked]=useState<string[]>([]);
 const privacy=useGroupResource(auth.authenticated?`${base}/settings`:null,parseSettings);
 const [selection,setSelection]=useState({owner:auth.ownerKey,profileId:initialProfile,conversationId:initialConversation});
 const selected=selection.owner===auth.ownerKey?selection:{profileId:undefined,conversationId:undefined};
 const person=useGroupResource(auth.authenticated&&selected.profileId?`${base}/profiles/${selected.profileId}?locale=${apiLocale}`:null,parseProfile);
 const [pending,setPending]=useState(false),[failed,setFailed]=useState(false),[firstMessage,setFirstMessage]=useState('');
 const attempt=useRef<{signature:string;id:string}|null>(null);
 async function change(url:string,input:Record<string,unknown>,method='POST') {
  if(pending)return;setPending(true);setFailed(false);
  const signature=JSON.stringify({url,input,method});if(attempt.current?.signature!==signature)attempt.current={signature,id:crypto.randomUUID()};
  try {const result=await auth.request(url,{method,body:JSON.stringify({...input,...(method==='PATCH'&&url.endsWith('/settings')?{}:{requestId:attempt.current.id})})});attempt.current=null;if(url.endsWith('/blocks')&&method==='POST')setJustBlocked(ids=>[...ids,String(input.profileId)]);blockList.retry();people.retry();chats.retry();person.retry();privacy.retry();return result;}
  catch {setFailed(true);throw new Error('request failed');}finally{setPending(false);}
 }
 function act(url:string,input:Record<string,unknown>,method='POST') {void change(url,input,method).catch(()=>{});}
 function selectProfile(id:string){setSelection({owner:auth.ownerKey,profileId:id,conversationId:undefined});setFirstMessage('');}
 const currentChat=chats.data?.conversations.find(c=>c.id===selected.conversationId);
 async function requestConversation(event:FormEvent) {event.preventDefault();if(!person.data||!firstMessage.trim())return;try{const result=z.object({id:z.uuid()}).parse(await change(`${base}/conversations`,{profileId:person.data.profile.id,text:firstMessage}));setSelection({owner:auth.ownerKey,profileId:undefined,conversationId:result.id});setFirstMessage('');}catch{}}
 return <FanAppFrame locale={locale} currentPath="/my/friends" mainId="group-social-main" groupsEnabled><main id="group-social-main" className={styles.page}>
 <h1><UsersRound aria-hidden size={28}/>{s.title}</h1>
 {!auth.ready?<p role="status">{t.loading}</p>:!auth.authenticated?<FanAction href={`/login?returnTo=${encodeURIComponent(`/my/friends?locale=${locale}`)}`}>{g.login}</FanAction>:<>
 {failed&&<p role="alert" className={styles.error}>{t.error}</p>}
 <div className={styles.layout}>
 <section aria-label={t.title} className={styles.people}>
 {people.loading?<p role="status">{t.loading}</p>:people.error?<FanAction onClick={people.retry}>{t.retry}</FanAction>:people.data?.friendships.length===0?<p>{s.empty}</p>:people.data?.friendships.map(f=><article className={styles.row} key={f.id}>
 <button className={styles.person} onClick={()=>selectProfile(f.profileId)}><Avatar url={f.avatarUrl}/><span><strong>{f.nickname}</strong>{f.status!=='friends'&&<small>{f.status==='incoming'?t.incoming:t.outgoing}</small>}</span></button>
 <div className={styles.actions}>{f.status==='incoming'?<><FanAction disabled={pending} onClick={()=>act(`${base}/friends/${f.id}`,{action:'accept'},'PATCH')}>{t.accept}</FanAction><FanAction disabled={pending} onClick={()=>act(`${base}/friends/${f.id}`,{action:'reject'},'PATCH')}>{t.reject}</FanAction></>:f.status==='outgoing'?<FanAction disabled={pending} onClick={()=>act(`${base}/friends/${f.id}`,{action:'cancel'},'PATCH')}>{t.cancel}</FanAction>:<FanAction onClick={()=>selectProfile(f.profileId)}>{t.dm}</FanAction>}</div></article>)}
 <h2><MessageCircle aria-hidden size={22}/>{t.dm}</h2>
 {chats.loading?<p role="status">{t.loading}</p>:chats.error?<FanAction onClick={chats.retry}>{t.retry}</FanAction>:chats.data?.conversations.map(c=><button key={c.id} className={styles.row} aria-pressed={selected.conversationId===c.id} onClick={()=>setSelection({owner:auth.ownerKey,profileId:undefined,conversationId:c.id})}><Avatar url={c.avatarUrl}/><span><strong>{c.nickname}</strong><small>{c.status==='incoming_request'?incomingMessageRequest[locale]:c.status==='outgoing_request'?t.pending:c.latestMessage??t.noMessages}</small></span></button>)}
 </section>
 <section className={styles.detail} aria-live="polite">
 {selected.profileId?(justBlocked.includes(selected.profileId)||blockList.data?.profiles.some(item=>item.profileId===selected.profileId)?<div className={styles.placeholder}><Shield aria-hidden='true' size={36}/><h2>{p.blocked}</h2><p>{s.cannotSend}</p></div>:person.loading?<p role="status">{t.loading}</p>:person.error?<FanAction onClick={person.retry}>{t.retry}</FanAction>:person.data&&<>
 <div className={styles.profile}><Avatar url={person.data.profile.avatarUrl}/><h2>{person.data.profile.nickname}</h2></div>
 <div className={styles.actions}>{person.data.capabilities.canRequestFriend&&<FanAction disabled={pending} variant="primary" onClick={()=>act(`${base}/friends`,{profileId:person.data!.profile.id})}>{t.requestFriend}</FanAction>}
 {person.data.relationship.status==='friends'&&<FanAction disabled={pending} onClick={()=>act(`${base}/friends/${person.data!.relationship.friendshipId}`,{action:'unfriend'},'PATCH')}>{s.unfriend}</FanAction>}
 {person.data.capabilities.canBlock&&<FanAction disabled={pending} onClick={()=>act(`${base}/blocks`,{profileId:person.data!.profile.id})}>{s.block}</FanAction>}
 {person.data.dm.conversationId&&<FanAction onClick={()=>setSelection({owner:auth.ownerKey,profileId:undefined,conversationId:person.data!.dm.conversationId!})}>{t.dm}</FanAction>}</div>
 {!person.data.dm.conversationId&&person.data.capabilities.canRequestDm&&<form onSubmit={requestConversation} className={styles.compose}><label>{t.messageLabel}<textarea maxLength={1000} required value={firstMessage} onChange={e=>setFirstMessage(e.target.value)} disabled={pending}/></label><FanAction type="submit" disabled={pending||!firstMessage.trim()} variant="primary">{s.messageRequest}</FanAction></form>}
 </>):selected.conversationId?<Conversation key={`${auth.ownerKey}:${selected.conversationId}`} locale={locale} id={selected.conversationId} conversation={currentChat} onResolve={(action)=>act(`${base}/conversations/${selected.conversationId}`,{action},'PATCH')} pending={pending}/>:<div className={styles.placeholder}><MessageCircle aria-hidden size={36}/><p>{t.dm}</p></div>}
 </section></div>
 {privacy.data&&<section className={styles.settings}><h2><Shield size={22} aria-hidden/>{s.profile}</h2><label><input type="checkbox" checked={privacy.data.profileVisible} disabled={pending} onChange={e=>act(`${base}/settings`,{...privacy.data!,profileVisible:e.target.checked},'PATCH')}/>{s.publicProfile}</label><select aria-label={s.messageRequest} value={privacy.data.dmPolicy} disabled={pending} onChange={e=>act(`${base}/settings`,{...privacy.data!,dmPolicy:e.target.value},'PATCH')}><option value="friends">{s.friends}</option><option value="requests">{s.requests}</option><option value="none">{s.none}</option></select><PublicFavorites locale={locale} selected={privacy.data.favoriteSlugs} disabled={pending} onChange={favoriteSlugs=>act(`${base}/settings`,{...privacy.data!,favoriteSlugs},'PATCH')}/></section>}
 </>}
 </main></FanAppFrame>;
}
function Conversation({locale,id,conversation:chat,onResolve,pending}:{locale:AppLocale;id:string;conversation?:z.infer<typeof conversation>;onResolve:(a:'accept'|'reject'|'cancel')=>void;pending:boolean}) {
 const {request:apiRequest}=useGroupRequest(),t=waveFriendsCopy(locale),s=socialCopy(locale);
 const [rows,setRows]=useState<z.infer<typeof message>[]>([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[body,setBody]=useState(''),[sending,setSending]=useState(false),[revoked,setRevoked]=useState(false);
 const last=useRef<z.infer<typeof message>|null>(null),request=useRef<{body:string;id:string}|null>(null),active=useRef(false);
 useEffect(()=>{
  const controller=new AbortController();let denied=false;
  async function read(){if(denied||document.hidden||active.current)return;active.current=true;try{const cursor=last.current?btoa(JSON.stringify({at:last.current.createdAt,id:last.current.id})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''):null;const data=messages.parse(await apiRequest(`/api/me/social/conversations/${id}/messages?limit=100${cursor?`&cursor=${cursor}`:''}`,{signal:controller.signal}));if(controller.signal.aborted)return;setRows(old=>{const map=new Map(old.map(m=>[m.id,m]));for(const row of data.messages)map.set(row.id,row);return [...map.values()];});if(data.messages.length)last.current=data.messages.at(-1)!;setFailed(false);}catch(error){if(!controller.signal.aborted){if(error instanceof GroupRequestError&&[401,403,404].includes(error.status)){denied=true;setRevoked(true);setRows([]);setBody('');last.current=null;request.current=null;}setFailed(true);}}finally{active.current=false;if(!controller.signal.aborted)setLoading(false);}}
  void read();const timer=setInterval(()=>void read(),3000);return()=>{controller.abort();clearInterval(timer);};
 },[apiRequest,id]);
 async function send(event:FormEvent){event.preventDefault();if(revoked||sending||!body.trim())return;setSending(true);setFailed(false);if(request.current?.body!==body)request.current={body,id:crypto.randomUUID()};try{await apiRequest(`/api/me/social/conversations/${id}/messages`,{method:'POST',body:JSON.stringify({text:body,requestId:request.current.id})});setBody('');request.current=null;}catch(error){if(error instanceof GroupRequestError&&[401,403,404].includes(error.status)){setRevoked(true);setRows([]);setBody('');last.current=null;request.current=null;}setFailed(true);}finally{setSending(false);}}
 if(revoked)return <><h2>{chat?.nickname??t.dm}</h2><div className={styles.placeholder} role='alert'><Shield size={32} aria-hidden='true'/><p>{s.cannotSend}</p></div></>;
 return <><h2>{chat?.nickname??t.dm}</h2>{chat?.status==='incoming_request'&&<div className={styles.actions}><FanAction disabled={pending} onClick={()=>onResolve('accept')}>{t.accept}</FanAction><FanAction disabled={pending} onClick={()=>onResolve('reject')}>{t.reject}</FanAction></div>}{chat?.status==='outgoing_request'&&<FanAction disabled={pending} onClick={()=>onResolve('cancel')}>{t.cancel}</FanAction>}
 <div className={styles.messages} role="log" aria-label={t.dm}>{loading?<p role="status">{t.loading}</p>:rows.length===0?<p>{t.noMessages}</p>:rows.map(m=><article className={m.isMine?styles.mine:styles.message} key={m.id}><p>{m.text}</p><small>{m.isMine?s.mine:chat?.nickname} · {new Intl.DateTimeFormat(locale,{dateStyle:'short',timeStyle:'short'}).format(new Date(m.createdAt))}</small></article>)}</div>
 {failed&&<p role="alert" className={styles.error}>{t.error}</p>}
 {chat?.canSend&&!revoked?<form onSubmit={send} className={styles.compose}><label>{t.messageLabel}<textarea maxLength={2000} required value={body} disabled={sending} onChange={e=>setBody(e.target.value)} placeholder={t.messagePlaceholder}/></label><FanAction type="submit" variant="primary" disabled={sending||!body.trim()}>{t.send}</FanAction></form>:<p>{s.cannotSend}</p>}
 </>;
}
