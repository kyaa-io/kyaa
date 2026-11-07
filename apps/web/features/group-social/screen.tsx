"use client";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { UsersRound, MessageCircle, Shield, Search, Settings, ArrowLeft } from "lucide-react";
import { FanAppFrame } from "@/components/fan-shell/fan-app-shell";
import { FanAction } from "@/components/fan-ui/fan-action";
import { GroupRequestError,useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { groupInvitationCopy } from "@/features/groups/ui/group-invitation-copy";
import { groupsCopy } from "@/features/groups/ui/copy";
import { waveFriendsCopy } from "@/i18n/catalogs/features__fanpage__wave-friends";
import type { AppLocale } from "@/i18n/locales";
import type { LocalSocialMediaPreview } from "./media-preview";
import { Conversation, ConversationAvatar as Avatar, parseConversations } from "./conversation";
import { dmReason, dmStateOf, reachSchema } from "./profile-reach";
import { SocialSettingsPanel } from "./settings-panel";
import { socialPrivacyCopy } from "./privacy-copy";
import { socialCopy,incomingMessageRequest,recentConversationCopy,socialNavigationCopy } from "./copy";
import styles from "./social.module.css";
import {FanLockedRows} from "@/components/fan-ui/fan-locked-value";
import {GuestLoginAction} from "@/features/my/ui/guest-login";
import {GroupReferralAction} from '@/features/groups/ui/group-referral-screen';
import {groupReferralCopy} from '@/features/groups/ui/group-referral-copy';
import {ProfileConnectionPanel} from "./profile-connection";
import {SourceStatePanel} from "@/features/groups/ui/source-state-panel";
import {socialFriendToken} from "./profile-link";
import {reachText} from "./reach-copy";
import {FanSkeletonRows} from "@/components/fan-ui/fan-skeleton";
const ANSWER_CHECK_MS=5000;
const friend=z.object({id:z.uuid(),profileId:z.uuid(),nickname:z.string(),avatarUrl:z.string().nullable(),status:z.enum(['friends','incoming','outgoing'])});
const friends=z.object({friendships:z.array(friend)});
const profile=z.object({profile:z.object({id:z.uuid(),nickname:z.string(),avatarUrl:z.string().nullable()}),relationship:z.object({friendshipId:z.uuid().nullable(),status:z.string()}),dm:z.object({conversationId:z.uuid().nullable(),status:z.string(),canSend:z.boolean()}),capabilities:z.object({canRequestFriend:z.boolean(),canRequestDm:z.boolean(),canBlock:z.boolean()}),commonFavorites:z.array(z.object({name:z.string()})).optional(),isSelf:z.boolean().optional(),reach:reachSchema});
const blocks=z.object({profiles:z.array(z.object({profileId:z.uuid(),nickname:z.string(),avatarUrl:z.string().nullable(),blockedAt:z.string()}))});
const parseBlocks=(v:unknown)=>blocks.parse(v);
const settings=z.object({favoriteSlugs:z.array(z.string()),dmPolicy:z.enum(['friends','requests','none'])});
const parseFriends=(v:unknown)=>friends.parse(v),parseProfile=(v:unknown)=>profile.parse(v),parseSettings=(v:unknown)=>settings.parse(v);
export function GroupSocialScreen(props:{locale:AppLocale;profileId?:string;conversationId?:string;friendFilter?:'friends'|'incoming'|'outgoing';localMediaPreview?:LocalSocialMediaPreview}) {
 const auth=useGroupRequest();return <GroupSocialContent key={auth.ownerKey} {...props}/>;
}
function GroupSocialContent({locale,profileId:initialProfile,conversationId:initialConversation,friendFilter:initialFilter='friends',localMediaPreview}:{locale:AppLocale;profileId?:string;conversationId?:string;friendFilter?:'friends'|'incoming'|'outgoing';localMediaPreview?:LocalSocialMediaPreview}) {
 const t=waveFriendsCopy(locale),s=socialCopy(locale),p=socialPrivacyCopy(locale),g=groupsCopy(locale),auth=useGroupRequest();
 const base='/api/me/social'; const apiLocale=locale==='ko'?'ko':'en';
 const people=useGroupResource(auth.authenticated?`${base}/friends?locale=${apiLocale}`:null,parseFriends);
 const chats=useGroupResource(auth.authenticated?`${base}/conversations`:null,parseConversations);
 const blockList=useGroupResource(auth.authenticated?`${base}/blocks`:null,parseBlocks);
 const [settingsOpen,setSettingsOpen]=useState(false),[linkedToken,setLinkedToken]=useState<string|null>(null);
 useEffect(()=>{const read=()=>{const query=new URLSearchParams(location.search);setLinkedToken(query.has("friend")?socialFriendToken(location.href,location.origin)??"invalid":null);};read();window.addEventListener("popstate",read);return()=>window.removeEventListener("popstate",read);},[]);
 const closeLinkedProfile=()=>{setLinkedToken(null);const url=new URL(location.href);url.searchParams.delete("friend");history.replaceState(history.state,"",url.pathname+url.search+url.hash);};
 const [search,setSearch]=useState('');
 const [friendFilter,setFriendFilter]=useState<'friends'|'incoming'|'outgoing'>(initialFilter);
 useEffect(()=>setFriendFilter(initialFilter),[initialFilter]);
 const [justBlocked,setJustBlocked]=useState<string[]>([]);
 const privacy=useGroupResource(auth.authenticated?`${base}/settings`:null,parseSettings);
 const [selection,setSelection]=useState({owner:auth.ownerKey,profileId:initialProfile,conversationId:initialConversation});
 const selected=selection.owner===auth.ownerKey?selection:{profileId:undefined,conversationId:undefined};
 const detailProfileId=selected.profileId??chats.data?.conversations.find(chat=>chat.id===selected.conversationId)?.profileId;
 const person=useGroupResource(auth.authenticated&&detailProfileId?`${base}/profiles/${detailProfileId}?locale=${apiLocale}`:null,parseProfile);
 const [pending,setPending]=useState(false),[failed,setFailed]=useState(false),[limited,setLimited]=useState(false),[firstMessage,setFirstMessage]=useState('');
 const [confirmed,setConfirmed]=useState<{kind:'friend'|'dm';nickname:string;text?:string}|null>(null);
 const attempt=useRef<{signature:string;id:string}|null>(null);
 async function change(url:string,input:Record<string,unknown>,method='POST') {
  if(pending)return;setPending(true);setFailed(false);
  const signature=JSON.stringify({url,input,method});if(attempt.current?.signature!==signature)attempt.current={signature,id:crypto.randomUUID()};
  try {const result=await auth.request(url,{method,body:JSON.stringify({...input,...(method==='PATCH'&&url.endsWith('/settings')?{}:{requestId:attempt.current.id})})});attempt.current=null;if(url===`${base}/friends`&&method==='POST'&&person.data&&person.data.profile.id===input.profileId)setConfirmed({kind:'friend',nickname:person.data.profile.nickname});if(url.endsWith('/blocks')&&method==='POST')setJustBlocked(ids=>[...ids,String(input.profileId)]);if(url.startsWith(`${base}/blocks/`)&&method==='DELETE')setJustBlocked(ids=>ids.filter(id=>id!==url.split('/').at(-1))); blockList.retry();people.retry();chats.retry();person.retry();privacy.retry();return result;}
  catch(error){setFailed(true);setLimited(error instanceof GroupRequestError&&error.status===429);throw new Error('request failed');}finally{setPending(false);}
 }
 function act(url:string,input:Record<string,unknown>,method='POST') {void change(url,input,method).catch(()=>{});}
 function selectProfile(id:string){setConfirmed(null);setSelection({owner:auth.ownerKey,profileId:id,conversationId:undefined});setFirstMessage('');}
 const matchesSearch=(...values:(string|null|undefined)[])=>values.some(value=>value?.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)));
 // A signed-in owner answered 403 cannot use any of this: the fan gate refuses a sanctioned or disabled account outright, so retrying changes nothing.
 const restricted=people.failure?.status===403||chats.failure?.status===403;
 const visibleFriends=people.data?.friendships.filter(f=>f.status===friendFilter&&matchesSearch(f.nickname));
 const requestStatus=friendFilter==='incoming'?'incoming_request':'outgoing_request';
 const requestOnlyConversation=(c:{status:string;profileId:string})=>c.status===requestStatus&&!people.data?.friendships.some(f=>f.profileId===c.profileId&&f.status===friendFilter);
 const visibleConversations=chats.data?.conversations.filter(c=>(friendFilter==='friends'||requestOnlyConversation(c))&&matchesSearch(c.nickname,c.latestMessage));
 // 보낸 요청은 상대가 수락하면 바로 대화가 열려야 한다. 기다리는 동안 조용히 읽고, 달라졌을 때만 화면을 다시 읽는다. 실패해도 화면을 오류로 바꾸지 않는다.
 const waitingState=chats.data?.conversations.filter(c=>c.status==='outgoing_request').map(c=>c.id).join(',')??'';
 const {request:quietRequest}=auth,refreshChats=useRef(chats.retry);
 useEffect(()=>{refreshChats.current=chats.retry;});
 useEffect(()=>{
  if(!waitingState)return;
  const timer=window.setInterval(()=>{
   if(document.hidden)return;
   void quietRequest(`${base}/conversations`).then(value=>{const now=parseConversations(value).conversations.filter(c=>c.status==='outgoing_request').map(c=>c.id).join(',');if(now!==waitingState)refreshChats.current();}).catch(()=>undefined);
  },ANSWER_CHECK_MS);
  return()=>window.clearInterval(timer);
 },[waitingState,quietRequest]);
 const mobileConversation=Boolean(selected.profileId||selected.conversationId);
 const backToList=()=>setSelection({owner:auth.ownerKey,profileId:undefined,conversationId:undefined});
 const currentChat=chats.data?.conversations.find(c=>c.id===selected.conversationId);
 async function requestConversation(event:FormEvent) {event.preventDefault();if(!person.data||!firstMessage.trim())return;try{const result=z.object({id:z.uuid()}).parse(await change(`${base}/conversations`,{profileId:person.data.profile.id,text:firstMessage}));setConfirmed({kind:'dm',nickname:person.data.profile.nickname,text:firstMessage});setSelection({owner:auth.ownerKey,profileId:undefined,conversationId:result.id});setFirstMessage('');}catch{}}
 const friendTabs=(counted:boolean)=><div className={styles.filters} aria-label={t.title}>{(['friends','incoming','outgoing'] as const).map(status=><button key={status} aria-pressed={friendFilter===status} onClick={()=>setFriendFilter(status)}>{status==='friends'?t.title:status==='incoming'?socialNavigationCopy[locale][1]:socialNavigationCopy[locale][2]}{counted?<> {(people.data?.friendships.filter(item=>item.status===status).length??0)+(status==='friends'?0:chats.data?.conversations.filter(c=>c.status===(status==='incoming'?'incoming_request':'outgoing_request')&&!people.data?.friendships.some(f=>f.profileId===c.profileId&&f.status===status)).length??0)}</>:null}</button>)}</div>;
 return <FanAppFrame locale={locale} className={styles.frame} currentPath="/my/friends" mainId="group-social-main" groupsEnabled><main id="group-social-main" className={styles.page} data-mobile-conversation={mobileConversation}>
 <nav className={styles.breadcrumb} aria-label="MY">MY / {s.title}</nav>
 {!auth.ready?<p role="status">{t.loading}</p>:!auth.authenticated?<div className={styles.layout}><section aria-label={t.title} className={styles.people}><div className={styles.peopleTools}><div className={styles.peopleHeader}><h1>{t.messageLabel}</h1></div>{friendTabs(false)}</div><FanLockedRows rows={3}/><GuestLoginAction locale={locale} returnTo={`/my/friends?locale=${locale}${linkedToken&&linkedToken!=="invalid"?`&friend=${linkedToken}`:""}`} variant="primary" fullWidth/></section></div>:<>
 {failed&&<SourceStatePanel title={limited?groupInvitationCopy(locale).limited:t.error} description={limited?undefined:t.error} role="alert"/>}
 {confirmed&&<SourceStatePanel sourceId={confirmed.kind==='friend'?'m5aSk':'JI7Qt'} title={locale==='ko'?confirmed.kind==='friend'?'친구 요청 보냄':'대화 요청 보냄':t.pending} description={<><p>{confirmed.nickname} · {t.pending}</p>{confirmed.text&&<blockquote>{confirmed.text}</blockquote>}</>} icon={<MessageCircle size={24}/>} role="status" actions={[{label:locale==='ko'?confirmed.kind==='friend'?'친구 목록으로':'대화 목록으로':t.back,onClick:()=>{setConfirmed(null);backToList();},variant:'primary'}]}/>}
 <div className={styles.layout}>
 <section aria-label={t.title} className={styles.people}>
 <div className={styles.peopleTools}><div className={styles.peopleHeader}><h1>{t.messageLabel}</h1>{!(!people.loading&&!people.error&&friendFilter==='friends'&&!search&&visibleFriends?.length===0)&&<GroupReferralAction locale={locale}/>}{privacy.data&&<button aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(true)} className={styles.settingsLink}><span>{socialNavigationCopy[locale][0]}</span><Settings size={18} aria-hidden/></button>}</div><label className={styles.search}><input type="search" aria-label={locale==='ko'?'친구·대화 검색':`${t.title} · ${g.search}`} placeholder={locale==='ko'?'친구·대화 검색':`${t.title} · ${g.search}`} value={search} onChange={event=>setSearch(event.target.value)}/><Search size={22} aria-hidden/></label>
 {friendTabs(true)}
 </div>{people.loading?<FanSkeletonRows rows={3} variant="member" ariaLabel={t.loading}/>:restricted?<SourceStatePanel fill title={reachText(locale,"accountRestricted")} icon={<Shield size={24}/>} role="alert"/>:people.error?<FanAction onClick={people.retry}>{t.retry}</FanAction>:visibleFriends?.length===0&&!(friendFilter!=='friends'&&chats.data?.conversations.some(c=>c.status===(friendFilter==='incoming'?'incoming_request':'outgoing_request')))?<SourceStatePanel fill sourceId={friendFilter==='friends'&&!search?'qIcNQ':undefined} title={search?reachText(locale,'emptySearch'):friendFilter==='incoming'?reachText(locale,'emptyIncoming'):friendFilter==='outgoing'?reachText(locale,'emptyOutgoing'):locale==='ko'?'아직 친구가 없어요':s.empty} illustration={friendFilter==='friends'&&!search?'people':'search'} size='compact' role='status' actions={friendFilter==='friends'&&!search?[{label:groupReferralCopy(locale).invite,href:`/my/invitations?locale=${locale}&invite=1`}]:[]}/>:visibleFriends?.filter(f=>friendFilter!=='friends'||!chats.data?.conversations.some(chat=>chat.profileId===f.profileId)).map(f=><article className={styles.row} key={f.id}>{f.status==='incoming'&&<SourceStatePanel sourceId='o44v7C' title={locale==='ko'?'받은 친구 요청':t.incoming} icon={<UsersRound size={24}/>} actions={[{label:locale==='ko'?'프로필 보기':s.profile,onClick:()=>selectProfile(f.profileId)},{label:t.accept,disabled:pending,onClick:()=>act(`${base}/friends/${f.id}`,{action:'accept'},'PATCH'),variant:'primary'},{label:t.reject,disabled:pending,onClick:()=>act(`${base}/friends/${f.id}`,{action:'reject'},'PATCH')}] }><div className={styles.person}><Avatar url={f.avatarUrl}/><strong>{f.nickname}</strong></div></SourceStatePanel>}{f.status!=='incoming'&&<>
 <button className={styles.person} onClick={()=>selectProfile(f.profileId)}><Avatar url={f.avatarUrl}/><span><strong>{f.nickname}</strong>{f.status!=='friends'&&<small>{t.outgoing}</small>}</span></button>
 <div className={styles.actions}>{f.status==='outgoing'?<FanAction disabled={pending} onClick={()=>act(`${base}/friends/${f.id}`,{action:'cancel'},'PATCH')}>{t.cancel}</FanAction>:<FanAction variant='text' onClick={()=>selectProfile(f.profileId)}>{locale==='ko'?'프로필 보기':s.profile}</FanAction>}</div></>}</article>)}
 {friendFilter==='friends'&&Boolean(visibleConversations?.length)&&<h2 className={styles.recentTitle}>{recentConversationCopy[locale]}</h2>}
 {chats.loading?<FanSkeletonRows rows={3} variant="member" ariaLabel={t.loading}/>:restricted?null:chats.error?<FanAction onClick={chats.retry}>{t.retry}</FanAction>:visibleConversations?.map(c=><Fragment key={c.id}><button className={styles.chatRow} aria-pressed={selected.conversationId===c.id} onClick={()=>setSelection({owner:auth.ownerKey,profileId:undefined,conversationId:c.id})}><Avatar url={c.avatarUrl}/><span><strong>{c.nickname}</strong>{(c.status==='incoming_request'?(friendFilter==='incoming'?c.latestMessage:incomingMessageRequest[locale]):c.status==='outgoing_request'?t.pending:c.latestMessage??t.noMessages)&&<small>{c.status==='incoming_request'?(friendFilter==='incoming'?c.latestMessage:incomingMessageRequest[locale]):c.status==='outgoing_request'?t.pending:c.latestMessage??t.noMessages}</small>}</span>{Boolean(c.unreadCount)&&<span className={styles.unread} aria-label={`${t.messageLabel} ${c.unreadCount}`}>{c.unreadCount}</span>}</button>{c.status==='incoming_request'&&friendFilter==='incoming'&&<div className={styles.actions}><FanAction variant='primary' disabled={pending} onClick={()=>act(`${base}/conversations/${c.id}`,{action:'accept'},'PATCH')}>{t.accept}</FanAction><FanAction disabled={pending} onClick={()=>act(`${base}/conversations/${c.id}`,{action:'reject'},'PATCH')}>{t.reject}</FanAction></div>}</Fragment>)}
 </section>
 <section className={styles.detail} aria-live="polite">{selected.profileId&&<FanAction variant="text" className={styles.backToList} onClick={backToList} ariaLabel={t.back} leadingIcon={<ArrowLeft size={20}/>}/>}
 {selected.profileId?(justBlocked.includes(selected.profileId)||blockList.data?.profiles.some(item=>item.profileId===selected.profileId)?<SourceStatePanel fill sourceId='a1h4W' title={p.blocked} description={s.cannotSend} icon={<Shield size={24}/>} actions={[{label:({ko:'차단 해제',en:'Unblock',ja:'ブロック解除','zh-Hans':'取消屏蔽','zh-Hant':'解除封鎖',es:'Desbloquear',id:'Buka blokir',vi:'Bỏ chặn',th:'เลิกบล็อก',pt:'Desbloquear',fr:'Débloquer',ru:'Разблокировать'}[locale]),disabled:pending,onClick:()=>act(`${base}/blocks/${selected.profileId}`,{},'DELETE'),variant:'primary'}]}/>:person.loading?<FanSkeletonRows rows={3} variant="member" ariaLabel={t.loading}/>:person.error?<FanAction onClick={person.retry}>{t.retry}</FanAction>:person.data&&<>
 <div className={styles.profile}><Avatar url={person.data.profile.avatarUrl}/><h2>{person.data.profile.nickname}</h2></div>
 <div className={styles.actions}>{person.data.capabilities.canRequestFriend&&<FanAction disabled={pending} variant="primary" onClick={()=>act(`${base}/friends`,{profileId:person.data!.profile.id})}>{t.requestFriend}</FanAction>}
 {person.data.relationship.status==='friends'&&<FanAction disabled={pending} onClick={()=>act(`${base}/friends/${person.data!.relationship.friendshipId}`,{action:'unfriend'},'PATCH')}>{s.unfriend}</FanAction>}
 {person.data.capabilities.canBlock&&<FanAction disabled={pending} onClick={()=>act(`${base}/blocks`,{profileId:person.data!.profile.id})}>{s.block}</FanAction>}
 {person.data.dm.conversationId&&<FanAction onClick={()=>setSelection({owner:auth.ownerKey,profileId:undefined,conversationId:person.data!.dm.conversationId!})}>{t.dm}</FanAction>}</div>
 {!person.data.dm.conversationId&&!person.data.capabilities.canRequestDm&&dmReason(locale,dmStateOf(person.data))&&<p className={styles.dmReason}>{dmReason(locale,dmStateOf(person.data))}</p>}
 {!person.data.dm.conversationId&&person.data.capabilities.canRequestDm&&<form onSubmit={requestConversation} className={styles.compose}><label>{t.messageLabel}<textarea maxLength={1000} required value={firstMessage} onChange={e=>setFirstMessage(e.target.value)} disabled={pending}/></label><FanAction type="submit" disabled={pending||!firstMessage.trim()} variant="primary">{s.messageRequest}</FanAction></form>}
 </>):selected.conversationId?(currentChat&&(justBlocked.includes(currentChat.profileId)||blockList.data?.profiles.some(item=>item.profileId===currentChat.profileId))?<div className={styles.placeholder}><Shield aria-hidden size={36}/><h2>{p.blocked}</h2><p>{s.cannotSend}</p></div>:<Conversation isFriend={people.data?.friendships.some(item=>item.profileId===currentChat?.profileId&&item.status==='friends')??false} key={`${auth.ownerKey}:${selected.conversationId}`} locale={locale} id={selected.conversationId} conversation={currentChat} localMediaPreview={localMediaPreview} commonFavorites={person.data?.commonFavorites?.map(item=>item.name)} onBack={backToList} onProfile={currentChat?()=>selectProfile(currentChat.profileId):undefined} onBlock={currentChat?()=>act(`${base}/blocks`,{profileId:currentChat.profileId}):undefined} onResolve={(action)=>act(`${base}/conversations/${selected.conversationId}`,{action},'PATCH')} pending={pending}/>):<div className={styles.placeholder}><MessageCircle aria-hidden size={36}/><p>{t.dm}</p></div>}
 </section></div>
 {linkedToken!==null&&<ProfileConnectionPanel locale={locale} identity={null} initialToken={linkedToken} onClose={closeLinkedProfile} onFriendChanged={people.retry}/>}
 {privacy.data&&settingsOpen&&<SocialSettingsPanel locale={locale} value={privacy.data} pending={pending} failed={failed} onClose={()=>setSettingsOpen(false)} onSave={value=>{void change(`${base}/settings`,value,'PATCH').then(()=>setSettingsOpen(false)).catch(()=>{});}}/>}
 </>}
 </main></FanAppFrame>;
}
